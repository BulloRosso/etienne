/**
 * fileTreeModel.js
 *
 * Pure functions for the VS Code-style file tree.
 * Adapted from:
 *   - compressedObjectTreeModel.ts (compression algorithm)
 *   - indexTreeModel.ts (tree-to-flat-list conversion)
 *   - tree.ts (TreeVisibility.Recurse filter pattern)
 */

import { formatDistanceToNow, format } from 'date-fns';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ROW_HEIGHT = 22;
export const INDENT_SIZE = 16;

const SYSTEM_FILES = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'data',
  '.claude',
  '.codex',
  '.mcp.json',
  '.etienne',
]);

const TAG_COLORS = [
  '#1976d2', '#388e3c', '#d32f2f', '#f57c00', '#7b1fa2',
  '#c2185b', '#0097a7', '#689f38', '#e64a19',
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function isSystemFile(label) {
  return label.startsWith('.') || SYSTEM_FILES.has(label);
}

export function getTagColor(tag) {
  const hash = tag.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function formatTimestamp(mtimeString) {
  if (!mtimeString) return '';
  const date = new Date(mtimeString);
  const now = new Date();
  const diffInDays = (now - date) / (1000 * 60 * 60 * 24);
  if (diffInDays <= 3) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  return format(date, 'yyyy-MM-dd HH:mm:ss');
}

// ---------------------------------------------------------------------------
// Filter helpers  (TreeVisibility.Recurse pattern from tree.ts)
// ---------------------------------------------------------------------------

/**
 * Returns the visible children of a node after applying system-file and
 * tag filters.  Never mutates the input array.
 */
function filterVisibleChildren(children, parentPath, options) {
  if (!children) return [];
  return children.filter((child) => {
    if (!options.showSystemFiles && isSystemFile(child.label)) return false;
    if (options.selectedTags.length > 0) {
      const childPath = parentPath ? `${parentPath}/${child.label}` : child.label;
      if (!nodeOrDescendantHasTag(child, childPath, options.selectedTags, options.fileTags)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Recursive visibility check — mirrors VS Code's TreeVisibility.Recurse.
 * A node is visible if it (or any descendant) carries a matching tag.
 */
function nodeOrDescendantHasTag(node, currentPath, selectedTags, fileTags) {
  const nodeTags = fileTags[currentPath] || [];
  if (selectedTags.some((t) => nodeTags.includes(t))) return true;
  if (node.children) {
    for (const child of node.children) {
      const childPath = `${currentPath}/${child.label}`;
      if (nodeOrDescendantHasTag(child, childPath, selectedTags, fileTags)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Compression  (adapted from compressedObjectTreeModel.ts)
// ---------------------------------------------------------------------------

/**
 * Walk single-child folder chains and compress them into one FlatRow.
 *
 * VS Code stores compressed chains as ICompressedTreeNode<T> with an
 * elements[] array.  We produce a FlatRow with nodeIds[] and labels[].
 */
function tryCompress(node, startPath, depth, expandedSet, options) {
  const chain = [node];
  const chainIds = [node.id];
  const chainLabels = [node.label];
  let current = node;
  let currentPath = startPath;

  while (current.children) {
    const visible = filterVisibleChildren(current.children, currentPath, options);
    if (visible.length === 1 && visible[0].type === 'folder') {
      const child = visible[0];
      const childPath = `${currentPath}/${child.label}`;
      chain.push(child);
      chainIds.push(child.id);
      chainLabels.push(child.label);
      current = child;
      currentPath = childPath;
    } else {
      break;
    }
  }

  const isCompressed = chain.length > 1;
  const deepestNode = chain[chain.length - 1];
  const expansionKey = chainIds.join('/');
  const isExpanded = expandedSet.has(expansionKey);

  // Most-recent mtime across the chain
  const mtime = chain.reduce((latest, n) => {
    if (!n.mtime) return latest;
    if (!latest) return n.mtime;
    return new Date(n.mtime) > new Date(latest) ? n.mtime : latest;
  }, null);

  const deepestChildren = filterVisibleChildren(deepestNode.children, currentPath, options);

  return {
    row: {
      id: expansionKey,
      nodeIds: chainIds,
      label: isCompressed ? chainLabels.join('/') : node.label,
      labels: chainLabels,
      depth,
      type: 'folder',
      mtime,
      isExpanded,
      hasChildren: deepestChildren.length > 0,
      isCompressed,
      path: currentPath,
      originalNode: deepestNode,
      parentPath: startPath.includes('/')
        ? startPath.substring(0, startPath.lastIndexOf('/'))
        : '',
    },
    deepestNode,
    deepestPath: currentPath,
  };
}

// ---------------------------------------------------------------------------
// Tree flattening  (adapted from indexTreeModel.ts splice)
// ---------------------------------------------------------------------------

/**
 * Flatten a hierarchical tree into a FlatRow[] of visible rows.
 * Only children of expanded nodes are included.
 *
 * Pure function — never mutates the input tree.
 */
export function flattenTree(nodes, expandedSet, options) {
  const result = [];

  function visit(nodeList, depth, parentPath) {
    for (const node of nodeList) {
      if (!options.showSystemFiles && isSystemFile(node.label)) continue;

      const currentPath = parentPath ? `${parentPath}/${node.label}` : node.label;

      if (options.selectedTags.length > 0) {
        if (!nodeOrDescendantHasTag(node, currentPath, options.selectedTags, options.fileTags)) {
          continue;
        }
      }

      if (node.type === 'folder') {
        const compressed = tryCompress(node, currentPath, depth, expandedSet, options);
        result.push(compressed.row);

        if (compressed.row.isExpanded && compressed.deepestNode.children) {
          const visibleChildren = filterVisibleChildren(
            compressed.deepestNode.children,
            compressed.deepestPath,
            options,
          );
          visit(visibleChildren, depth + 1, compressed.deepestPath);
        }
      } else {
        result.push({
          id: node.id,
          nodeIds: [node.id],
          label: node.label,
          labels: [node.label],
          depth,
          type: 'file',
          mtime: node.mtime || null,
          isExpanded: false,
          hasChildren: false,
          isCompressed: false,
          path: currentPath,
          originalNode: node,
          parentPath: parentPath || '',
        });
      }
    }
  }

  visit(nodes, 0, '');
  return result;
}

// ---------------------------------------------------------------------------
// Virtual-scroll range  (adapted from listView.ts RangeMap)
// ---------------------------------------------------------------------------

export function computeVisibleRange(scrollTop, containerHeight, totalRows, overscan = 5) {
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
  const endIndex = Math.min(totalRows - 1, startIndex + visibleCount + 2 * overscan);
  return { startIndex, endIndex };
}
