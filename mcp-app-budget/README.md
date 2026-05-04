# Budget Donut Chart — MCP UI Previewer Example

This is a reference implementation of an **MCP UI previewer** for Etienne. It renders `.budget.json` files as interactive SVG donut charts inside the preview pane, demonstrating how external MCP servers can provide custom file visualizations.

It also serves as the canonical example for **bidirectional communication** between the LLM (model) and a running MCP App UI.

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

## Bidirectional Communication

This app demonstrates full two-way state synchronization between the chat model and the running UI:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         BIDIRECTIONAL DATA FLOW                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐       ┌──────────────┐       ┌────────────────┐       ┌─────┐ │
│  │  Model  │ ───── │   Backend    │ ───── │ Frontend Host  │ ───── │ UI  │ │
│  │ (Claude)│       │  (NestJS)    │       │ (McpUIPreview) │       │(App)│ │
│  └─────────┘       └──────────────┘       └────────────────┘       └─────┘ │
│                                                                              │
│  DOWNSTREAM (Model → UI):                                                    │
│  1. Model calls select_budget_items tool                                     │
│  2. Backend executes, returns { _action: 'select', ... }                     │
│  3. SSE tool event emitted to frontend                                       │
│  4. App.jsx detects _action marker → dispatches 'mcp-viewer-command' event   │
│  5. McpUIPreview picks up event → postMessage to iframe                      │
│  6. MCP App receives 'viewer-command' message → updates selection state      │
│                                                                              │
│  UPSTREAM (UI → Model):                                                      │
│  1. User clicks item in donut chart                                          │
│  2. MCP App posts 'viewer-state-update' message to parent                    │
│  3. McpUIPreview receives → calls onViewerStateChange callback               │
│  4. FilesPanel / App.jsx stores state in viewerStatesRef                     │
│  5. Next chat submission includes viewerState query parameter                │
│  6. Backend injects viewer state as context for the model                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Downstream: Model selects items programmatically

The `select_budget_items` tool allows the model to change what's highlighted in the chart:

```
Model: "Let me highlight the top 3 expenses for you."
→ calls mcp__budget__select_budget_items({ items: ["Household", "Groceries", "Savings"] })
→ Chart animates to highlight those 3 segments
```

### Upstream: User selection visible to model

When the user clicks items in the chart, the selection is reported back:

```
User clicks "Car & Transport" and "Insurance" in the chart
→ Next message includes: <viewer-selection>{ selectedItems: [...] }</viewer-selection>
→ Model can respond: "I see you selected Car & Transport (€454.40) and Insurance (€320.50)..."
```

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

The tool service is in `backend/src/mcpserver/budget-tools.ts` and is registered as the `'budget'` group in `mcp-server-factory.service.ts`. It exposes these tools:

| Tool | Input | Output |
|------|-------|--------|
| `render_budget` | `{ filename, content }` | Parsed budget JSON as `CallToolResult` |
| `select_budget_items` | `{ items?, indices?, mode? }` | `{ _action: 'select', ... }` (forwarded to UI) |

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

---

## Guide: Building Your Own Bidirectional MCP Tool

This section explains how to create a new MCP App tool that supports **bidirectional state coupling** between the LLM chat and a running UI. Follow these steps to build a tool where:
- The model can programmatically change the UI state (e.g. select, highlight, navigate)
- The UI can report its state back to the model (e.g. user selections, scroll position)

### Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  LAYER 1: Backend (NestJS)                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  your-tools.ts                                                       │  │
│  │  ├── render_xxx tool     → returns data for UI to display            │  │
│  │  └── action_xxx tool     → returns { _action: '...', payload }       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  LAYER 2: Frontend Host (React)                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  McpUIPreview.jsx (file preview) or McpAppRenderer.jsx (chat inline) │  │
│  │  ├── Listens for 'mcp-viewer-command' events → postMessage to iframe │  │
│  │  └── Listens for 'viewer-state-update' from iframe → bubbles up      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  LAYER 3: MCP App (iframe, React)                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  mcp-app.tsx                                                         │  │
│  │  ├── ontoolresult callback → receives initial data from render tool  │  │
│  │  ├── message listener      → receives commands from host             │  │
│  │  └── postMessage to parent → reports state changes upstream          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  LAYER 4: Event Bus (App.jsx)                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  SSE tool events with _action in result                              │  │
│  │  → window.dispatchEvent('mcp-viewer-command', { toolName, action })  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Define your tools (Backend)

