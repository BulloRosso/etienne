/**
 * Canonical shape for one MCP server entry.
 *
 * All providers (JSON / Azure API Center / Composio) must return entries that
 * conform to this shape. Provider-specific metadata lives in `metadata`.
 *
 * Secret values MUST NOT be resolved at this layer. `headers` and `env` may
 * contain placeholders like `${env:FOO}` or `${kv:bar}` that are resolved
 * later by the SecretResolver.
 */
export interface McpServerEntry {
  /** Stable name used by consumers (e.g. `gmail`, `knowledge-graph`). */
  name: string;

  /** Short human-readable description. Safe to log. */
  description?: string;

  /** Transport. Only `http` and `stdio` are common in practice. */
  transport: 'http' | 'stdio' | 'sse';

  /** Remote URL for http/sse transports. */
  url?: string;

  /** Command for stdio transports. */
  command?: string;
  args?: string[];

  /**
   * HTTP headers. Values may contain placeholders (e.g. `Bearer ${kv:gmail-token}`)
   * which are resolved at materialization time.
   */
  headers?: Record<string, string>;

  /** Environment variables for stdio transports. Same placeholder rules. */
  env?: Record<string, string>;

  /** Which provider produced this entry. Useful for debugging and routing. */
  providerId: string;

  /**
   * Governance metadata. Providers fill what they have; consumers treat as
   * informational. This is where the big differences between providers surface.
   */
  metadata?: {
    /** E.g. `dev`, `staging`, `prod`. API Center exposes this natively. */
    environment?: string;
    /** E.g. `v1.0.0`. */
    version?: string;
    /** E.g. `production`, `deprecated`. From API Center lifecycle. */
    lifecycle?: string;
    /** Owner team/person. */
    owner?: string;
    /** Tool-level allowlist, if the provider supports it (Composio does). */
    allowedTools?: string[];
    /** Anything else the provider wants to surface. */
    [key: string]: unknown;
  };
}

export interface McpRegistryData {
  servers: McpServerEntry[];
}

/** Options accepted by `listServers`. */
export interface ListServersOptions {
  /** Filter by environment (if the provider supports it). */
  environment?: string;
  /** Free-text filter over name/description. */
  query?: string;
}
