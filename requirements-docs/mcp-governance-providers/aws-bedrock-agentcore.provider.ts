import { Injectable, Logger } from '@nestjs/common';
import {
  BedrockAgentCoreControlClient,
  ListAgentRuntimesCommand,
  GetAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';
import { IMcpRegistryProvider } from '../core/provider.interface';
import { McpServerEntry, ListServersOptions } from '../dto/mcp-registry.dto';

export interface AwsBedrockAgentCoreProviderOptions {
  /** AWS region the AgentCore runtimes live in, e.g. `us-west-2`. */
  region: string;

  /**
   * Qualifier (endpoint name) to target. Usually `DEFAULT` or a
   * version-pinned endpoint you maintain. Applied to every generated URL.
   */
  qualifier?: string;

  /**
   * Pre-initialized control-plane client (for tests). If omitted, the
   * provider constructs one using the default AWS credential chain.
   */
  client?: BedrockAgentCoreControlClient;

  /**
   * Custom endpoint override. Useful for sovereign regions or PrivateLink.
   * Defaults to the standard `bedrock-agentcore.{region}.amazonaws.com`.
   */
  dataPlaneEndpoint?: string;

  /**
   * How to fill the Authorization header in generated entries. AgentCore
   * accepts either AWS SigV4 (IAM) or OAuth bearer tokens. Since SigV4
   * must be computed per-request, only a placeholder makes sense at
   * registry time — the consumer signs the outgoing request. For OAuth
   * (Cognito / Okta / Entra ID) a bearer placeholder works.
   */
  authMode?: 'sigv4' | 'bearer';

  /**
   * Placeholder used when `authMode: 'bearer'`. Default keeps things
   * consistent with the other providers.
   */
  bearerPlaceholder?: string;

  /**
   * Only include runtimes whose status is in this list. Default: ['READY'].
   * Use `['*']` to include every status.
   */
  allowedStatuses?: string[];
}

/**
 * Discovers AWS Bedrock AgentCore Runtimes that host MCP servers and
 * surfaces them through the common provider contract.
 *
 * AgentCore Runtime is a *hosting* platform — you deploy MCP servers as
 * ARM64 containers and AWS runs them in session-isolated microVMs. This
 * provider does not create runtimes; it enumerates what's already
 * deployed and resolves connection details so your agent can invoke them.
 *
 * Because the runtime invocation URL is constructed deterministically
 * from the runtime ARN, the provider can return full connection details
 * after a single ListAgentRuntimes + optional GetAgentRuntime call.
 *
 * Notes on authentication:
 * - SigV4 (IAM) is the default and cannot be resolved at registry time.
 *   The provider sets a sentinel placeholder `${aws-sigv4}` in the
 *   Authorization header; your runtime must swap that for a signed
 *   request at call time. Most Node HTTP stacks have a signer.
 * - OAuth bearer mode produces a `${kv:...}` placeholder that flows
 *   through the normal SecretResolverChain.
 */
@Injectable()
export class AwsBedrockAgentCoreProvider implements IMcpRegistryProvider {
  readonly id = 'aws-bedrock-agentcore';
  private readonly logger = new Logger(AwsBedrockAgentCoreProvider.name);
  private readonly client: BedrockAgentCoreControlClient;
  private readonly qualifier: string;
  private readonly dataPlaneEndpoint: string;
  private readonly authMode: 'sigv4' | 'bearer';
  private readonly bearerPlaceholder: string;
  private readonly allowedStatuses: Set<string>;

  constructor(private readonly options: AwsBedrockAgentCoreProviderOptions) {
    this.client =
      options.client ??
      new BedrockAgentCoreControlClient({ region: options.region });
    this.qualifier = options.qualifier ?? 'DEFAULT';
    this.dataPlaneEndpoint =
      options.dataPlaneEndpoint ??
      `https://bedrock-agentcore.${options.region}.amazonaws.com`;
    this.authMode = options.authMode ?? 'sigv4';
    this.bearerPlaceholder =
      options.bearerPlaceholder ?? '${kv:agentcore-bearer-token}';
    this.allowedStatuses = new Set(options.allowedStatuses ?? ['READY']);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // A zero-cost way to confirm credentials + region are wired up.
      await this.client.send(new ListAgentRuntimesCommand({ maxResults: 1 }));
      return true;
    } catch (err: any) {
      this.logger.warn(`AgentCore control plane unreachable: ${err.message}`);
      return false;
    }
  }

  async listServers(options: ListServersOptions = {}): Promise<McpServerEntry[]> {
    const runtimes = await this.listAllRuntimes();
    const candidates = runtimes.filter((r) => this.isIncludedStatus(r.status));

    // ListAgentRuntimes doesn't return protocol info, so we need a
    // GetAgentRuntime call per runtime to filter to MCP-only. We do this
    // in parallel but cap concurrency with a small pool to stay polite.
    const detailed = await this.mapWithConcurrency(candidates, 5, (r) =>
      this.describe(r),
    );

    return detailed
      .filter((d): d is McpServerEntry => d !== null)
      .filter((d) => this.matchesFilter(d, options));
  }

  async getServer(name: string): Promise<McpServerEntry | null> {
    const all = await this.listServers();
    return all.find((s) => s.name === name) ?? null;
  }

  // --- internals ---

  private async listAllRuntimes(): Promise<RuntimeSummary[]> {
    const out: RuntimeSummary[] = [];
    let nextToken: string | undefined;
    do {
      const resp = await this.client.send(
        new ListAgentRuntimesCommand({ maxResults: 100, nextToken }),
      );
      for (const r of resp.agentRuntimes ?? []) {
        if (r.agentRuntimeArn && r.agentRuntimeName) {
          out.push({
            arn: r.agentRuntimeArn,
            id: r.agentRuntimeId ?? '',
            name: r.agentRuntimeName,
            version: r.agentRuntimeVersion,
            description: r.description,
            status: r.status,
            lastUpdatedAt: r.lastUpdatedAt?.toString(),
          });
        }
      }
      nextToken = resp.nextToken;
    } while (nextToken);
    return out;
  }

  private async describe(r: RuntimeSummary): Promise<McpServerEntry | null> {
    try {
      const resp = await this.client.send(
        new GetAgentRuntimeCommand({
          agentRuntimeId: r.id,
          agentRuntimeVersion: r.version,
        }),
      );
      const protocol = resp.protocolConfiguration?.serverProtocol;
      if (protocol !== 'MCP') return null;

      return {
        name: r.name,
        description: resp.description ?? r.description,
        transport: 'http',
        url: this.buildInvocationUrl(r.arn),
        headers: this.buildHeaders(),
        providerId: this.id,
        metadata: {
          version: r.version,
          lifecycle: r.status,
          owner: resp.roleArn,
          agentRuntimeArn: r.arn,
          agentRuntimeId: r.id,
          qualifier: this.qualifier,
          region: this.options.region,
          authMode: this.authMode,
        },
      };
    } catch (err: any) {
      this.logger.warn(
        `Failed to describe AgentCore runtime '${r.name}': ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Construct the invocation URL per AgentCore spec. The ARN must be
   * URL-encoded — colons and slashes stay readable to AWS but need
   * percent-encoding for the HTTP client.
   */
  private buildInvocationUrl(arn: string): string {
    const encoded = encodeURIComponent(arn);
    return `${this.dataPlaneEndpoint}/runtimes/${encoded}/invocations?qualifier=${encodeURIComponent(
      this.qualifier,
    )}`;
  }

  private buildHeaders(): Record<string, string> {
    if (this.authMode === 'bearer') {
      return { Authorization: `Bearer ${this.bearerPlaceholder}` };
    }
    // SigV4: the placeholder is a signal to the runtime to sign the
    // request before sending. It should never reach the wire as-is.
    return { Authorization: '${aws-sigv4}' };
  }

  private isIncludedStatus(status?: string): boolean {
    if (this.allowedStatuses.has('*')) return true;
    return !!status && this.allowedStatuses.has(status);
  }

  private matchesFilter(
    entry: McpServerEntry,
    options: ListServersOptions,
  ): boolean {
    if (options.environment && entry.metadata?.environment !== options.environment) {
      return false;
    }
    if (options.query) {
      const q = options.query.toLowerCase();
      const hay = `${entry.name} ${entry.description ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    });
    await Promise.all(workers);
    return results;
  }
}

interface RuntimeSummary {
  arn: string;
  id: string;
  name: string;
  version?: string;
  description?: string;
  status?: string;
  lastUpdatedAt?: string;
}
