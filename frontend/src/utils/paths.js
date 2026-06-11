// Pure path/time helpers extracted from App.jsx (Phase 1 of the decomposition).
// No React, no module-level mutable state, no heavy imports — safe to unit-test
// in isolation. (hasPreviewExtension lives in viewerRegistry.jsx since it depends
// on the viewer lookup, which transitively pulls in @mui/icons-material.)

/**
 * Current wall-clock time as a zero-padded HH:MM string (24h).
 * @returns {string}
 */
export function formatTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Convert an absolute workspace path to a project-relative path.
 *
 * e.g. C:\...\workspace\pet-store-4\out\vogel-angebote.html  ->  out/vogel-angebote.html
 *
 * Splits on both slash styles, finds the `workspace` segment, and drops it plus
 * the project-name segment that follows. If there's no `workspace` segment (the
 * path is already relative), it's returned unchanged.
 *
 * @param {string} absolutePath
 * @returns {string}
 */
export function extractRelativePath(absolutePath) {
  const pathParts = absolutePath.split(/[/\\]/);
  const workspaceIndex = pathParts.findIndex(p => p === 'workspace');

  if (workspaceIndex !== -1 && pathParts.length > workspaceIndex + 2) {
    // Skip `workspace` and the project dir, keep the rest.
    return pathParts.slice(workspaceIndex + 2).join('/');
  }

  // Already relative — return as-is.
  return absolutePath;
}
