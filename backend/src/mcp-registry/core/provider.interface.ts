import { McpServerEntry, ListServersOptions } from '../dto/mcp-registry.dto';

/**
 * Every MCP registry provider must implement this interface. It is
 * deliberately small — read-only discovery plus a freshness signal.
 *
 * Write operations (register/update/delete) intentionally live on
 * provider-specific subinterfaces. Azure API Center and Composio both
 * support them, the JSON provider does not, and pushing them onto the
 * base interface would force every consumer to handle "not supported"
 * errors.
 */
export interface IMcpRegistryProvider {
  /** Stable identifier, e.g. `json-file`, `azure-api-center`, `composio`. */
  readonly id: string;

  /** Whether the provider is currently reachable / configured. */
  isAvailable(): Promise<boolean>;

  /**
   * List all servers this provider knows about. Entries MUST contain
   * unresolved placeholders — secret resolution happens later.
   */
  listServers(options?: ListServersOptions): Promise<McpServerEntry[]>;

  /** Get one server by name. Returns `null` if unknown. */
  getServer(name: string): Promise<McpServerEntry | null>;
}

/** Providers that support writes implement this additionally. */
export interface IMutableMcpRegistryProvider extends IMcpRegistryProvider {
  registerServer(entry: McpServerEntry): Promise<McpServerEntry>;
  updateServer(name: string, patch: Partial<McpServerEntry>): Promise<McpServerEntry>;
  deleteServer(name: string): Promise<void>;
}
