# VS Code's file explorer: a deep dive into the rendering and drag-and-drop source

The file explorer sidebar in VS Code is built on a **layered tree widget architecture** spanning roughly 15 TypeScript files across two main directories: explorer-specific UI code in `src/vs/workbench/contrib/files/browser/` and a generic, reusable tree widget in `src/vs/base/browser/ui/tree/`. The tree renders as a **virtualized flat list** — only ~30–50 DOM rows exist regardless of how many thousands of files a project contains. Every visual cue of hierarchy (indentation, expand/collapse chevrons) is painted onto flat list rows by an internal `TreeRenderer` wrapper. Drag-and-drop is handled by a single class, **`FileDragAndDrop`**, implementing the `ITreeDragAndDrop<ExplorerItem>` interface. This report maps every relevant source file, the rendering pipeline, and the DnD flow.

---

## The two files that do most of the work

Nearly all explorer-specific UI logic lives in just two files inside `src/vs/workbench/contrib/files/browser/views/`:

**`explorerView.ts`** is the main view panel. Its `ExplorerView` class extends `ViewPane` and orchestrates everything: it instantiates the tree widget (a `WorkbenchCompressibleAsyncDataTree<ExplorerItem | ExplorerItem[], ExplorerItem, FuzzyScore>`), wires together all rendering components, persists and restores view state (expanded nodes, scroll position) via `StorageService`, handles auto-reveal of the active editor's file, manages inline rename, and builds the right-click context menu via `MenuId.ExplorerContext`. The tree is created in `renderBody()` by composing six provider objects — all defined in the companion file.

**`explorerViewer.ts`** is the core rendering and interaction file. It exports every provider the tree widget needs:

- **`ExplorerDelegate`** — implements `IListVirtualDelegate<ExplorerItem>`, returning the fixed **22px row height** and template ID for each item.
- **`FilesRenderer`** — implements `ICompressibleTreeRenderer<ExplorerItem, FuzzyScore, IFileTemplateData>`. This is the actual renderer that creates and updates the DOM content for each file/folder row. It delegates to `ResourceLabels` (from `vs/workbench/browser/labels.ts`) for the file icon + name + decoration badge rendering. Key methods: `renderTemplate()`, `renderElement()`, `renderCompressedElements()`, `disposeElement()`, `disposeTemplate()`.
- **`ExplorerDataSource`** — implements `IAsyncDataSource<ExplorerItem | ExplorerItem[], ExplorerItem>`, providing `getChildren()` to lazily load children from the explorer service.
- **`FilesFilter`** — implements `ITreeFilter<ExplorerItem, FuzzyScore>`, applying glob-based exclusions (`files.exclude`), `.gitignore` rules, and file nesting visibility.
- **`FileSorter`** — implements `ITreeSorter<ExplorerItem>`, sorting by name, type, modified date, or other `explorer.sortOrder` options.
- **`ExplorerCompressionDelegate`** — decides whether a folder can be compressed into a compact path display (e.g., `src/vs/base` shown as one row).
- **`FileDragAndDrop`** — the drag-and-drop controller (detailed below).

Supporting files include `explorerDecorationsProvider.ts` (badge/color decorations), `explorerViewlet.ts` (the sidebar container `ExplorerViewPaneContainer`), and in the common layer, `explorerModel.ts` (the `ExplorerItem` data class with properties like `resource`, `name`, `isDirectory`, `children`, `parent`, `mtime`) and `files.ts` (context keys and constants like `VIEW_ID`).

---

## How the base tree widget renders 100,000 items with 50 DOM nodes

The generic tree infrastructure lives in `src/vs/base/browser/ui/tree/` and `src/vs/base/browser/ui/list/`. The architecture follows a strict layering principle, documented in VS Code's own wiki: **"A rendered tree can always be rendered as a list; it is each row's indentation and twistie indicators which give the user the perception of tree structure."**

The widget stack, from bottom to top:

1. **`listView.ts`** (~1,600 lines) — The **virtual scrolling engine**. Maintains a height map for every item, computes which items fall inside the visible viewport on each scroll event, and uses **template-based DOM pooling**: row `<div>` elements are cached by `templateId` and recycled as the user scrolls. `insertItemInDOM()` positions each row absolutely (`style="top: Npx; height: Npx;"`) and calls the renderer chain. This is why a tree with 100K items allocates only ~50 DOM nodes.

2. **`listWidget.ts`** — Adds keyboard/mouse navigation, focus and selection traits, multi-select, and accessibility (ARIA roles). Also contains `ListViewDragAndDrop`, which handles raw DOM drag events (`dragstart`, `dragover`, `dragenter`, `dragleave`, `drop`, `dragend`) and routes them into the tree's DnD interface.

