[← back to README](../README.md)

# File Type Previewers

The previewer system routes file opens and service activations to specialized React viewer components. It uses a three-layer extension mapping, a metadata registry for context menu actions and MCP UI previewers, and a separate service previewer registry.

## Architecture Overview

```
User Action (context menu / sidebar icon / link click)
  → FilePreviewHandler.handlePreview(filePath, projectName)
  → getViewerForFile() determines viewer name
  → publishes FILE_PREVIEW_REQUEST event
  → App.jsx fetches file content (or creates placeholder for services)
  → FilesPanel renders via VIEWER_COMPONENTS[viewerName]
```

### Key Files

| File | Purpose |
|------|---------|
| [viewerRegistry.jsx](../frontend/src/components/viewerRegistry.jsx) | Central registry: `VIEWER_COMPONENTS`, `SERVICE_PREVIEWERS`, `buildExtensionMap()`, `getViewerForFile()`, `getContextMenuActions()` |
| [FilePreviewHandler.js](../frontend/src/services/FilePreviewHandler.js) | Event publisher: resolves viewer name and publishes `FILE_PREVIEW_REQUEST` |
| [FilesPanel.jsx](../frontend/src/components/FilesPanel.jsx) | Tab manager: renders active file using viewerRegistry |
| [PreviewersManager.jsx](../frontend/src/components/PreviewersManager.jsx) | Admin UI: manages system-level extension mappings and context menu actions |
| [Filesystem.jsx](../frontend/src/components/Filesystem.jsx) | File explorer: renders data-driven context menu actions via `CONTEXT_MENU_MODALS` registry |
| [previewers.service.ts](../backend/src/previewers/previewers.service.ts) | Backend: extension mappings (`REGISTERED_PREVIEWERS` env), metadata (`previewer-metadata.json`), service previewers |
| [previewers.controller.ts](../backend/src/previewers/previewers.controller.ts) | API: `GET`/`PUT` `/api/previewers/configuration` |
| [previewer-metadata.json](../backend/src/previewers/previewer-metadata.json) | Metadata per viewer: type, MCP group/tool, context menu actions |

### Three Classes of Previewers

**File-Extension Previewers** (`type: 'file'`, the default) map file extensions to viewer components:
- Configured via `REGISTERED_PREVIEWERS` env var (format: `viewer:.ext1,.ext2|viewer2:.ext3`)
- Compound extensions (e.g., `.workflow.json`, `.artifacts.md`) are matched before simple extensions
- Project-level overrides can remap or disable extensions per project

**Service Previewers** (`type: 'service'`) are activated by running services, not file extensions:
- Triggered via service paths: `#<serviceName>/<function>` (e.g., `#imap/inbox`)
- Registered in `getServicePreviewers()` in `previewers.service.ts`
- Typically shown as sidebar icons when their backing service is running

**MCP UI Previewers** (`type: 'mcpui'`) render via MCP tool calls instead of file content:
- Configured in `previewer-metadata.json` with `mcpGroup` and `mcpToolName`
- Extensions are stored in metadata (not in the `REGISTERED_PREVIEWERS` env var)
- Example: the `budget` viewer (`.budget.json`) calls the `render_budget` tool from the `budget` MCP group

### Extension Mapping Priority

1. **Built-in defaults** (`BUILTIN_DEFAULTS` in viewerRegistry.jsx) — fallback
2. **System configuration** (`REGISTERED_PREVIEWERS` via backend) — admin-managed
3. **Project overrides** (`autoFilePreviewExtensions` in project config) — per-project

### Context Menu Actions

Previewers can define additional context menu actions that appear when right-clicking matching files in the file explorer. Actions are stored in `previewer-metadata.json` (under `actions` per viewer entry) and support:
- **Multi-language labels** (en, de, it, zh)
- **Conditions**: `filename` (exact match), `extension`, `pathContains` (folder segment)
- **Modal dialogs** or **preview navigation** (`__preview__` pseudo-component)
- **Template parameters**: `${filePath}`, `${fileName}`, `${fileNameWithoutExt}`, `${projectName}`, `${folderPath}`
- **Role gating**: optional `minRole` field (e.g. `'user'`)

## Supported File Types

