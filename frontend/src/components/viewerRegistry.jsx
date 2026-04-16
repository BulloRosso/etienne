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
import VideoViewer from './VideoViewer';
import KnowledgeViewer from './KnowledgeViewer';
import PdfViewer from './PdfViewer';
import RequirementsViewer from './RequirementsViewer';

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
  video: (file, projectName) => (
    <VideoViewer filename={file.path} projectName={projectName} />
  ),
  knowledge: (file, projectName) => (
    <KnowledgeViewer filename={file.path} projectName={projectName} />
  ),
  pdf: (file, projectName) => (
    <PdfViewer filename={file.path} projectName={projectName} />
  ),
  requirements: (file, projectName) => (
    <RequirementsViewer filename={file.path} projectName={projectName} />
  ),
};

/**
 * Built-in defaults so files render correctly even if the backend
 * previewers configuration hasn't loaded yet (or fails to load).
 */
const BUILTIN_DEFAULTS = [
  { viewer: 'html',      extensions: ['.html', '.htm'] },
  { viewer: 'json',      extensions: ['.json'] },
  { viewer: 'jsonl',     extensions: ['.jsonl'] },
  { viewer: 'markdown',  extensions: ['.md'] },
  { viewer: 'mermaid',   extensions: ['.mermaid'] },
  { viewer: 'research',  extensions: ['.research'] },
  { viewer: 'image',     extensions: ['.jpg', '.jpeg', '.png', '.gif'] },
  { viewer: 'excel',     extensions: ['.xls', '.xlsx'] },
  { viewer: 'prompt',    extensions: ['.prompt'] },
  { viewer: 'workflow',  extensions: ['.workflow.json'] },
  { viewer: 'scrapbook', extensions: ['.scbk'] },
  { viewer: 'video',     extensions: ['.youtube', '.videos', '.mp4'] },
  { viewer: 'knowledge', extensions: ['.knowledge'] },
  { viewer: 'pdf', extensions: ['.pdf'] },
  { viewer: 'requirements', extensions: ['.requirements.json'] },
];

/**
 * Build a lookup map from file extension to viewer name.
 * Built-in defaults are applied first, then system config, then project overrides win.
 */
export function buildExtensionMap(systemPreviewers = [], projectOverrides = []) {
  const map = new Map();

  // Start with built-in defaults
  for (const previewer of BUILTIN_DEFAULTS) {
    for (const ext of previewer.extensions) {
      map.set(ext.toLowerCase(), previewer.viewer);
    }
  }

  // System config from backend overrides built-in defaults
  for (const previewer of systemPreviewers) {
    for (const ext of previewer.extensions) {
      map.set(ext.toLowerCase(), previewer.viewer);
    }
  }

  // Project-level overrides win
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
