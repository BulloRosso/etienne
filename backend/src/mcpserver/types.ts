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
  execute: (toolName: string, args: any, elicit?: ElicitationCallback) => Promise<any>;
}

// ============================================
// Elicitation Types (MCP 2025-06-18 spec)
// ============================================

/**
 * Elicitation allows MCP servers to request structured input from users
 * during tool execution, enabling human-in-the-loop workflows.
 */

/**
 * JSON Schema for elicitation - supports flat object structures with primitives
 */
export interface ElicitationSchema {
  type: 'object';
  properties?: Record<string, ElicitationProperty>;
  required?: string[];
}

export interface ElicitationProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  default?: any;
  // String constraints
  minLength?: number;
  maxLength?: number;
  format?: 'email' | 'uri' | 'date' | 'date-time';
  // Number constraints
  minimum?: number;
  maximum?: number;
  // Enum support
  enum?: (string | number)[];
  enumNames?: string[]; // Display labels for enum values
}

/**
 * Result returned from an elicitation request
 */
export interface ElicitationResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, any>; // User-provided data when action is 'accept'
}

/**
 * Callback that tools can use to request user input mid-execution
 */
export type ElicitationCallback = (
  message: string,
  requestedSchema: ElicitationSchema
) => Promise<ElicitationResult>;

/**
 * Internal representation of a pending elicitation request
 */
export interface PendingElicitation {
  id: string;
  message: string;
  requestedSchema: ElicitationSchema;
  resolve: (result: ElicitationResult) => void;
  reject: (error: Error) => void;
  createdAt: Date;
  toolName: string;
  sessionId?: string;
}

/**
 * Event emitted to frontend when elicitation is requested
 */
export interface ElicitationEvent {
  type: 'elicitation_request';
  id: string;
  message: string;
  requestedSchema: ElicitationSchema;
  toolName: string;
}

/**
 * Response from frontend for an elicitation request
 */
export interface ElicitationResponse {
  id: string;
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, any>;
}

// ============================================
// MCP Server Factory Types
// ============================================

/**
 * Configuration for a tool group within the MCP server factory.
 * Each group becomes its own independent MCP server endpoint.
 */
export interface ToolGroupConfig {
  toolServices: ToolService[];
  dynamicToolsLoader?: (projectRoot: string) => Promise<McpTool[]>;
  dynamicToolExecutor?: (toolName: string, args: Record<string, any>, projectRoot: string) => Promise<any>;
}

/**
 * Runtime instance of a tool group's MCP server.
 * Created lazily by the factory on first access.
 */
export interface McpGroupInstance {
  server: import('@modelcontextprotocol/sdk/server/index.js').Server;
  toolMap: Map<string, ToolService>;
  transports: Map<string, import('@modelcontextprotocol/sdk/server/streamableHttp.js').StreamableHTTPServerTransport>;
  config: ToolGroupConfig;
}
