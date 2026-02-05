/**
 * Type definitions for Project Python Tools
 *
 * These types define the structure for dynamically discovered
 * Python-based MCP tools in project directories.
 */

import { McpTool } from '../types';

/**
 * Definition of a Python tool parsed from a .py file
 */
export interface ProjectToolDefinition {
  /** Tool name (without py_ prefix) */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: {
    type: 'object';
    properties?: Record<string, PropertySchema>;
    required?: string[];
  };

  /** Absolute path to the Python file */
  filePath: string;

  /** Last modification time for cache invalidation */
  lastModified: Date;

  /** Execution timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * JSON Schema property definition
 */
export interface PropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  default?: any;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
}

/**
 * Result of executing a Python tool
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: {
    type: 'timeout' | 'parse_error' | 'execution_error' | 'not_found';
    message: string;
    stderr?: string;
    exitCode?: number;
  };
  executionTimeMs: number;
}

/**
 * Cache entry for a project's tools
 */
export interface ProjectToolsCache {
  tools: ProjectToolDefinition[];
  lastScanned: Date;
  isValid: boolean;
}

/**
 * Parsed metadata from Python docstring
 */
export interface ParsedToolMetadata {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, PropertySchema>;
    required?: string[];
  };
}
