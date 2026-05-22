import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Heuristic: does this path look like a folder?
 *
 * Two signals combined:
 *   1. The path is a strict prefix of any other selected path → definitely a folder.
 *   2. The basename has no file extension → likely a folder (e.g. "data", "docs").
 *
 * The combined signal is good enough for the preview; the materializer
 * doesn't care about the distinction because fs.copy handles both.
 */
function isFolderLike(path, allPaths) {
  const withSlash = path.endsWith('/') ? path : path + '/';
  if (allPaths.some((p) => p !== path && p.startsWith(withSlash))) return true;
  const basename = path.split('/').pop() || '';
  return !basename.includes('.');
}

/**
 * Append the extraFiles section to the tree.
 *
 * Paths are sorted, then walked in order so shared parent folders only
 * emit once (last-emitted-prefix tracking). Each leaf gets a file/folder
 * icon based on the isFolderLike heuristic.
 */
function appendExtraFiles(lines, manifest) {
  const paths = manifest?.extraFiles?.paths || [];
  if (paths.length === 0) return;

  const sorted = [...paths].sort();
  // Track which parent dirs have already been emitted so duplicate
  // siblings don't repeat. Indexed by full prefix (e.g. "docs/legal").
  const emittedPrefixes = new Set();

  for (const path of sorted) {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    // Walk parent segments and emit each unseen one as a folder line.
    for (let i = 0; i < segments.length - 1; i++) {
      const prefix = segments.slice(0, i + 1).join('/');
      if (emittedPrefixes.has(prefix)) continue;
      emittedPrefixes.add(prefix);
      lines.push({
        depth: 1 + i,
        label: `${segments[i]}/`,
        kind: 'dir',
        extra: true,
      });
    }

    // Leaf: file or folder, depending on the heuristic.
    const leafName = segments[segments.length - 1];
    const isFolder = isFolderLike(path, sorted);
    const fullPath = segments.join('/');
    if (isFolder && !emittedPrefixes.has(fullPath)) {
      emittedPrefixes.add(fullPath);
    }
    lines.push({
      depth: segments.length,
      label: isFolder ? `${leafName}/` : leafName,
      kind: isFolder ? 'dir' : 'file',
      extra: true,
    });
  }
}

/**
 * Builds a synthetic .claude/-style tree from the lockfile's items, plus
 * any extraFiles bundled with the manifest. Read-only preview — the
 * actual files only appear after Build/Deploy.
 */
function buildTree(lockfile, manifest) {
  if (!lockfile) return [];

  const lines = [];
  const skills = lockfile.items.filter((i) => i.kind === 'skill');
  const subagents = lockfile.items.filter((i) => i.kind === 'subagent');
  const appType = lockfile.items.find((i) => i.kind === 'application-type');
  const mcps = lockfile.items.filter((i) => i.kind === 'mcp-server');

  lines.push({ depth: 0, label: `${manifest?.name || '<unnamed>'}/`, kind: 'dir' });
  lines.push({ depth: 1, label: '.claude/', kind: 'dir' });
  lines.push({ depth: 2, label: 'settings.json', kind: 'file' });
  if (skills.length > 0) {
    lines.push({ depth: 2, label: 'skills/', kind: 'dir' });
    for (const s of skills) lines.push({ depth: 3, label: `${s.name}/`, kind: 'dir' });
  }
  if (subagents.length > 0) {
    lines.push({ depth: 2, label: 'agents/', kind: 'dir' });
    for (const s of subagents) lines.push({ depth: 3, label: `${s.name}.md`, kind: 'file' });
  }
  if (appType) {
    lines.push({ depth: 1, label: '.etienne/', kind: 'dir' });
    lines.push({ depth: 2, label: 'application-type.json', kind: 'file' });
  }
  if (mcps.length > 0) {
    lines.push({ depth: 1, label: '.mcp.json', kind: 'file' });
  }
  lines.push({ depth: 1, label: 'package.manifest.json', kind: 'file' });
  lines.push({ depth: 1, label: 'package.lock.json', kind: 'file' });

  appendExtraFiles(lines, manifest);

  return lines;
}

export default function ManifestPreviewTree({ lockfile, manifest }) {
  const lines = useMemo(() => buildTree(lockfile, manifest), [lockfile, manifest]);

  if (lines.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        Select items to preview the package layout.
      </Typography>
    );
  }

  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        fontFamily: 'monospace',
        fontSize: '0.72rem',
        lineHeight: 1.5,
        color: 'text.secondary',
        whiteSpace: 'pre',
      }}
    >
      {lines.map((line, idx) => (
        <Box
          key={idx}
          sx={{
            pl: line.depth * 1.5,
            // Tint extraFiles rows so they stand out from catalog-derived
            // entries — same purple family as the Extra files section.
            color: line.extra ? '#6a1b9a' : 'text.secondary',
          }}
        >
          {line.kind === 'dir' ? '📁 ' : '📄 '}
          {line.label}
        </Box>
      ))}
    </Box>
  );
}

// Exported so the manifest pane's extra-files list can reuse the same
// folder/file heuristic and stay visually consistent with the preview.
export { isFolderLike };
