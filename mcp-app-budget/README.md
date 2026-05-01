# Budget Donut Chart — MCP UI Previewer Example

This is a reference implementation of an **MCP UI previewer** for Etienne. It renders `.budget.json` files as interactive SVG donut charts inside the preview pane, demonstrating how external MCP servers can provide custom file visualizations.

## How it works

```
User opens .budget.json  -->  FilesPanel detects type: 'mcpui'
  -->  McpUIPreview connects to /mcp/budget
  -->  Calls render_budget tool with { filename, content }
  -->  Backend returns parsed JSON as CallToolResult
  -->  AppRenderer loads the built MCP App HTML into a sandboxed iframe
  -->  React donut chart renders with the budget data
```

The MCP App receives the tool result via the `@modelcontextprotocol/ext-apps` bridge (`ontoolresult` callback) and renders a color-coded donut chart with a legend showing amounts and percentages.

## Sample data

Create a file named `household.budget.json` in any project's workspace:

```json
{
  "budget": [
    { "item": "Household", "amount": 1200.00, "currency": "EUR" },
    { "item": "Car & Transport", "amount": 454.40, "currency": "EUR" },
    { "item": "Groceries", "amount": 680.00, "currency": "EUR" },
    { "item": "Insurance", "amount": 320.50, "currency": "EUR" },
    { "item": "Entertainment", "amount": 150.00, "currency": "EUR" },
    { "item": "Savings", "amount": 500.00, "currency": "EUR" },
    { "item": "Utilities", "amount": 210.00, "currency": "EUR" },
    { "item": "Clothing", "amount": 95.00, "currency": "EUR" },
    { "item": "Healthcare", "amount": 175.00, "currency": "EUR" },
    { "item": "Subscriptions", "amount": 64.90, "currency": "EUR" }
  ]
}
```

## Build

```bash
npm install
npm run build
```

This produces `dist/mcp-app.html` — a single self-contained HTML file (React + all dependencies inlined) that the backend serves as an MCP resource.

## Project structure

```
mcp-app-budget/
  mcp-app.html          Entry HTML (dev, sources /src/mcp-app.tsx)
  vite.config.ts         Vite + viteSingleFile plugin
  src/
    mcp-app.tsx          React root: useApp() hook, SVG donut chart, legend
    mcp-app.module.css   Component styles
    global.css           CSS resets and design tokens
  dist/
    mcp-app.html         Built output (loaded by backend at runtime)
```

## Backend integration

The tool service is in `backend/src/mcpserver/budget-tools.ts` and is registered as the `'budget'` group in `mcp-server-factory.service.ts`. It exposes a single tool:

| Tool | Input | Output |
|------|-------|--------|
| `render_budget` | `{ filename, content }` | Parsed budget JSON as `CallToolResult` |

The previewer is configured in `backend/src/previewers/previewer-metadata.json`:

```json
{
  "viewer": "budget",
  "type": "mcpui",
  "extensions": [".budget.json"],
  "mcpGroup": "budget",
  "mcpToolName": "render_budget"
}
```

## Using this as a template

To create a new MCP UI previewer for a different file type:

1. Copy this directory and rename it (e.g. `mcp-app-cad/`)
2. Edit `src/mcp-app.tsx` — replace the donut chart with your visualization
3. Create a tool service in `backend/src/mcpserver/` following `budget-tools.ts`
4. Register the group in `mcp-server-factory.service.ts`
5. Add a metadata entry in `previewer-metadata.json` with `type: "mcpui"`
6. Build with `npm run build`

Or use the Previewers Manager UI (admin dashboard) to register the new MCP UI previewer without editing config files.
