export interface McpServerEntry {
  name: string;
  transport: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  description?: string;
}

export interface McpRegistryData {
  servers: McpServerEntry[];
}