3. **`abstractTree.ts`** (~3,000+ lines) — The abstract base tree. Its internal **`TreeRenderer`** class wraps every user-provided `ITreeRenderer` by prepending tree-specific DOM: an indent container (padding-left scaled by `node.depth × indentSize`), a twistie chevron (`codicon-chevron-down`/`codicon-chevron-right`), and a content container where the user renderer paints. At **line ~408**, `TreeRenderer.renderElement()` delegates to the user renderer after setting indentation and twistie state. This class also owns the find/filter widget, sticky scroll headers, and expand/collapse behavior.

4. **`asyncDataTree.ts`** — The `AsyncDataTree` and **`CompressibleAsyncDataTree`** classes handle lazy data loading. An internal `AsyncDataTreeRenderer` wraps user renderers to map `IAsyncDataTreeNode` wrappers back to the user's element type before delegating. The `CompressibleAsyncDataTree` is the exact base class used by the file explorer, adding path-compression support.

5. **`objectTree.ts`** / **`objectTreeModel.ts`** — In-memory tree that the `AsyncDataTree` uses internally. Translates `setChildren(element, children)` calls into flat-list splice operations.

6. **`compressedObjectTreeModel.ts`** — Implements the compact-folders feature, compressing chains of single-child directories into one visual node. The `ExplorerCompressionDelegate` from the explorer layer controls which folders are eligible.

7. **`indexTreeModel.ts`** — The lowest-level model, mapping tree splices (hierarchical coordinates) to flat list splices (linear indices).

8. **`tree.ts`** — Defines all core interfaces: `ITreeRenderer`, `ITreeNode`, `IAsyncDataSource`, `ITreeFilter`, `ITreeSorter`, `ITreeDragAndDrop`, `TreeVisibility`, and event types.

The full rendering call chain when a new file appears in the tree:

```
ExplorerDataSource.getChildren()
  → AsyncDataTree.updateChildren()
    → ObjectTree.setChildren()
      → IndexTreeModel.splice() → flat list splice
        → ListView.splice()
          → Compute new visible render range
            → insertItemInDOM()
              → TreeRenderer.renderTemplate() → creates indent + twistie + content <div>s
              → TreeRenderer.renderElement()
                → AsyncDataTreeRenderer.renderElement() → unwraps async node
                  → FilesRenderer.renderElement() → ResourceLabels paints icon + name + badge
              → Position row: style="top: Npx; height: 22px;"
```

The workbench integration layer at `src/vs/platform/list/browser/listService.ts` provides `WorkbenchCompressibleAsyncDataTree`, which wraps the raw tree with theming, configuration-driven keybindings, and accessibility hooks. This is the actual class instantiated in `explorerView.ts`.

---

## Drag-and-drop: from mousedown to file move

The DnD system spans seven files across three layers. The **`FileDragAndDrop`** class in `explorerViewer.ts` implements `ITreeDragAndDrop<ExplorerItem>` — the contract defined in `tree.ts`. Here is how the flow works end-to-end:

**Drag start.** When the user begins dragging a file, the `ListView` in `listWidget.ts` detects the `dragstart` DOM event, creates a `DragAndDropData` wrapper (from `src/vs/base/browser/dnd.ts`), and routes through `AsyncDataTreeNodeListDragAndDrop` (in `asyncDataTree.ts`), which unwraps async tree node wrappers before calling `FileDragAndDrop.onDragStart()`. This method sets `DataTransfers.RESOURCES` on the native `DataTransfer` with serialized resource URIs, sets `DataTransfers.DOWNLOAD_URL` for single-file drags, stores the `ExplorerItem[]` selection in `LocalSelectionTransfer` (from `src/vs/platform/dnd/browser/dnd.ts`) for efficient same-window transfers, and calls `fillEditorsDragData()` (from `src/vs/workbench/browser/dnd.ts`) to populate editor-specific metadata.

**Drag over.** As the cursor moves over targets, `dragover` DOM events fire and route to `FileDragAndDrop.onDragOver()`. This method checks whether the drag source is internal (via `LocalSelectionTransfer`) or external (OS file manager), validates the target is a writable folder, prevents dropping onto self or children, and returns an `ITreeDragOverReaction` object: `{ accept: true, bubble: TreeDragOverBubble.Up, autoExpand: true }`. The `autoExpand` flag causes the tree widget to expand hovered folders after a brief delay — a standard UX pattern.

**Drop.** On drop, `FileDragAndDrop.drop()` reads the drag data. For **internal moves**, it retrieves the `ExplorerItem[]` from `LocalSelectionTransfer`, resolves the target folder, optionally shows a confirmation dialog (controlled by `explorer.confirmDragAndDrop`), and calls the file service to **move** (or **copy** if Ctrl/Cmd is held). For **external drops** from the OS, it calls `extractEditorsAndFilesDropData()` (from `src/vs/platform/dnd/browser/dnd.ts`) to extract native file paths, then uploads or copies the files into the target folder. The entire DnD system respects the `explorer.enableDragAndDrop` configuration toggle.

**Cleanup.** `onDragEnd()` clears `LocalSelectionTransfer` and resets visual state.

