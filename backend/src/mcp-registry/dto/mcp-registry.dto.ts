export interface McpServerEntry {
  name: string;
  transport: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  description?: string;
  isStandard?: boolean;
}

export interface McpRegistryData {
  servers: McpServerEntry[];
}
