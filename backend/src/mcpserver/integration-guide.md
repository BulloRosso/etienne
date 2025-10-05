# MCP Server Integration Guide

## Overview

This implementation provides a minimal Model Context Protocol (MCP) server with HTTP streaming transport for your NestJS application.

## File Structure

```
src/
└── mcpserver/
    ├── mcp-server.module.ts        # NestJS module definition
    ├── mcp-server.controller.ts    # HTTP streaming controller
    ├── mcp-server.service.ts       # Core MCP protocol logic
    ├── auth.guard.ts               # Authentication guard
    ├── types.ts                    # TypeScript type definitions
    ├── demotools.ts                # Pet store demo tools
    └── demodata/
        └── category_results.json   # Sample warehouse data
```

The MCP server will be available at: `http://localhost:6060/mcp`

## Implementation

### API Endpoints

#### 1. Initialize Connection

```bash
curl -X POST http://localhost:6060/mcp/message \
  -H "Authorization: my-mcp-access-token!" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

#### 2. List Available Tools

```bash
curl -X POST http://localhost:6060/mcp/message \
  -H "Authorization: my-mcp-access-token!" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

#### 3. Call a Tool

Get bird promotions under 100€:

```bash
curl -X POST http://localhost:6060/mcp/message \
  -H "Authorization: my-mcp-access-token!" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_current_week_promotions",
      "arguments": {
        "category": "birds",
        "max_price": 100
      }
    }
  }'
```

Get all cat promotions:

```bash
curl -X POST http://localhost:6060/mcp/message \
  -H "Authorization: my-mcp-access-token!" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "get_current_week_promotions",
      "arguments": {
        "category": "cats"
      }
    }
  }'
```

#### 4. Health Check

```bash
curl -X POST http://localhost:6060/mcp/health
```

## Adding New Tools

To add new MCP tools:

### 1. Create a New Tool Service File

Create a file like `src/mcpserver/mytools.ts`:

```typescript
import { ToolService, McpTool } from './types';

// Define your tools
const tools: McpTool[] = [
  {
    name: 'my_custom_tool',
    description: 'Description of what this tool does',
    inputSchema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Description of parameter 1',
        },
        param2: {
          type: 'integer',
          description: 'Description of parameter 2',
        },
      },
      required: ['param1'],
    },
  },
];

// Implement the execution logic
async function execute(toolName: string, args: any): Promise<any> {
  switch (toolName) {
    case 'my_custom_tool':
      // Your implementation here
      return { result: 'success', data: args };
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Export the service
export const myToolService: ToolService = {
  tools,
  execute,
};
```

### 2. Register the Tool Service

Update `src/mcpserver/mcp-server.service.ts`:

```typescript
import { demoToolsService } from './demotools';
import { myToolService } from './mytools';  // Add this

constructor() {
  this.toolServices = [
    demoToolsService,
    myToolService,  // Add this
  ];
}
```

That's it! Your new tools will be automatically discovered and registered.

## Authentication

All MCP endpoints (except `/mcp/health`) require authentication using the header:

```
Authorization: my-mcp-access-token!
```

You can change this token in `src/mcpserver/auth.guard.ts`:

```typescript
private readonly VALID_TOKEN = 'your-new-token-here';
```

## Available Demo Tools

### get_current_week_promotions

Get promotional items from the pet store warehouse.

**Parameters:**
- `category` (required): One of "cats", "dogs", or "birds"
- `max_price` (optional): Maximum price in euros

**Returns:**
```json
{
  "categories": [
    {
      "name": "birds",
      "items": [
        {
          "sku": "BRD-001",
          "title": "Yellow Cockatiel",
          "description": "Friendly birds with an attitude...",
          "price_euro": 95,
          "items_available": 3,
          "image_url": "https://..."
        }
      ]
    }
  ],
  "promotion_period": {
    "start": "2025-09-29",
    "end": "2025-10-05"
  },
  "total_items": 5
}
```

## Architecture

### Key Components

1. **McpServerModule**: NestJS module that wires everything together
2. **McpServerController**: Handles HTTP transport with Server-Sent Events
3. **McpServerService**: Core MCP protocol implementation
4. **McpAuthGuard**: Validates authentication tokens
5. **ToolService Interface**: Contract for tool implementations
6. **DemoTools**: Example tool implementation for pet store

### Extensibility

The architecture is designed for easy extension:

- **New tools**: Just create a new file implementing `ToolService` and register it
- **New transports**: Create a new controller for different transport layers
- **Custom authentication**: Modify or replace `McpAuthGuard`

## Troubleshooting

### Port Already in Use

If port 6060 is already in use, update `/src/main.ts`:

```typescript
await app.listen(3000); // or any other port
```

### Authentication Errors

Ensure you're sending the correct Authorization header:

```
Authorization: my-mcp-access-token!
```

### Tool Not Found

Make sure:
1. The tool is defined in the `tools` array
2. The tool service is registered in `mcp-server.service.ts`
3. The `execute` function handles the tool name

## Next Steps

1. Integrate the MCP server into your app module
2. Test the endpoints using the provided curl commands
3. Create custom tools for your specific use case
4. Connect an MCP client to interact with the server

## Resources

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [NestJS Documentation](https://docs.nestjs.com/)