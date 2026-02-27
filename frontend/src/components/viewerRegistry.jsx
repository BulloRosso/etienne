import React from 'react';
import LiveHTMLPreview from './LiveHTMLPreview';
import JSONViewer from './JSONViewer';
import MarkdownViewer from './MarkdownViewer';
import MermaidViewer from './MermaidViewer';
import ResearchDocument from './ResearchDocument';
import ImageViewer from './ImageViewer';
import ExcelViewer from './ExcelViewer';
import WorkflowVisualizer from './WorkflowVisualizer';
import PromptEditor from './PromptEditor';
import ScrapbookViewer from './ScrapbookViewer';

/**
 * Maps viewer names to their component render functions.
 * Each function receives (file, projectName) and returns JSX.
 */
export const VIEWER_COMPONENTS = {
  html: (file, projectName) => (
    <LiveHTMLPreview filename={file.path} projectName={projectName} />
  ),
  json: (file, projectName) => (
    <JSONViewer filename={file.path} projectName={projectName} />
  ),
  jsonl: (file, projectName) => (
    <JSONViewer filename={file.path} projectName={projectName} isJsonl />
  ),
  markdown: (file, projectName) => (
    <MarkdownViewer filename={file.path} projectName={projectName} />
  ),
  mermaid: (file, projectName) => (
    <MermaidViewer filename={file.path} projectName={projectName} />
  ),
  research: (file, projectName) => (
    <ResearchDocument input="" output={file.path} projectName={projectName} />
  ),
  image: (file, projectName) => (
    <ImageViewer filename={file.path} projectName={projectName} />
  ),
  excel: (file, projectName) => (
    <ExcelViewer filename={file.path} projectName={projectName} />
  ),
  prompt: (file, projectName) => (
    <PromptEditor filename={file.path} projectName={projectName} />
  ),
  workflow: (file, projectName) => (
    <WorkflowVisualizer workflowFile={file.path} projectName={projectName} />
  ),
  scrapbook: (file, projectName) => (
    <ScrapbookViewer filename={file.path} projectName={projectName} />
  ),
};

/**
 * Build a lookup map from file extension to viewer name.
 * System defaults are applied first, then project overrides win.
 */
export function buildExtensionMap(systemPreviewers = [], projectOverrides = []) {
  const map = new Map();

  for (const previewer of systemPreviewers) {
    for (const ext of previewer.extensions) {
      map.set(ext.toLowerCase(), previewer.viewer);
    }
  }

  for (const override of projectOverrides) {
    map.set(override.extension.toLowerCase(), override.viewer);
  }

  return map;
}

/**
 * Determine the viewer for a given file path.
 * Sorts by extension length descending so .workflow.json matches before .json.
 */
export function getViewerForFile(filePath, extensionMap) {
  if (!filePath) return null;
  const lowerPath = filePath.toLowerCase();

  const sortedEntries = [...extensionMap.entries()].sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [ext, viewer] of sortedEntries) {
    if (lowerPath.endsWith(ext)) {
      return viewer === 'none' ? null : viewer;
    }
  }

  return null;
}
