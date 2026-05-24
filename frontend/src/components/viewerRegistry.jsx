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
import DocxViewer from './DocxViewer';
import RequirementsViewer from './RequirementsViewer';
import ArtifactsForSession from './ArtifactsForSession';
import IMAPInboxViewer from './IMAPInboxViewer';
import GanttDiagram from './GanttDiagram';
import A2UIAppViewer from './A2UIAppViewer';
import DreamsPreviewViewer from './DreamsPreviewViewer';
import QuarterlyViewer from './QuarterlyViewer';
import { agentBus } from '../services/agentBus';

/**
 * Components that opt in to the agentBus by attaching a static
 * `agentbusEventsOut()` method. Registered once on module load.
 */
export const VIEWER_AGENTBUS_PROVIDERS = {
  gantt: GanttDiagram,
};
for (const [name, comp] of Object.entries(VIEWER_AGENTBUS_PROVIDERS)) {
  agentBus.registerCatalog(name, comp);
}

/**
 * Service previewers — activated by running services, not file extensions.
 * Triggered via service paths: #<serviceName>/<function> (e.g. #imap/inbox).
 */
export const SERVICE_PREVIEWERS = {
  imap: {
    viewerName: 'imap',
    functions: ['/inbox'],
    displayName: 'Email Inbox',
  },
};

/**
 * Maps viewer registry keys to their actual React component file names.
 * Used by PreviewersManager to display the real component path.
 */