Create `backend/src/mcpserver/your-tools.ts`:

```typescript
import { ToolService, McpTool } from './types';
import { promises as fs } from 'fs';
import { join } from 'path';

export const YOUR_RESOURCE_URI = 'ui://your-group/your-app.html';
export const YOUR_RESOURCE_MIME = 'text/html;profile=mcp-app';

const tools: McpTool[] = [
  // Tool 1: Render — provides data to the UI
  {
    name: 'render_your_data',
    description: 'Render your data as an interactive visualization.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Raw data content' },
      },
      required: ['content'],
    },
    _meta: { ui: { resourceUri: YOUR_RESOURCE_URI } },
  } as McpTool & { _meta?: any },

  // Tool 2: Action — manipulates the UI state
  {
    name: 'your_action_tool',
    description: 'Programmatically change the state of the running UI.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Which element to target' },
        mode: { type: 'string', enum: ['highlight', 'focus', 'dismiss'] },
      },
    },
    // The _meta.ui.action field marks this as an action tool (not a render tool)
    _meta: { ui: { resourceUri: YOUR_RESOURCE_URI, action: 'your-action' } },
  } as McpTool & { _meta?: any },
];

export function createYourToolsService(): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'render_your_data':
        return JSON.parse(args.content);

      case 'your_action_tool':
        // Return structured command with _action marker.
        // The frontend event bus detects _action and dispatches
        // a 'mcp-viewer-command' CustomEvent to the window.
        return {
          _action: 'your-action',    // ← REQUIRED: triggers event dispatch
          target: args.target,
          mode: args.mode || 'highlight',
        };

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return { tools, execute };
}

export async function loadYourResourceHtml(): Promise<string | null> {
  const path = join(__dirname, '..', '..', '..', 'mcp-app-your/dist/mcp-app.html');
  try { return await fs.readFile(path, 'utf-8'); } catch { return null; }
}
```

**Key convention**: Action tools return an object with `_action` property. This is the marker that the frontend event bus uses to detect commands destined for a viewer iframe.

### Step 2: Register in the factory (Backend)

In `backend/src/mcpserver/mcp-server-factory.service.ts`:

```typescript
import { createYourToolsService, loadYourResourceHtml, YOUR_RESOURCE_URI, YOUR_RESOURCE_MIME } from './your-tools';

// In the groupConfigs object:
'your-group': {
  toolServices: [createYourToolsService()],
  resources: [
    {
      uri: YOUR_RESOURCE_URI,
      name: 'Your App',
      description: 'Interactive visualization for your data',
      mimeType: YOUR_RESOURCE_MIME,
      loadContent: loadYourResourceHtml,
    },
  ],
},
```

### Step 3: Event bus dispatch (Frontend — already built-in)

This is already implemented in `App.jsx`. When any tool completes with a result containing `_action`, the following is dispatched automatically:

```javascript
// In App.jsx (already present — no changes needed):
if (data.status === 'completed' && data.result) {
  const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  if (parsed?._action) {
    window.dispatchEvent(new CustomEvent('mcp-viewer-command', {
      detail: { toolName: data.toolName, action: parsed._action, payload: parsed },
    }));
  }
}
```

### Step 4: Forward commands to iframe (Frontend Host)

In `McpUIPreview.jsx`, the viewer command listener is already generic:

