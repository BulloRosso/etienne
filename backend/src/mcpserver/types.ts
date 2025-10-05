/**
 * Type definitions for the MCP Server
 *
 * This file contains both SDK types and custom interfaces
 * for the tool service pattern.
 */

// JSON-RPC 2.0 types (for backward compatibility and custom handling)
export interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: McpError;
}

export interface McpError {
  code: number;
  message: string;
  data?: any;
}

// Tool definition types (compatible with MCP SDK)
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

// Tool service interface for registering multiple tools
export interface ToolService {
  tools: McpTool[];
  execute: (toolName: string, args: any) => Promise<any>;
}
