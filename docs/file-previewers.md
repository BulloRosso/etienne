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
