/**
 * Filesystem.jsx
 *
 * VS Code-style file explorer adapted from explorerView.ts.
 * Orchestrates the virtual tree, dialogs, context menu, tag filtering,
 * and all file operations.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  FormControlLabel,
  Checkbox,
  TextField,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Tooltip,
  Chip,
  Autocomplete,
} from '@mui/material';
import '@vscode/codicons/dist/codicon.css';
import { apiAxios } from '../services/api';
import BackgroundInfo from './BackgroundInfo';
import { filePreviewHandler } from '../services/FilePreviewHandler';
import TagManager from './TagManager';
import { useAuth } from '../contexts/AuthContext.jsx';
import FileTreeVirtualList from './FileTreeVirtualList';
import { flattenTree, getTagColor } from './fileTreeModel';

export default function Filesystem({ projectName, showBackgroundInfo }) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const isGuest = hasRole('guest');

  // ── Data state ──
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSystemFiles, setShowSystemFiles] = useState(false);

  // ── Tree expansion (persisted per project in localStorage) ──
  const storageKey = `filesystem-expanded:${projectName}`;
  const [expandedSet, setExpandedSet] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState(null);

  // ── Dialogs ──
  const [renameDialog, setRenameDialog] = useState({ open: false, row: null, newName: '' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, row: null });
  const [newFolderDialog, setNewFolderDialog] = useState({ open: false, folderName: '' });

  // ── Tags ──
  const [fileTags, setFileTags] = useState({});
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagManagerDialog, setTagManagerDialog] = useState({ open: false, row: null, filePath: '' });

  // ── Release comments (compliance) ──
  const [releaseComments, setReleaseComments] = useState({});
  const [releaseEnabled, setReleaseEnabled] = useState(false);

  // ── File upload ──
  const fileInputRef = useRef(null);

  // ── Load data ──
  useEffect(() => {
    loadFilesystem();
    loadTags();
    loadReleaseData();
  }, [projectName]);

  const loadFilesystem = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAxios.post('/api/claude/filesystem', { projectName });
      setTree(response.data.tree || []);
    } catch (err) {
      setError('Failed to load filesystem');
      console.error('Load filesystem error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const response = await apiAxios.get(`/api/workspace/${projectName}/tags`);
      setAllTags(response.data || []);
      const tagsMap = {};
      response.data.forEach((tagInfo) => {
        tagInfo.files.forEach((file) => {
          if (!tagsMap[file]) tagsMap[file] = [];
          tagsMap[file].push(tagInfo.tag);
        });
      });
      setFileTags(tagsMap);
    } catch (err) {
      console.error('Load tags error:', err);
    }
  };

  const loadReleaseData = async () => {
    try {
      const statusRes = await apiAxios.get(`/api/compliance/${projectName}/status`);
      setReleaseEnabled(!statusRes.data.isInitialRelease);
      const commentsRes = await apiAxios.get(`/api/compliance/${projectName}/release-comments`);
      setReleaseComments(commentsRes.data || {});
    } catch (err) {
      // Compliance module may not be available — silently ignore
      console.debug('Release data not available:', err.message);
    }
  };

  // ── Flatten tree (useMemo for performance) ──
  const flatRows = useMemo(
    () =>
      flattenTree(tree, expandedSet, {
        showSystemFiles,
        selectedTags,
        fileTags,
      }),
    [tree, expandedSet, showSystemFiles, selectedTags, fileTags],
  );

  // ── Persist expansion state to localStorage ──
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expandedSet]));
    } catch { /* storage full or unavailable */ }
  }, [expandedSet, storageKey]);

  // ── Expand / collapse ──
  const handleToggleExpand = useCallback((rowId) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  // ── Context menu ──
  const handleContextMenu = useCallback((event, row) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ mouseX: event.clientX, mouseY: event.clientY, row });
  }, []);

  const handleCloseContextMenu = () => setContextMenu(null);

  // ── Preview ──
  const handlePreviewClick = () => {
    if (contextMenu?.row && contextMenu.row.type !== 'folder') {
      filePreviewHandler.handlePreview(contextMenu.row.path, projectName);
    }
    handleCloseContextMenu();
  };

  // ── Rename ──
  const handleRenameClick = () => {
    if (contextMenu?.row) {
      setRenameDialog({ open: true, row: contextMenu.row, newName: contextMenu.row.labels[contextMenu.row.labels.length - 1] });
    }
    handleCloseContextMenu();
  };

  const handleRenameSubmit = async () => {
    const row = renameDialog.row;
    if (!renameDialog.newName.trim() || renameDialog.newName === row?.labels[row.labels.length - 1]) {
      setRenameDialog({ open: false, row: null, newName: '' });
      return;
    }
    try {
      await apiAxios.put(`/api/workspace/${projectName}/files/rename`, {
        filepath: row.path,
        newName: renameDialog.newName.trim(),
      });
      await loadFilesystem();
      setRenameDialog({ open: false, row: null, newName: '' });
    } catch (err) {
      setError(`Failed to rename: ${err.response?.data?.message || err.message}`);
      setRenameDialog({ open: false, row: null, newName: '' });
    }
  };

  const handleRenameCancel = () => setRenameDialog({ open: false, row: null, newName: '' });

  // ── Delete ──
  const handleDeleteClick = () => {
    if (contextMenu?.row) setDeleteDialog({ open: true, row: contextMenu.row });
    handleCloseContextMenu();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.row) return;
    try {
      await apiAxios.delete(`/api/workspace/${projectName}/files/${deleteDialog.row.path}`);
      await loadFilesystem();
      setDeleteDialog({ open: false, row: null });
    } catch (err) {
      setError(`Failed to delete: ${err.response?.data?.message || err.message}`);
      setDeleteDialog({ open: false, row: null });
    }
  };

  const handleDeleteCancel = () => setDeleteDialog({ open: false, row: null });

  // ── Tag management ──
  const handleManageTagsClick = () => {
    if (contextMenu?.row) {
      setTagManagerDialog({ open: true, row: contextMenu.row, filePath: contextMenu.row.path });
    }
    handleCloseContextMenu();
  };

  const handleTagManagerClose = () => {
    setTagManagerDialog({ open: false, row: null, filePath: '' });
    loadTags();
    loadReleaseData();
  };

  // ── New folder ──
  const handleNewFolderClick = () => {
    if (isGuest) return;
    setNewFolderDialog({ open: true, folderName: '' });
  };

  const handleNewFolderSubmit = async () => {
    if (!newFolderDialog.folderName.trim()) {
      setNewFolderDialog({ open: false, folderName: '' });
      return;
    }
    try {
      await apiAxios.post(`/api/workspace/${projectName}/files/create-folder`, {
        folderPath: newFolderDialog.folderName.trim(),
      });
      await loadFilesystem();
      setNewFolderDialog({ open: false, folderName: '' });
    } catch (err) {
      setError(`Failed to create folder: ${err.response?.data?.message || err.message}`);
      setNewFolderDialog({ open: false, folderName: '' });
    }
  };

  const handleNewFolderCancel = () => setNewFolderDialog({ open: false, folderName: '' });

  // ── File upload ──
  const handleUploadClick = (row) => {
    if (isGuest) return;
    fileInputRef.current.targetRow = row || null;
    fileInputRef.current.click();
    handleCloseContextMenu();
  };

  const handleFileUpload = async (event) => {
    if (isGuest) return;
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const targetRow = event.target.targetRow;
    const targetPath = targetRow ? targetRow.path : '';
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const filepath = targetPath ? `${targetPath}/${file.name}` : file.name;
        formData.append('filepath', filepath);
        await apiAxios.post(`/api/workspace/${projectName}/files/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await loadFilesystem();
    } catch (err) {
      setError(`Failed to upload: ${err.response?.data?.message || err.message}`);
    }
    event.target.value = '';
  };

  // ── Internal drag-and-drop (move files) ──
  const handleDrop = async (e, draggedRow, targetRow) => {
    if (isGuest) return;
    if (!draggedRow) return;
    // Drop to root
    const targetPath = targetRow ? targetRow.path : '';
    const destinationPath = targetPath
      ? `${targetPath}/${draggedRow.labels[draggedRow.labels.length - 1]}`
      : draggedRow.labels[draggedRow.labels.length - 1];
    if (draggedRow.path === destinationPath) return;
    try {
      await apiAxios.post(`/api/workspace/${projectName}/files/move`, {
        sourcePath: draggedRow.path,
        destinationPath,
      });
      await loadFilesystem();
    } catch (err) {
      setError(`Failed to move: ${err.response?.data?.message || err.message}`);
    }
  };

  // ── External file drop (upload from OS) ──
  const handleDropExternal = async (e, targetRow) => {
    if (isGuest) return;
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;
    const targetPath = targetRow ? targetRow.path : '';

    // Recursively read all files from a directory entry
    const readEntries = (dirReader) =>
      new Promise((resolve, reject) => {
        const allEntries = [];
        const readBatch = () => {
          dirReader.readEntries((entries) => {
            if (entries.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...entries);
              readBatch();
            }
          }, reject);
        };
        readBatch();
      });

    const fileFromEntry = (fileEntry) =>
      new Promise((resolve, reject) => fileEntry.file(resolve, reject));

    const traverseDirectory = async (dirEntry, basePath, results) => {
      const entries = await readEntries(dirEntry.createReader());
      for (const entry of entries) {
        const relativePath = `${basePath}/${entry.name}`;
        if (entry.isFile) {
          const file = await fileFromEntry(entry);
          results.push({ file, relativePath });
        } else if (entry.isDirectory) {
          await traverseDirectory(entry, relativePath, results);
        }
      }
    };

    try {
      const filesToUpload = [];

      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          if (entry.isDirectory) {
            await traverseDirectory(entry, entry.name, filesToUpload);
          } else {
            const file = item.getAsFile();
            if (file) filesToUpload.push({ file, relativePath: file.name });
          }
        } else {
          const file = item.getAsFile();
          if (file) filesToUpload.push({ file, relativePath: file.name });
        }
      }

      for (const { file, relativePath } of filesToUpload) {
        const formData = new FormData();
        formData.append('file', file);
        const filepath = targetPath ? `${targetPath}/${relativePath}` : relativePath;
        formData.append('filepath', filepath);
        await apiAxios.post(`/api/workspace/${projectName}/files/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await loadFilesystem();
    } catch (err) {
      setError(`Failed to upload: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleDropToRoot = (e) => handleDropExternal(e, null);

  // ── Loading state ──
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', p: 2, mr: '0px' }}>
      <BackgroundInfo infoId="filesystem" showBackgroundInfo={showBackgroundInfo} />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ── Tag Filter Bar ── */}
      {allTags.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Autocomplete
            multiple
            size="small"
            options={allTags.map((t) => t.tag)}
            value={selectedTags}
            onChange={(event, newValue) => setSelectedTags(newValue)}
            renderInput={(params) => (
              <TextField {...params} label="Filter by tags" placeholder="Select tags" />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option}
                  label={option}
                  size="small"
                  sx={{ backgroundColor: getTagColor(option), color: 'white' }}
                />
              ))
            }
          />
        </Box>
      )}

      {/* ── Virtual File Tree ── */}
      <FileTreeVirtualList
        flatRows={flatRows}
        fileTags={fileTags}
        getTagColor={getTagColor}
        releaseComments={releaseComments}
        isGuest={isGuest}
        onToggleExpand={handleToggleExpand}
        onContextMenu={handleContextMenu}
        onDrop={handleDrop}
        onDropExternal={handleDropExternal}
        onDropToRoot={handleDropToRoot}
      />

      {/* ── Toolbar ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
        {isAdmin && (
          <FormControlLabel
            control={
              <Checkbox
                checked={showSystemFiles}
                onChange={(e) => setShowSystemFiles(e.target.checked)}
              />
            }
            label="Show System Files"
            sx={{ ml: 2 }}
          />
        )}
        {!isAdmin && <Box />}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={isGuest ? 'Upload (Not available for guests)' : 'Upload'}>
            <span>
              <IconButton
                onClick={() => {
                  if (isGuest) return;
                  fileInputRef.current.targetRow = null;
                  fileInputRef.current.click();
                }}
                disabled={isGuest}
              >
                <i className="codicon codicon-cloud-upload" style={{ fontSize: 20 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={isGuest ? 'New Folder (Not available for guests)' : 'New Folder'}>
            <span>
              <IconButton onClick={handleNewFolderClick} disabled={isGuest}>
                <i className="codicon codicon-new-folder" style={{ fontSize: 20 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton onClick={loadFilesystem}>
              <i className="codicon codicon-refresh" style={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Hidden file input for uploads */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* ── Context Menu ── */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {contextMenu?.row?.type !== 'folder' && (
          <MenuItem onClick={handlePreviewClick}>
            <i className="codicon codicon-eye" style={{ fontSize: 16, marginRight: 8 }} />
            Open for preview
          </MenuItem>
        )}
        {!isGuest && (
          <MenuItem onClick={handleRenameClick}>
            <i className="codicon codicon-edit" style={{ fontSize: 16, marginRight: 8 }} />
            Rename
          </MenuItem>
        )}
        {contextMenu?.row?.type === 'folder' && !isGuest && (
          <MenuItem onClick={() => handleUploadClick(contextMenu.row)}>
            <i className="codicon codicon-cloud-upload" style={{ fontSize: 16, marginRight: 8 }} />
            Upload to folder
          </MenuItem>
        )}
        {!isGuest && (
          <MenuItem onClick={handleDeleteClick}>
            <i className="codicon codicon-trash" style={{ fontSize: 16, marginRight: 8 }} />
            Delete
          </MenuItem>
        )}
        <MenuItem onClick={handleManageTagsClick}>
          <i className="codicon codicon-tag" style={{ fontSize: 16, marginRight: 8 }} />
          Manage Tags
        </MenuItem>
      </Menu>

      {/* ── Rename Dialog ── */}
      <Dialog open={renameDialog.open} onClose={handleRenameCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Rename</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New name"
            fullWidth
            value={renameDialog.newName}
            onChange={(e) => setRenameDialog({ ...renameDialog, newName: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              else if (e.key === 'Escape') handleRenameCancel();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRenameCancel}>Cancel</Button>
          <Button onClick={handleRenameSubmit} variant="contained">
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── New Folder Dialog ── */}
      <Dialog open={newFolderDialog.open} onClose={handleNewFolderCancel} maxWidth="sm" fullWidth>
        <DialogTitle>New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder name"
            fullWidth
            value={newFolderDialog.folderName}
            onChange={(e) => setNewFolderDialog({ ...newFolderDialog, folderName: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewFolderSubmit();
              else if (e.key === 'Escape') handleNewFolderCancel();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleNewFolderCancel}>Cancel</Button>
          <Button onClick={handleNewFolderSubmit} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteDialog.open} onClose={handleDeleteCancel}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{deleteDialog.row?.label}&quot;?
            {deleteDialog.row?.type === 'folder' && (
              <Box component="span" sx={{ display: 'block', mt: 1, color: 'error.main' }}>
                This will delete the folder and all its contents.
              </Box>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Tag Manager Dialog ── */}
      <TagManager
        open={tagManagerDialog.open}
        onClose={handleTagManagerClose}
        projectName={projectName}
        filePath={tagManagerDialog.filePath}
        fileName={tagManagerDialog.row?.label || ''}
        currentTags={fileTags[tagManagerDialog.filePath] || []}
        allTags={allTags}
        releaseEnabled={releaseEnabled}
        releaseComment={releaseComments[tagManagerDialog.filePath] || ''}
        onReleaseCommentSaved={loadReleaseData}
      />
    </Box>
  );
}
