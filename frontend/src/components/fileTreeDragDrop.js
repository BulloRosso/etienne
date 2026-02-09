/**
 * fileTreeDragDrop.js
 *
 * Drag-and-drop controller adapted from VS Code's FileDragAndDrop
 * (explorerViewer.ts).
 *
 * Manages:
 *   - Internal drag (moving files between folders)
 *   - External drag (uploading OS files)
 *   - Auto-expand collapsed folders after a hover delay
 *   - Drop validation (can't drop on self / descendants)
 */

/** VS Code uses a brief delay before auto-expanding hovered folders. */
export const AUTO_EXPAND_DELAY = 800; // ms

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `path` is a descendant of `ancestorPath`.
 * Prevents dropping a folder into one of its own children.
 */
export function isDescendant(ancestorPath, path) {
  if (!ancestorPath || !path) return false;
  const norm = (p) => p.replace(/\\/g, '/');
  const a = norm(ancestorPath);
  const p = norm(path);
  return p.startsWith(a + '/');
}

/**
 * Determine whether a drop onto `targetRow` is valid.
 *
 * Mirrors FileDragAndDrop.onDragOver() which validates:
 *   - target must be a folder
 *   - cannot drop onto the dragged item itself
 *   - cannot drop onto a descendant of the dragged item
 */
export function isValidDropTarget(draggedRow, targetRow) {
  if (!targetRow || targetRow.type !== 'folder') return false;
  if (!draggedRow) return true; // external drag — any folder is OK
  if (draggedRow.id === targetRow.id) return false;
  if (isDescendant(draggedRow.path, targetRow.path)) return false;
  return true;
}

/**
 * Check whether a DragEvent carries external (OS) files.
 */
export function isExternalFileDrag(event) {
  if (event.dataTransfer?.files?.length > 0) return true;
  // During dragover the files list may be empty but types still indicate files
  if (event.dataTransfer?.types?.includes('Files')) return true;
  return false;
}