| File Extension | Viewer | Component |
|----------------|--------|-----------|
| `.html`, `.htm` | html | [LiveHTMLPreview](../frontend/src/components/LiveHTMLPreview.jsx) |
| `.json` | json | [JSONViewer](../frontend/src/components/JSONViewer.jsx) |
| `.jsonl` | jsonl | [JSONViewer](../frontend/src/components/JSONViewer.jsx) (JSONL mode) |
| `.md` | markdown | [MarkdownViewer](../frontend/src/components/MarkdownViewer.jsx) |
| `.mermaid` | mermaid | [MermaidViewer](../frontend/src/components/MermaidViewer.jsx) |
| `.research` | research | [ResearchDocument](../frontend/src/components/ResearchDocument.jsx) |
| `.jpg`, `.jpeg`, `.png`, `.gif` | image | [ImageViewer](../frontend/src/components/ImageViewer.jsx) |
| `.xls`, `.xlsx` | excel | [ExcelViewer](../frontend/src/components/ExcelViewer.jsx) |
| `.prompt` | prompt | [PromptEditor](../frontend/src/components/PromptEditor.jsx) |
| `.workflow.json` | workflow | [WorkflowVisualizer](../frontend/src/components/WorkflowVisualizer.jsx) |
| `.scbk` | scrapbook | [ScrapbookViewer](../frontend/src/components/ScrapbookViewer.jsx) |
| `.youtube`, `.videos`, `.mp4` | video | [VideoViewer](../frontend/src/components/VideoViewer.jsx) |
| `.knowledge` | knowledge | [KnowledgeViewer](../frontend/src/components/KnowledgeViewer.jsx) |
| `.pdf` | pdf | [PdfViewer](../frontend/src/components/PdfViewer.jsx) |
| `.docx`, `.doc` | docx | [DocxViewer](../frontend/src/components/DocxViewer.jsx) |
| `.requirements.json` | requirements | [RequirementsViewer](../frontend/src/components/RequirementsViewer.jsx) |
| `.artifacts.md` | artifacts | [ArtifactsForSession](../frontend/src/components/ArtifactsForSession.jsx) |
| `.budget.json` | budget | MCP UI previewer (calls `render_budget` tool) |
| `#imap/*` (service) | imap | [IMAPInboxViewer](../frontend/src/components/IMAPInboxViewer.jsx) |

## Adding a New File-Extension Previewer

**Steps:**
1. Create a viewer component in `frontend/src/components/` (e.g., `MyFormatViewer.jsx`)
2. Register it in `VIEWER_COMPONENTS` in `frontend/src/components/viewerRegistry.jsx`
3. Add default extension mappings in `BUILTIN_DEFAULTS` in `viewerRegistry.jsx`
4. Add default extension mappings in `getDefaults()` in `backend/src/previewers/previewers.service.ts`
5. The FilePreviewHandler and event routing work automatically — no changes needed there

**Agent prompt:**
> Add a new file previewer for `.<ext>` files:
> 1. Create `frontend/src/components/MyViewer.jsx` with props `{ filename, projectName }`
> 2. Register it in `VIEWER_COMPONENTS` in `frontend/src/components/viewerRegistry.jsx`
> 3. Add to `BUILTIN_DEFAULTS` in `viewerRegistry.jsx`
> 4. Add to `getDefaults()` in `backend/src/previewers/previewers.service.ts`
> 5. FilePreviewHandler and routing work automatically.

## Adding a New Service Previewer

**Steps:**
1. Create a viewer component in `frontend/src/components/` (e.g., `MyServiceViewer.jsx`)
2. Register it in `VIEWER_COMPONENTS` in `viewerRegistry.jsx`
3. Add an entry in `getServicePreviewers()` in `backend/src/previewers/previewers.service.ts` with `serviceName`, `viewerName`, `functions`, `displayName`, and optional `requiresService`
4. Add a sidebar icon in `MinimalisticSidebar.jsx` that calls `filePreviewHandler.handlePreview('#myservice/function', currentProject)`
5. Ensure the backing service is registered in `backend/services.json`

## Adding a New MCP UI Previewer

**Steps:**
1. Create a viewer component in `frontend/src/components/`
2. Register it in `VIEWER_COMPONENTS` in `viewerRegistry.jsx`
3. Add a metadata entry in `getDefaultMetadata()` in `backend/src/previewers/previewers.service.ts` with `viewer`, `type: 'mcpui'`, `extensions`, `mcpGroup`, and `mcpToolName`
4. Ensure the MCP server group exposes the tool specified in `mcpToolName`

## Adding a Context Menu Action to a Previewer

**Steps:**
1. If the action opens a modal: create the modal component and register it in `CONTEXT_MENU_MODALS` in `Filesystem.jsx`
2. Add an `actions` entry to the viewer's metadata in `getDefaultMetadata()` in `backend/src/previewers/previewers.service.ts` with labels, icon, `modalComponent` name (or `__preview__` to open a file preview), params, optional condition, and optional `minRole`
3. The context menu rendering is automatic

**Agent prompt:**
> Add a context menu action "Analyze Document" for `.pdf` files in inbox folders:
> 1. Create `frontend/src/components/DocumentAnalysisModal.jsx` with props `{ open, onClose, filePath, projectName }`
> 2. Register it in `CONTEXT_MENU_MODALS` in `frontend/src/components/Filesystem.jsx`
> 3. Add a `contextMenuActions` entry to the `pdf` viewer in `backend/src/previewers/previewer-context-actions.json`

