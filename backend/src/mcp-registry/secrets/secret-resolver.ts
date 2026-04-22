import { Logger } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

/**
 * Placeholder syntax supported everywhere:
 *   ${env:VAR_NAME}                → process.env.VAR_NAME
 *   ${kv:secret-name}              → default Key Vault, latest version
 *   ${kv:secret-name@v1}           → pinned version
 *   ${VAR_NAME}                    → legacy shorthand for ${env:VAR_NAME}
 *
 * The legacy form is kept so the existing mcp-server-registry.json keeps
 * working without migration.
 */
const PLACEHOLDER_RE = /\$\{(?:(env|kv):)?([A-Za-z0-9_\-@]+)\}/g;

export interface ISecretResolver {
  readonly scheme: string;
  resolve(key: string): Promise<string | undefined>;
}

/** Reads from process.env. Sync under the hood but exposed as async for uniformity. */
export class EnvSecretResolver implements ISecretResolver {
  readonly scheme = 'env';
  async resolve(key: string): Promise<string | undefined> {
    return process.env[key];
  }
}

/**
 * Fetches secrets from Azure Key Vault on demand and caches them.
 *
 * Key Vault calls are expensive and rate-limited, so caching is not optional
 * in practice. TTL is intentionally short-ish — if you rotate a secret, you
 * want the app to pick it up without a restart.
 */
export class AzureKeyVaultSecretResolver implements ISecretResolver {
  readonly scheme = 'kv';
  private readonly logger = new Logger(AzureKeyVaultSecretResolver.name);
  private readonly client: SecretClient;
  private readonly cache = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    vaultUrl: string,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {
    // DefaultAzureCredential walks: env vars → workload identity →
    // managed identity → Azure CLI → VS Code. Works locally and in Azure
    // without code changes.
    this.client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  }

  async resolve(key: string): Promise<string | undefined> {
    // Support `name@version` pinning.
    const [name, version] = key.split('@');
    const cacheKey = version ? `${name}@${version}` : name;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const secret = await this.client.getSecret(name, version ? { version } : undefined);
      if (secret.value === undefined) return undefined;
      this.cache.set(cacheKey, {
        value: secret.value,
        expiresAt: Date.now() + this.ttlMs,
      });
      return secret.value;
    } catch (err: any) {
      this.logger.error(`Failed to fetch secret '${cacheKey}': ${err.message}`);
      return undefined;
    }
  }

  /** Force-invalidate the cache, e.g. after a rotation webhook. */
  invalidate(name?: string): void {
    if (name) {
      for (const key of this.cache.keys()) {
        if (key === name || key.startsWith(`${name}@`)) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }
}

/**
 * Orchestrates multiple resolvers by scheme. The default `env` resolver is
 * registered automatically; add others with `register()`.
 *
 * `resolveDeep` walks any object/array and substitutes placeholders in
 * string values. Non-string values pass through untouched.
 */
export class SecretResolverChain {
  private readonly resolvers = new Map<string, ISecretResolver>();

  constructor(defaultResolvers: ISecretResolver[] = [new EnvSecretResolver()]) {
    for (const r of defaultResolvers) this.register(r);
  }

  register(resolver: ISecretResolver): void {
    this.resolvers.set(resolver.scheme, resolver);
  }

  /**
   * Resolve placeholders in a single string. Missing secrets leave the
   * placeholder intact by design — the caller decides whether to fail
   * hard or carry on. (Failing hard at this layer makes it very hard to
   * materialize partial configs for debugging.)
   */
  async resolveString(input: string): Promise<string> {
    // Collect all matches first, resolve in parallel, then substitute.
    const matches = [...input.matchAll(PLACEHOLDER_RE)];
    if (matches.length === 0) return input;

    const resolved = await Promise.all(
      matches.map(async (m) => {
        const scheme = m[1] ?? 'env';
        const key = m[2];
        const resolver = this.resolvers.get(scheme);
        if (!resolver) return { match: m[0], value: undefined };
        const value = await resolver.resolve(key);
        return { match: m[0], value };
      }),
    );

    let out = input;
    for (const { match, value } of resolved) {
      if (value !== undefined) out = out.split(match).join(value);
    }
    return out;
  }

  /** Recursively resolve every string in an object/array. */
  async resolveDeep<T>(value: T): Promise<T> {
    if (typeof value === 'string') {
      return (await this.resolveString(value)) as unknown as T;
    }
    if (Array.isArray(value)) {
      return (await Promise.all(value.map((v) => this.resolveDeep(v)))) as unknown as T;
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = await this.resolveDeep(v);
      }
      return out as T;
    }
    return value;
  }
}