```javascript
useEffect(() => {
  const handler = (event) => {
    const { toolName, action, payload } = event.detail || {};
    if (!toolName) return;
    // Only forward commands targeting this viewer's MCP group
    const isOurTool = toolName.startsWith(`mcp__${mcpGroup}__`);
    if (!isOurTool) return;

    // Find the iframe and post the command
    const iframe = iframeRef.current?.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'viewer-command',
        action,
        payload,
      }, '*');
    }
  };
  window.addEventListener('mcp-viewer-command', handler);
  return () => window.removeEventListener('mcp-viewer-command', handler);
}, [mcpGroup, mcpToolName]);
```

This works for **any** MCP group — no per-viewer code needed here.

### Step 5: Handle commands in your MCP App (iframe)

In your app's React component:

```typescript
// Listen for commands from the host
useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data?.type !== 'viewer-command') return;
    const { action, payload } = event.data;

    switch (action) {
      case 'your-action':
        // Update your component state based on the command
        setHighlighted(payload.target);
        setMode(payload.mode);
        // Report the change back upstream
        postStateToHost({ highlighted: payload.target });
        break;
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, [/* dependencies */]);
```

### Step 6: Report state changes upstream (iframe → host)

Post a `viewer-state-update` message whenever the user interacts with your UI:

```typescript
function postStateToHost(state: Record<string, any>) {
  try {
    window.parent.postMessage({
      type: 'viewer-state-update',   // ← REQUIRED: this exact type
      state,                          // ← your custom state object
    }, '*');
  } catch { /* ignore sandbox errors */ }
}
```

The host (`McpUIPreview`) listens for `viewer-state-update` messages and bubbles them up through `onViewerStateChange` → `FilesPanel` → `App.jsx` → `viewerStatesRef`. On the next chat submission, this state is attached as a `viewerState` query parameter and injected into the model's context.

### Step 7: Register as a previewer (optional)

If your app should auto-open for specific file extensions, add to `backend/src/previewers/previewer-metadata.json`:

```json
{
  "viewer": "your-group",
  "type": "mcpui",
  "extensions": [".your-ext.json"],
  "mcpGroup": "your-group",
  "mcpToolName": "render_your_data"
}
```

### Message Protocol Summary

| Direction | Message type | `type` field | Payload |
|-----------|-------------|--------------|---------|
| Host → iframe | Command | `'viewer-command'` | `{ action: string, payload: any }` |
| iframe → Host | State update | `'viewer-state-update'` | `{ state: any }` |
| App.jsx → Host | Custom event | `'mcp-viewer-command'` | `{ toolName, action, payload }` |

### Conventions

1. **`_action` in tool result** — Required marker. Without this, the event bus ignores the result.
2. **`'viewer-command'` message type** — The iframe listens for this exact string.
3. **`'viewer-state-update'` message type** — The host listens for this exact string.
4. **MCP group scoping** — Commands are routed by matching `mcp__<group>__` prefix in the tool name.
5. **Mode parameter** — Use `replace`/`add`/`remove`/`clear` for cumulative state changes (like selections).

### Tips

- Keep action tool results lightweight — they travel through SSE and postMessage.
- The upstream state (`viewer-state-update`) should include only what the model needs to see. Don't send internal UI state like hover or scroll position.
- Action tools are fire-and-forget from the model's perspective. The model doesn't wait for the UI to acknowledge.
- You can define multiple action tools for the same viewer (e.g. `select_items`, `zoom_to`, `filter_by`).
- The `_meta.ui.action` field in the tool definition is metadata for documentation/discovery, not functional. The actual routing uses `_action` in the **result**.

## Using this as a template

To create a new bidirectional MCP UI previewer:

1. Copy this directory and rename it (e.g. `mcp-app-gantt/`)
2. Edit `src/mcp-app.tsx` — replace the donut chart with your visualization
3. Add a `window.addEventListener('message', ...)` handler for incoming commands
4. Add `window.parent.postMessage(...)` calls for outgoing state changes
5. Create a tool service in `backend/src/mcpserver/` with both a render tool and action tools
6. Ensure action tools return `{ _action: '...', ...payload }`
7. Register the group in `mcp-server-factory.service.ts`
8. Add a metadata entry in `previewer-metadata.json` with `type: "mcpui"`
9. Build with `npm run build`
