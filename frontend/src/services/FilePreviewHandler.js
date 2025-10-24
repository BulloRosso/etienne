import { claudeEventBus, ClaudeEvents } from '../eventBus';

/**
 * FilePreviewHandler - Decides what to do with a file based on its extension
 *
 * This service handles file preview requests from the filesystem explorer.
 * It checks the file extension and publishes appropriate events to:
 * - Close the filesystem drawer
 * - Activate the Live Changes tab
 * - Add or update the file in the files list
 */
class FilePreviewHandler {
  /**
   * Handle a file preview request
   * @param {string} filePath - The path to the file
   * @param {string} projectName - The name of the project
   */
  handlePreview(filePath, projectName) {
    if (!filePath || !projectName) {
      console.error('FilePreviewHandler: filePath and projectName are required');
      return;
    }

    const extension = this.getFileExtension(filePath);

    // Handle HTML files
    if (extension === 'html' || extension === 'htm') {
      this.handleHtmlPreview(filePath, projectName);
    } else if (extension === 'json') {
      this.handleJsonPreview(filePath, projectName);
    } else if (extension === 'md') {
      this.handleMarkdownPreview(filePath, projectName);
    } else if (extension === 'mermaid') {
      this.handleMermaidPreview(filePath, projectName);
    } else {
      // Future: Handle other file types
      console.log(`FilePreviewHandler: No preview handler for .${extension} files yet`);
    }
  }

  /**
   * Handle HTML file preview
   * @param {string} filePath - The path to the HTML file
   * @param {string} projectName - The project name
   */
  handleHtmlPreview(filePath, projectName) {
    console.log('FilePreviewHandler: Opening HTML preview for', filePath);

    // Publish event to:
    // 1. Close the filesystem drawer
    // 2. Activate the Live Changes tab (tab 0)
    // 3. Add/update the file in the files list
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      filePath,
      projectName,
      action: 'html-preview'
    });
  }

  /**
   * Handle JSON file preview
   * @param {string} filePath - The path to the JSON file
   * @param {string} projectName - The project name
   */
  handleJsonPreview(filePath, projectName) {
    console.log('FilePreviewHandler: Opening JSON preview for', filePath);

    // Publish event to:
    // 1. Close the filesystem drawer
    // 2. Activate the Live Changes tab (tab 0)
    // 3. Add/update the file in the files list
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      filePath,
      projectName,
      action: 'json-preview'
    });
  }

  /**
   * Handle Markdown file preview
   * @param {string} filePath - The path to the Markdown file
   * @param {string} projectName - The project name
   */
  handleMarkdownPreview(filePath, projectName) {
    console.log('FilePreviewHandler: Opening Markdown preview for', filePath);

    // Publish event to:
    // 1. Close the filesystem drawer
    // 2. Activate the Live Changes tab (tab 0)
    // 3. Add/update the file in the files list
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      filePath,
      projectName,
      action: 'markdown-preview'
    });
  }

  /**
   * Handle Mermaid file preview
   * @param {string} filePath - The path to the Mermaid file
   * @param {string} projectName - The project name
   */
  handleMermaidPreview(filePath, projectName) {
    console.log('FilePreviewHandler: Opening Mermaid preview for', filePath);

    // Publish event to:
    // 1. Close the filesystem drawer
    // 2. Activate the Live Changes tab (tab 0)
    // 3. Add/update the file in the files list
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      filePath,
      projectName,
      action: 'mermaid-preview'
    });
  }

  /**
   * Get file extension from path
   * @param {string} filePath - The file path
   * @returns {string} The file extension (lowercase, without dot)
   */
  getFileExtension(filePath) {
    const parts = filePath.split('.');
    if (parts.length > 1) {
      return parts[parts.length - 1].toLowerCase();
    }
    return '';
  }
}

// Export a singleton instance
export const filePreviewHandler = new FilePreviewHandler();
