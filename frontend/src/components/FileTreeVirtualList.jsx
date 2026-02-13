/**
 * FileTreeVirtualList.jsx
 *
 * Virtual-scroll file tree adapted from VS Code's listView.ts (scroll engine)
 * and abstractTree.ts (TreeRenderer row structure: [Indent][Twistie][Content]).
 *
 * Renders only the rows visible in the viewport (+ overscan buffer), using
 * absolute positioning and a spacer div for correct scrollbar height.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Box, Chip } from '@mui/material';
import '@vscode/codicons/dist/codicon.css';
import { FileIcon, FolderIcon } from '@react-symbols/icons/utils';
import {
  ROW_HEIGHT,
  INDENT_SIZE,
  computeVisibleRange,
  formatTimestamp,
} from './fileTreeModel';
import {
  AUTO_EXPAND_DELAY,
  isValidDropTarget,
  isExternalFileDrag,
} from './fileTreeDragDrop';

// ---------------------------------------------------------------------------
// FileTreeRow — a single absolutely-positioned row
// ---------------------------------------------------------------------------

const FileTreeRow = React.memo(function FileTreeRow({
  row,
  index,
  fileTags,
  getTagColor,
  releaseComments,
  isGuest,
  isDropTarget,
  isDragged,
  onToggleExpand,
  onContextMenu,
  onDragStartRow,
  onDragEnterRow,
  onDragOverRow,
  onDropRow,
  onDragLeaveRow,
}) {
  const nodeTags = fileTags[row.path] || [];
  const hasReleaseComment = releaseComments && !!releaseComments[row.path];

  // For compressed rows use the last (deepest) folder name for icon lookup
  const folderName = row.labels[row.labels.length - 1];

  return (
    <Box
      sx={{
        position: 'absolute',
        top: index * ROW_HEIGHT,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: `${row.depth * INDENT_SIZE + 4}px`,
        paddingRight: '8px',
        cursor: 'pointer',
        fontSize: '13px',
        lineHeight: `${ROW_HEIGHT}px`,
        transform: 'translate3d(0,0,0)', // GPU compositing (VS Code pattern)
        backgroundColor: isDropTarget
          ? 'rgba(25, 118, 210, 0.12)'
          : 'transparent',
        opacity: isDragged ? 0.4 : 1,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        '&:hover': {
          backgroundColor: isDropTarget
            ? 'rgba(25, 118, 210, 0.2)'
            : '#FFD700',
        },
      }}
      draggable={!isGuest}
      onClick={(e) => {
        e.stopPropagation();
        onContextMenu(e, row);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (row.type === 'folder') onToggleExpand(row.id);
      }}
      onDragStart={(e) => onDragStartRow(e, row)}
      onDragEnter={(e) => onDragEnterRow(e, row)}
      onDragOver={(e) => onDragOverRow(e, row)}
      onDrop={(e) => onDropRow(e, row)}
      onDragLeave={(e) => onDragLeaveRow(e)}
    >
      {/* ── Twistie (expand / collapse chevron) ── */}
      {row.type === 'folder' ? (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(row.id);
          }}
          style={{
            width: 16,
            height: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginRight: 2,
          }}
        >
          {row.hasChildren && (
            <i
              className={`codicon ${
                row.isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'
              }`}
              style={{ fontSize: 16 }}
            />
          )}
        </span>
      ) : (
        <span style={{ width: 16, flexShrink: 0, marginRight: 2 }} />
      )}

      {/* ── File / Folder icon ── */}
      <span
        style={{
          width: 16,
          height: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginRight: 4,
        }}
      >
        {row.type === 'folder' ? (
          <FolderIcon folderName={folderName} width={16} height={16} />
        ) : (
          <FileIcon fileName={row.label} autoAssign width={16} height={16} />
        )}
      </span>

      {/* ── Label ── */}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {row.label}
      </span>

      {/* ── Tag chips ── */}
      {nodeTags.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0 }}>
          {nodeTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              sx={{
                height: '14px',
                fontSize: '0.65rem',
                backgroundColor: getTagColor(tag),
                color: 'white',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          ))}
        </Box>
      )}

      {/* ── Release comment indicator ── */}
      {hasReleaseComment && (
        <Box
          sx={{
            ml: 0.5,
            flexShrink: 0,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#1976d2',
          }}
          title="Has release comment"
        />
      )}

      {/* ── Timestamp ── */}
      <Box
        sx={{
          ml: 'auto',
          fontSize: '0.7rem',
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          pl: 1,
        }}
      >
        {formatTimestamp(row.mtime)}
      </Box>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// FileTreeVirtualList — the scroll container
// ---------------------------------------------------------------------------

