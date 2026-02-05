/**
 * Tool Parser
 *
 * Parses Python docstrings to extract MCP tool metadata.
 * Supports a YAML-like format in the docstring for defining
 * tool name, description, and input schema.
 *
 * Example Python docstring format:
 * ```
 * """
 * MCP Tool: my_tool_name
 * Description: What this tool does
 * Input Schema:
 *     param1:
 *         type: string
 *         description: Parameter description
 *         required: true
 *     param2:
 *         type: number
 *         enum: [1, 2, 3]
 * """
 * ```
 */

import * as fs from 'fs-extra';
import { ParsedToolMetadata, PropertySchema } from './project-tools.types';

/**
 * Parse a Python file and extract MCP tool metadata from its docstring
 */
export async function parseToolFile(filePath: string): Promise<ParsedToolMetadata | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseToolDocstring(content);
  } catch (error) {
    return null;
  }
}

/**
 * Parse tool metadata from Python source code
 */
export function parseToolDocstring(pythonSource: string): ParsedToolMetadata | null {
  // Extract the module-level docstring (triple-quoted string at the start)
  const docstringMatch = pythonSource.match(/^[\s\S]*?(?:'''|""")[\s\S]*?([\s\S]*?)(?:'''|""")/);

  if (!docstringMatch) {
    return null;
  }

  const docstring = docstringMatch[1];

  // Extract MCP Tool name
  const nameMatch = docstring.match(/MCP\s+Tool:\s*(\S+)/i);
  if (!nameMatch) {
    return null;
  }
  const name = nameMatch[1].trim();

  // Extract Description
  const descMatch = docstring.match(/Description:\s*(.+?)(?=\n(?:Input Schema:|$))/is);
  const description = descMatch ? descMatch[1].trim() : `Python tool: ${name}`;

  // Extract Input Schema
  const schemaMatch = docstring.match(/Input\s+Schema:\s*([\s\S]*?)$/i);
  const inputSchema = schemaMatch
    ? parseInputSchema(schemaMatch[1])
    : { type: 'object' as const, properties: {}, required: [] };

  return {
    name,
    description,
    inputSchema,
  };
}

/**
 * Parse the YAML-like input schema from the docstring
 */
function parseInputSchema(schemaText: string): {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required: string[];
} {
  const properties: Record<string, PropertySchema> = {};
  const required: string[] = [];

  // Split into lines and parse indentation-based structure
  const lines = schemaText.split('\n');
  let currentParam: string | null = null;
  let currentProperty: Partial<PropertySchema> = {};

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    // Check indentation level
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;

    // Top-level parameter (4 spaces or 1 tab typically)
    if (leadingSpaces <= 4 && line.includes(':')) {
      // Save previous parameter if exists
      if (currentParam && Object.keys(currentProperty).length > 0) {
        properties[currentParam] = currentProperty as PropertySchema;
      }

      // Start new parameter
      const paramMatch = line.match(/^\s*(\w+):\s*$/);
      if (paramMatch) {
        currentParam = paramMatch[1];
        currentProperty = {};
      }
    }
    // Property of current parameter (8+ spaces)
    else if (currentParam && leadingSpaces >= 6) {
      const propMatch = line.match(/^\s*(\w+):\s*(.+)$/);
      if (propMatch) {
        const [, key, value] = propMatch;
        const trimmedValue = value.trim();

        switch (key.toLowerCase()) {
          case 'type':
            currentProperty.type = trimmedValue as PropertySchema['type'];
            break;
          case 'description':
            currentProperty.description = trimmedValue;
            break;
          case 'required':
            if (trimmedValue.toLowerCase() === 'true') {
              required.push(currentParam);
            }
            break;
          case 'enum':
            currentProperty.enum = parseEnumValue(trimmedValue);
            break;
          case 'default':
            currentProperty.default = parseValue(trimmedValue);
            break;
        }
      }
    }
  }

  // Don't forget the last parameter
  if (currentParam && Object.keys(currentProperty).length > 0) {
    properties[currentParam] = currentProperty as PropertySchema;
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

/**
 * Parse enum values from a string like "[a, b, c]" or "[1, 2, 3]"
 */
function parseEnumValue(value: string): (string | number)[] {
  const match = value.match(/\[(.*)\]/);
  if (!match) return [];

  return match[1].split(',').map((item) => {
    const trimmed = item.trim();
    // Try to parse as number
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
    // Remove quotes if present
    return trimmed.replace(/^['"]|['"]$/g, '');
  });
}

/**
 * Parse a value string to appropriate type
 */
function parseValue(value: string): any {
  // Boolean
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // Number
  const num = Number(value);
  if (!isNaN(num)) return num;

  // String (remove quotes if present)
  return value.replace(/^['"]|['"]$/g, '');
}
