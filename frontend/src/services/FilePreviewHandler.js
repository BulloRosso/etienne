import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { buildExtensionMap, getViewerForFile } from '../components/viewerRegistry';

/**
 * FilePreviewHandler - Routes file/service preview requests to the preview pane.
 *
 * Uses the viewer registry to determine the correct viewer for a file path,
 * then publishes a FILE_PREVIEW_REQUEST event. The extension map is injected
 * from App.jsx (kept in sync with backend config + project overrides).
 * Falls back to built-in defaults when no map has been set yet.
 */
class FilePreviewHandler {
  constructor() {
    this._extensionMap = null;
  }

  /**
   * Inject the current extension map (call from App.jsx whenever it changes).
   * @param {Map<string, string>} extensionMap
   */
  setExtensionMap(extensionMap) {
    this._extensionMap = extensionMap;
  }

  /**
   * Handle a file or service preview request.
   * @param {string} filePath - File path or service path (e.g. '#imap/inbox')
   * @param {string} projectName - The current project name
   */
  handlePreview(filePath, projectName) {
    if (!filePath || !projectName) {
      console.error('FilePreviewHandler: filePath and projectName are required');
      return;
    }

    const map = this._extensionMap || buildExtensionMap();
    const viewerName = getViewerForFile(filePath, map);

    if (!viewerName) {
      console.log(`FilePreviewHandler: No viewer registered for "${filePath}"`);
      return;
    }

    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      filePath,
      projectName,
      action: `${viewerName}-preview`
    });
  }
}

// Export a singleton instance
export const filePreviewHandler = new FilePreviewHandler();