The preview system is integrated with the [Interceptors](../requirements-docs/prd-interceptors.md) feature to automatically refresh previews when files are modified by Claude Code.

## AgentBus interactions

A previewer can declare the semantic events it emits when the user interacts with it. The agent then sees those events — and a plain-English description of what each one *means* — alongside the open viewer's state, and can either react automatically (auto-submitted synthetic chat message) or wait for the next user message and use the recent-event log as context.

### Component contract

A React previewer opts in by attaching a static `agentbusEventsOut()` method that returns an array of event descriptors:

```js
GanttDiagram.agentbusEventsOut = () => [
  {
    id: 'task.moved',
    description: 'User dragged a task bar to a new date range. Indicates rescheduling.',
    payloadSchema: {
      taskId: 'string', taskName: 'string',
      oldStart: 'YYYY-MM-DD', newStart: 'YYYY-MM-DD',
      oldEnd: 'YYYY-MM-DD',   newEnd: 'YYYY-MM-DD',
    },
    chatTemplate: "In '{{filename}}': task '{{taskName}}' moved: start {{oldStart}} → {{newStart}}, end {{oldEnd}} → {{newEnd}}.",
    autoSubmit: true,
  },
];
```

Fields:

- `id` — stable identifier (e.g. `task.moved`, `item.selected`). Used in the agent prompt's `<agentbus-events-out>` block.
- `description` — plain English; the agent sees this and reasons about what the event means.
- `payloadSchema` — documentation only (string types). Not enforced.
- `chatTemplate` — a Mustache-style template (`{{name}}`, `{{nested.key}}`). The reserved variables `{{filename}}` and `{{viewerInstanceId}}` are always available — emitters do not need to pass them. **Always reference `{{filename}}` when the event is meaningful per-file**, since two viewers of the same kind can be open simultaneously.
- `autoSubmit` — `true` ships the rendered template as a synthetic user message immediately; `false` records the event in a per-(viewer, file) ring buffer that gets attached to the next user-typed message.

### Emitting an event

The previewer calls `agentBus.emit(viewerName, eventId, payload, { filename })`. The `filename` is **mandatory**; without it the emit is dropped (with a console warning). Two open Gantt viewers thus produce two independent event histories.

### Registration

Components opting into the bus are listed in `VIEWER_AGENTBUS_PROVIDERS` in [viewerRegistry.jsx](../frontend/src/components/viewerRegistry.jsx). The registry calls `agentBus.registerCatalog(name, Component)` once on module load, which reads the static method and caches the catalog.

### Delivery to the agent

When the user sends a chat message, the frontend ([App.jsx `getViewerStates()`](../frontend/src/App.jsx)) attaches `agentbusCatalog` and (drained) `agentbusRecentEvents` to each open viewer's state entry. The orchestrator ([claude-sdk-orchestrator.service.ts](../backend/src/claude/sdk/claude-sdk-orchestrator.service.ts)) renders these as an `<agentbus-events-out>` sub-section inside the existing `<viewer-selection>` block:

```
<viewer-selection file="project.gantt.json" viewer="gantt">
  …existing userEdited / selectedTasks lines…
  <agentbus-events-out>
    This viewer can emit the following semantic events…
      - task.moved: User dragged a task bar to a new date range…
    Recent events emitted (most recent last):
      1. [2026-05-08T15:44:59.302Z] task.moved: {"taskId":"t3", …, "filename":"project.gantt.json"}
  </agentbus-events-out>
</viewer-selection>
```

Auto-submitted events also flow through the existing `viewer-auto-prompt` window event → `handleSendMessage` path, so they appear in chat history as if the user had typed them.

### MCP UI bridge

An MCP UI iframe can emit agentBus events by sending a postMessage to the host:

```js
window.parent.postMessage({
  type: 'agentbus-event',
  eventId: 'item.clicked',
  payload: { itemId: 'sku-123' },
}, '*');
```

The host ([McpUIPreview.jsx](../frontend/src/components/McpUIPreview.jsx)) attaches the `filename` automatically — the iframe cannot spoof it. Catalog delivery is via the tool result envelope: an MCP server's tool result may include an `agentbusEventsOut` array, which the host registers under the `mcp.<mcpGroup>` viewer-name key.

### Future bridges

A2UI app viewers do not yet have a host-side intent vs. action distinction — every action goes to the agent via `action/submit`. Bridging A2UI to agentBus would require either a protocol-level `intent` message kind or a host-side filter on action IDs. Out of scope today; revisit once a use case appears.