The key DnD interface from `tree.ts`:

```typescript
interface ITreeDragAndDrop<T> {
    getDragURI(element: T): string | null;
    getDragLabel?(elements: T[], originalEvent: DragEvent): string | undefined;
    onDragStart?(data: IDragAndDropData, originalEvent: DragEvent): void;
    onDragOver(data: IDragAndDropData, targetElement: T | undefined,
               targetIndex: number | undefined,
               targetSector: ListViewTargetSector | undefined,
               originalEvent: DragEvent): boolean | ITreeDragOverReaction;
    drop(data: IDragAndDropData, targetElement: T | undefined,
         targetIndex: number | undefined,
         targetSector: ListViewTargetSector | undefined,
         originalEvent: DragEvent): void;
    onDragEnd?(originalEvent: DragEvent): void;
}
```

---

## Complete file map for the explorer UI

Every core source file, organized by architectural layer:

**Explorer-specific UI** (`src/vs/workbench/contrib/files/browser/`):

| File | Purpose |
|------|---------|
| `views/explorerView.ts` | Main explorer view panel — creates and manages the tree widget |
| `views/explorerViewer.ts` | All rendering providers: `FilesRenderer`, `ExplorerDelegate`, `ExplorerDataSource`, `FilesFilter`, `FileSorter`, `FileDragAndDrop`, `ExplorerCompressionDelegate` |
| `views/explorerDecorationsProvider.ts` | Badge and color decorations for file status |
| `explorerViewlet.ts` | Sidebar container (`ExplorerViewPaneContainer`) and view registration |
| `fileActions.ts` | UI actions: new file/folder, rename, delete, copy/paste |

**Data model** (`src/vs/workbench/contrib/files/common/`):

| File | Purpose |
|------|---------|
| `explorerModel.ts` | `ExplorerItem` class — the data object representing each file/folder node |
| `files.ts` | Context keys (`ExplorerFolderContext`, `FilesExplorerFocusedContext`, etc.) and constants |

**Base tree widget** (`src/vs/base/browser/ui/tree/`):

| File | Purpose |
|------|---------|
| `tree.ts` | Core interfaces: `ITreeRenderer`, `ITreeNode`, `IAsyncDataSource`, `ITreeDragAndDrop` |
| `abstractTree.ts` | `AbstractTree` base class with internal `TreeRenderer` (indent + twistie wrapping) |
| `asyncDataTree.ts` | `AsyncDataTree` and `CompressibleAsyncDataTree` for lazy loading |
| `objectTree.ts` | `ObjectTree` and `CompressibleObjectTree` — in-memory tree |
| `objectTreeModel.ts` | Tree data model for node management |
| `compressedObjectTreeModel.ts` | Compact folder chain compression logic |
| `indexTreeModel.ts` | Lowest-level indexed/flattened tree model |

**Base list widget** (`src/vs/base/browser/ui/list/`):

| File | Purpose |
|------|---------|
| `listView.ts` | Virtual scrolling engine — the DOM rendering core |
| `listWidget.ts` | Keyboard/mouse navigation, focus/selection, and DOM-level DnD event handling |

**DnD utilities**:

| File | Purpose |
|------|---------|
| `src/vs/base/browser/dnd.ts` | `DataTransfers` constants, `DragAndDropData` wrapper |
| `src/vs/platform/dnd/browser/dnd.ts` | `LocalSelectionTransfer`, `extractEditorsAndFilesDropData()` |
| `src/vs/workbench/browser/dnd.ts` | `ResourcesDropHandler`, `fillEditorsDragData()`, `CompositeDragAndDropObserver` |

**Workbench integration**:

| File | Purpose |
|------|---------|
| `src/vs/platform/list/browser/listService.ts` | `WorkbenchCompressibleAsyncDataTree` — the actual class instantiated by the explorer |
| `src/vs/workbench/browser/labels.ts` | `ResourceLabels` — renders file icon + name + decoration for each row |

---

## Conclusion

VS Code's file explorer is not a monolithic tree component but a **precision-layered stack of six abstraction levels**, from the pixel-level virtual scrolling in `listView.ts` up to the explorer-specific `FilesRenderer` that paints file icons and names. The two most important files for anyone studying the implementation are **`explorerViewer.ts`** (all explorer-specific rendering and interaction providers including drag-and-drop) and **`abstractTree.ts`** (the internal `TreeRenderer` that transforms flat list rows into tree-like visual structure through indentation and twistie injection). The DnD system is cleanly separated: generic DOM event handling lives in `listWidget.ts`, the tree-level contract in `tree.ts`, async node unwrapping in `asyncDataTree.ts`, and all explorer-specific move/copy/upload logic in `FileDragAndDrop` within `explorerViewer.ts`. The virtual scrolling design — rendering only viewport-visible rows and recycling DOM elements by template — is what allows the explorer to handle projects with hundreds of thousands of files without performance degradation.