export const VIEWER_COMPONENT_NAMES = {
  html: 'LiveHTMLPreview',
  json: 'JSONViewer',
  jsonl: 'JSONViewer',
  markdown: 'MarkdownViewer',
  mermaid: 'MermaidViewer',
  research: 'ResearchDocument',
  image: 'ImageViewer',
  excel: 'ExcelViewer',
  prompt: 'PromptEditor',
  workflow: 'WorkflowVisualizer',
  scrapbook: 'ScrapbookViewer',
  video: 'VideoViewer',
  knowledge: 'KnowledgeViewer',
  pdf: 'PdfViewer',
  docx: 'DocxViewer',
  requirements: 'RequirementsViewer',
  artifacts: 'ArtifactsForSession',
  imap: 'IMAPInboxViewer',
  gantt: 'GanttDiagram',
  a2ui: 'A2UIAppViewer',
  dreams: 'DreamsPreviewViewer',
  quarterly: 'QuarterlyViewer',
};

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
  docx: (file, projectName) => (
    <DocxViewer filename={file.path} projectName={projectName} />
  ),
  requirements: (file, projectName) => (
    <RequirementsViewer filename={file.path} projectName={projectName} />
  ),
  artifacts: (file, projectName) => (
    <ArtifactsForSession filename={file.path} projectName={projectName} />
  ),
  imap: (file, projectName) => (
    <IMAPInboxViewer servicePath={file.path} projectName={projectName} />
  ),
  gantt: (file, projectName, onViewerStateChange) => (
    <GanttDiagram filename={file.path} projectName={projectName} onViewerStateChange={onViewerStateChange} />
  ),
  a2ui: (file, projectName) => (
    <A2UIAppViewer filename={file.path} projectName={projectName} />
  ),
  dreams: (file, projectName) => (
    <DreamsPreviewViewer filename={file.path} projectName={projectName} />
  ),
  quarterly: (file, projectName) => (
    <QuarterlyViewer filename={file.path} projectName={projectName} />
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
  { viewer: 'docx', extensions: ['.docx', '.doc'] },
  { viewer: 'requirements', extensions: ['.requirements.json'] },
  { viewer: 'artifacts', extensions: ['.artifacts.md'] },
  { viewer: 'budget', extensions: ['.budget.json'] },
  { viewer: 'gantt', extensions: ['.gantt.json'] },
  { viewer: 'a2ui', extensions: ['.a2ui'] },
  { viewer: 'dreams', extensions: ['.dreams.json'] },
  { viewer: 'quarterly', extensions: ['.quarterly.json'] },
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
    if (previewer.type === 'folder') continue;     // folder entries don't participate in the extension map
    for (const ext of (previewer.extensions || [])) {
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

  // Service viewer paths start with # (e.g. #imap/inbox)
  if (filePath.startsWith('#')) {
    const serviceName = filePath.substring(1).split('/')[0];
    const svc = SERVICE_PREVIEWERS[serviceName];
    return svc ? svc.viewerName : null;
  }

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

/**
 * Returns context menu actions applicable to a file, based on previewer config.
 * Evaluates conditions against the file row and filters by user role.
 *
 * @param {object} row - File row from the file tree ({ path, type, ... })
 * @param {Array} previewersConfig - Previewer config from backend (with contextMenuActions)
 * @param {Map} extensionMap - Current extension map
 * @param {object} user - Current user ({ role, ... })
 * @returns {Array} Matching context menu actions
 */
export function getContextMenuActions(row, previewersConfig, extensionMap, user) {
  if (!row || row.type === 'folder' || !previewersConfig || !extensionMap) return [];

  const viewerName = getViewerForFile(row.path, extensionMap);
  if (!viewerName) return [];

  const previewer = previewersConfig.find(p => p.viewer === viewerName);
  if (!previewer?.contextMenuActions) return [];

  return previewer.contextMenuActions.filter(action => {
    // Role check
    if (action.minRole && user) {
      if (action.minRole === 'user' && user.role === 'guest') return false;
      if (action.minRole === 'admin' && user.role !== 'admin') return false;
    } else if (action.minRole && !user) {
      return false;
    }

    // Condition check
    if (action.condition) {
      const filePath = row.path || '';
      const fileName = filePath.split('/').pop() || '';
      switch (action.condition.type) {
        case 'filename':
          if (fileName !== action.condition.value) return false;
          break;
        case 'extension':
          if (!filePath.toLowerCase().endsWith(action.condition.value.toLowerCase())) return false;
          break;
        case 'pathContains':
          if (!filePath.toLowerCase().split('/').some(seg => seg === action.condition.value.toLowerCase())) return false;
          break;
        default:
          break;
      }
    }

    return true;
  });
}

/**
 * Glob-style match of a single folder name against a pattern.
 * Anchored full-string match. `*` matches any sequence. Case-insensitive.
 *   matchFolderPattern('onedrive-personal', 'onedrive*') === true
 *   matchFolderPattern('myonedrive', 'onedrive*') === false
 */
export function matchFolderPattern(folderName, pattern) {
  if (!folderName || !pattern) return false;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(folderName);
}

/**
 * Returns context menu actions applicable to a folder row, based on previewer config.
 * Matches folder-type entries by glob against any path segment of the folder row.
 * (The file tree compresses single-child chains into one row, so `onedrive/personal`
 * may surface as a single row — we still want `onedrive*` to match.)
 * Each returned action carries a `_previewer` reference for mcpGroup lookup.
 */
export function getFolderContextMenuActions(row, previewersConfig, user) {
  if (!row || row.type !== 'folder' || !previewersConfig) return [];
  const segments = (row.path || '').split('/').filter(Boolean);
  if (!segments.length) return [];

  const out = [];
  for (const p of previewersConfig) {
    if (p.type !== 'folder' || !Array.isArray(p.folderPatterns)) continue;
    const matches = p.folderPatterns.some(pat =>
      segments.some(seg => matchFolderPattern(seg, pat))
    );
    if (!matches) continue;
    for (const action of (p.contextMenuActions || [])) {
      // Role gate — same logic as getContextMenuActions
      if (action.minRole && user) {
        if (action.minRole === 'user' && user.role === 'guest') continue;
        if (action.minRole === 'admin' && user.role !== 'admin') continue;
      } else if (action.minRole && !user) {
        continue;
      }
      out.push({ ...action, _previewer: p });
    }
  }
  return out;
}

/**
 * Resolve a dotted JSONPath subset against a JSON value.
 * Supports '$', '$.foo', '$.foo.bar'. Returns undefined on miss.
 */
export function evalDotPath(json, expr) {
  if (!expr || expr === '$') return json;
  const path = expr.startsWith('$.') ? expr.slice(2) : expr.replace(/^\$/, '');
  let cur = json;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/**
 * Evaluate `stateEndpoint` for a set of actions.
 * Dedupes endpoint URLs, fetches them in parallel, walks the dot-path expression,
 * and returns a map: actionId -> { enabled, hidden }.
 * Network failures degrade to enabled=false. Actions without a stateEndpoint are always enabled.
 */
export async function evaluateActionStates(actions, projectName, apiAxios) {
  const result = {};
  if (!actions?.length) return result;

  const urlMap = new Map();
  for (const a of actions) {
    if (!a.stateEndpoint?.url) continue;
    const url = a.stateEndpoint.url.replace(/\{project\}/g, encodeURIComponent(projectName));
    if (!urlMap.has(url)) {
      urlMap.set(url, apiAxios.get(url).then(r => r.data).catch(() => null));
    }
  }

  const entries = [...urlMap.entries()];
  const responses = await Promise.all(entries.map(([, p]) => p));
  const byUrl = new Map(entries.map(([url], i) => [url, responses[i]]));

  for (const a of actions) {
    if (!a.stateEndpoint?.url) {
      result[a.id] = { enabled: true, hidden: false };
      continue;
    }
    const url = a.stateEndpoint.url.replace(/\{project\}/g, encodeURIComponent(projectName));
    const data = byUrl.get(url);
    if (data == null) {
      result[a.id] = { enabled: false, hidden: false };
      continue;
    }
    const truthy = !!evalDotPath(data, a.stateEndpoint.expression);
    if (truthy) {
      result[a.id] = { enabled: true, hidden: false };
    } else if (a.stateEndpoint.fallback === 'hide') {
      result[a.id] = { enabled: false, hidden: true };
    } else {
      result[a.id] = { enabled: false, hidden: false };
    }
  }
  return result;
}
