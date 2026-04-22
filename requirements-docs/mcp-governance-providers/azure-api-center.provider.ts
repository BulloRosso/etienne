import { Injectable, Logger } from '@nestjs/common';
import { DefaultAzureCredential, TokenCredential } from '@azure/identity';
import { IMcpRegistryProvider } from '../core/provider.interface';
import { McpServerEntry, ListServersOptions } from '../dto/mcp-registry.dto';

export interface AzureApiCenterProviderOptions {
  /**
   * Base data-plane endpoint, e.g.
   *   https://my-apic.data.westeurope.azure-apicenter.ms
   *
   * IMPORTANT: pass the BASE URL only. Do NOT include `/v0.1/servers` —
   * that path is appended internally. API Center has strict URL validation
   * at the `/v0.1/servers` endpoint and extra segments cause 401/404.
   */
  endpoint: string;

  /** Custom credential (for tests). Defaults to DefaultAzureCredential. */
  credential?: TokenCredential;

  /**
   * If the registry is configured for anonymous access (required for
   * GitHub Copilot and some VS Code setups), set this to `true` to skip
   * the auth header entirely.
   */
  anonymous?: boolean;

  /** Resource scope for token acquisition. Default is audience for API Center data plane. */
  scope?: string;
}

/**
 * Azure API Center registry provider.
 *
 * Implements the MCP Registry v0.1 spec consumer side: calls
 * `GET {endpoint}/v0.1/servers` and maps the response to McpServerEntry.
 *
 * Runtime credentials are NOT exposed here — the intent is that clients
 * connect to the Azure API Management gateway URL, which enforces auth
 * via Entra ID JWT or subscription keys. If you want to override per-server
 * headers (for example because the gateway expects `Ocp-Apim-Subscription-Key`
 * from a Key Vault-backed placeholder), pass an override map through the
 * AggregatingRegistry rather than hardcoding here.
 */
@Injectable()
export class AzureApiCenterProvider implements IMcpRegistryProvider {
  readonly id = 'azure-api-center';
  private readonly logger = new Logger(AzureApiCenterProvider.name);
  private readonly credential: TokenCredential;
  private readonly scope: string;
  private cachedToken?: { token: string; expiresAt: number };

  constructor(private readonly options: AzureApiCenterProviderOptions) {
    this.credential = options.credential ?? new DefaultAzureCredential();
    this.scope = options.scope ?? 'https://azure-apicenter.net/.default';
    if (options.endpoint.includes('/v0.1/')) {
      throw new Error(
        `AzureApiCenterProvider.endpoint must be the BASE URL — ` +
          `do not include /v0.1/servers. Got: ${options.endpoint}`,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(this.buildUrl('/v0.1/servers'), {
        method: 'HEAD',
        headers: await this.authHeaders(),
      });
      return res.ok || res.status === 405; // 405 if HEAD not allowed
    } catch {
      return false;
    }
  }

  async listServers(options: ListServersOptions = {}): Promise<McpServerEntry[]> {
    const url = new URL(this.buildUrl('/v0.1/servers'));
    if (options.query) url.searchParams.set('search', options.query);

    const res = await fetch(url.toString(), { headers: await this.authHeaders() });
    if (!res.ok) {
      throw new Error(
        `Azure API Center listServers failed: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as ApiCenterServersResponse;
    const entries = (body.servers ?? []).map((s) => this.mapEntry(s));
    return entries.filter((e) => this.matches(e, options));
  }

  async getServer(name: string): Promise<McpServerEntry | null> {
    // API Center's v0.1 spec exposes per-server GET at /v0.1/servers/{id}
    // but the registry ids are not the same as the human-friendly name.
    // Cheapest portable implementation: list and filter. For large catalogs,
    // override with an explicit index lookup.
    const all = await this.listServers();
    return all.find((s) => s.name === name) ?? null;
  }

  // --- internals ---

  private buildUrl(path: string): string {
    return `${this.options.endpoint.replace(/\/$/, '')}${path}`;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.options.anonymous) return headers;

    const token = await this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async getToken(): Promise<string | undefined> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token;
    }
    const tokenResp = await this.credential.getToken(this.scope);
    if (!tokenResp) return undefined;
    this.cachedToken = {
      token: tokenResp.token,
      expiresAt: tokenResp.expiresOnTimestamp,
    };
    return tokenResp.token;
  }

  /**
   * Map from the v0.1 spec shape to our canonical entry. The spec uses
   * `remotes: [{ transport_type, url }]` rather than a flat `url` field.
   */
  private mapEntry(s: ApiCenterServer): McpServerEntry {
    const remote = s.remotes?.[0];
    return {
      name: s.name,
      description: s.description,
      transport: (remote?.transport_type as any) ?? 'http',
      url: remote?.url,
      providerId: this.id,
      metadata: {
        environment: s.environment,
        version: s.version,
        lifecycle: s.lifecycle,
        owner: s.owner,
        apiCenterId: s.id,
      },
    };
  }

  private matches(entry: McpServerEntry, options: ListServersOptions): boolean {
    if (options.environment && entry.metadata?.environment !== options.environment) {
      return false;
    }
    return true;
  }
}

// --- minimal type definitions for the v0.1 response shape ---
// Kept intentionally narrow; the spec has more fields but we only need these.

interface ApiCenterServersResponse {
  servers?: ApiCenterServer[];
}

interface ApiCenterServer {
  id: string;
  name: string;
  description?: string;
  version?: string;
  environment?: string;
  lifecycle?: string;
  owner?: string;
  remotes?: Array<{
    transport_type: string;
    url: string;
  }>;
}
