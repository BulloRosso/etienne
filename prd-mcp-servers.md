# MCP Server Configuration
I want to add a project specific set of MCP servers to be used by claude code. This configuration should be managed in the project's workspace in a root file .mcp.json. The scope is always local for a MCP server.

Please read the technical basics in mcp-server-configuration.md first before beginning with the implementation.

## Backend
We need a new module in the backend under /src/claude/mcpserverconfig/mcp.server.config.ts

This module is the base for our two new API endpoints:
* GET /api/mcp/config/<project>: Gets the current configuration for the project
* POST /api/mcp/config/<project>: Sets the current MCP configuration for the project

POST creates a new .mcp.json in the project root if it does not exist.

We do not include any MCP server configuration via the command line - we use the configuration file exclusively.

## Frontend
We need a new tab item "MCP" which displays the new React component MCPServerConfiguration.jsx.

MCPServerConfiguration is offered as an editable list similar to the existing PermissionList.jsx

The MCPServerConfiguration displays:
* Name of the server
* Transport SSE|HTTP|STDOUT 
* Auth
* URL/CMD

The items in the list can be deleted or edited and the last item is a add new item option.