export default function FileTreeVirtualList({
  flatRows,
  fileTags,
  getTagColor,
  releaseComments = {},
  isGuest,
  onToggleExpand,
  onContextMenu,
  onDrop,
  onDropExternal,
  onDropToRoot,
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // DnD state (mirrors VS Code's LocalSelectionTransfer)
  const [draggedRowId, setDraggedRowId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const autoExpandTimerRef = useRef(null);
  const draggedRowRef = useRef(null);

  // ── Measure container with ResizeObserver ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Scroll handler ──
  const handleScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // ── Compute visible range ──
  const totalHeight = flatRows.length * ROW_HEIGHT;
  const { startIndex, endIndex } = computeVisibleRange(
    scrollTop,
    containerHeight,
    flatRows.length,
  );

  const visibleRows = [];
  for (let i = startIndex; i <= endIndex && i < flatRows.length; i++) {
    visibleRows.push({ row: flatRows[i], index: i });
  }

  // ── Clear auto-expand timer helper ──
  const clearAutoExpand = useCallback(() => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
  }, []);

  // ── DnD handlers (adapted from FileDragAndDrop) ──

  const handleDragStartRow = useCallback((e, row) => {
    if (isGuest) { e.preventDefault(); return; }
    e.stopPropagation();
    setDraggedRowId(row.id);
    draggedRowRef.current = row;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.path);
  }, [isGuest]);

  const handleDragEnterRow = useCallback((e, row) => {
    e.preventDefault();
    e.stopPropagation();
    if (row.type !== 'folder') { setDropTargetId(null); return; }
    if (!isValidDropTarget(draggedRowRef.current, row)) return;
    setDropTargetId(row.id);

    // Auto-expand collapsed folder after delay
    clearAutoExpand();
    if (!row.isExpanded && row.hasChildren) {
      autoExpandTimerRef.current = setTimeout(() => {
        onToggleExpand(row.id);
      }, AUTO_EXPAND_DELAY);
    }
  }, [clearAutoExpand, onToggleExpand]);

  const handleDragOverRow = useCallback((e, row) => {
    e.preventDefault();
    e.stopPropagation();
    if (row.type === 'folder' && isValidDropTarget(draggedRowRef.current, row)) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDropRow = useCallback((e, targetRow) => {
    e.preventDefault();
    e.stopPropagation();
    clearAutoExpand();

    // External OS file drop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !draggedRowRef.current) {
      onDropExternal(e, targetRow);
      setDropTargetId(null);
      setDraggedRowId(null);
      draggedRowRef.current = null;
      return;
    }

    // Internal move
    if (draggedRowRef.current && targetRow) {
      onDrop(e, draggedRowRef.current, targetRow);
    }
    setDropTargetId(null);
    setDraggedRowId(null);
    draggedRowRef.current = null;
  }, [clearAutoExpand, onDrop, onDropExternal]);

  const handleDragLeaveRow = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're leaving the current drop target
    // (dragenter on a new target will set a new one)
  }, []);

  // ── Root-level drop (empty area) ──
  const handleRootDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleRootDrop = useCallback((e) => {
    e.preventDefault();
    clearAutoExpand();

    // External files dropped on root
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !draggedRowRef.current) {
      onDropToRoot(e);
      setDropTargetId(null);
      setDraggedRowId(null);
      draggedRowRef.current = null;
      return;
    }

    // Internal move to root
    if (draggedRowRef.current) {
      onDrop(e, draggedRowRef.current, null);
    }
    setDropTargetId(null);
    setDraggedRowId(null);
    draggedRowRef.current = null;
  }, [clearAutoExpand, onDrop, onDropToRoot]);

  // Clean up on drag end (e.g. dropped outside)
  useEffect(() => {
    const handleDragEnd = () => {
      clearAutoExpand();
      setDraggedRowId(null);
      setDropTargetId(null);
      draggedRowRef.current = null;
    };
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, [clearAutoExpand]);

  return (
    <Box
      ref={containerRef}
      onScroll={handleScroll}
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      sx={{
        flex: 1,
        border: '1px solid #ddd',
        borderRadius: 1,
        overflow: 'auto',
        position: 'relative',
        p: '10px',
      }}
    >
      {/* Spacer creates the correct scrollbar height */}
      <Box sx={{ height: totalHeight, position: 'relative' }}>
        {visibleRows.map(({ row, index }) => (
          <FileTreeRow
            key={row.id}
            row={row}
            index={index}
            fileTags={fileTags}
            getTagColor={getTagColor}
            releaseComments={releaseComments}
            isGuest={isGuest}
            isDropTarget={dropTargetId === row.id}
            isDragged={draggedRowId === row.id}
            onToggleExpand={onToggleExpand}
            onContextMenu={onContextMenu}
            onDragStartRow={handleDragStartRow}
            onDragEnterRow={handleDragEnterRow}
            onDragOverRow={handleDragOverRow}
            onDropRow={handleDropRow}
            onDragLeaveRow={handleDragLeaveRow}
          />
        ))}
      </Box>
    </Box>
  );
}
