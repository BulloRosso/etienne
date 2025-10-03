import React, { useState, useEffect, useRef } from 'react';
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
  Tooltip
} from '@mui/material';
import { Refresh, Delete, Edit, Upload, MoreVert, ExpandMore, ChevronRight } from '@mui/icons-material';
import { TreeView } from '@mui/x-tree-view/TreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { PiFolderThin, PiFolderOpenThin, PiUploadLight } from "react-icons/pi";
import { IoDocumentOutline } from "react-icons/io5";
import { MdOutlineCreateNewFolder } from "react-icons/md";
import axios from 'axios';
import BackgroundInfo from './BackgroundInfo';

export default function Filesystem({ projectName, showBackgroundInfo }) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSystemFiles, setShowSystemFiles] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [renameDialog, setRenameDialog] = useState({ open: false, node: null, newName: '' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, node: null });
  const [newFolderDialog, setNewFolderDialog] = useState({ open: false, folderName: '' });
  const [draggedNode, setDraggedNode] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadFilesystem();
  }, [projectName]);

  const loadFilesystem = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/claude/filesystem', {
        projectName
      });
      setTree(response.data.tree || []);
    } catch (err) {
      setError('Failed to load filesystem');
      console.error('Load filesystem error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get node path from tree
  const getNodePath = (nodeId, nodes = tree, parentPath = '') => {
    for (const node of nodes) {
      const currentPath = parentPath ? `${parentPath}/${node.label}` : node.label;
      if (node.id === nodeId) {
        return currentPath;
      }
      if (node.children) {
        const childPath = getNodePath(nodeId, node.children, currentPath);
        if (childPath) return childPath;
      }
    }
    return null;
  };

  // Helper function to find node by ID
  const findNodeById = (nodeId, nodes = tree) => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children) {
        const found = findNodeById(nodeId, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Handle context menu
  const handleContextMenu = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      node
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Handle rename
  const handleRenameClick = () => {
    if (contextMenu?.node) {
      setRenameDialog({
        open: true,
        node: contextMenu.node,
        newName: contextMenu.node.label
      });
    }
    handleCloseContextMenu();
  };

  const handleRenameSubmit = async () => {
    if (!renameDialog.newName.trim() || renameDialog.newName === renameDialog.node?.label) {
      setRenameDialog({ open: false, node: null, newName: '' });
      return;
    }

    try {
      const nodePath = getNodePath(renameDialog.node.id);
      await axios.put(`/api/workspace/${projectName}/files/rename`, {
        filepath: nodePath,
        newName: renameDialog.newName.trim()
      });
      await loadFilesystem();
      setRenameDialog({ open: false, node: null, newName: '' });
    } catch (err) {
      setError(`Failed to rename: ${err.response?.data?.message || err.message}`);
      console.error('Rename error:', err);
      setRenameDialog({ open: false, node: null, newName: '' });
    }
  };

  const handleRenameCancel = () => {
    setRenameDialog({ open: false, node: null, newName: '' });
  };

  // Handle delete
  const handleDeleteClick = () => {
    if (contextMenu?.node) {
      setDeleteDialog({ open: true, node: contextMenu.node });
    }
    handleCloseContextMenu();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.node) return;

    try {
      const nodePath = getNodePath(deleteDialog.node.id);
      await axios.delete(`/api/workspace/${projectName}/files/${nodePath}`);
      await loadFilesystem();
      setDeleteDialog({ open: false, node: null });
    } catch (err) {
      setError(`Failed to delete: ${err.response?.data?.message || err.message}`);
      console.error('Delete error:', err);
      setDeleteDialog({ open: false, node: null });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, node: null });
  };

  // Handle new folder
  const handleNewFolderClick = () => {
    setNewFolderDialog({ open: true, folderName: '' });
  };

  const handleNewFolderSubmit = async () => {
    if (!newFolderDialog.folderName.trim()) {
      setNewFolderDialog({ open: false, folderName: '' });
      return;
    }

    try {
      await axios.post(`/api/workspace/${projectName}/files/create-folder`, {
        folderPath: newFolderDialog.folderName.trim()
      });
      await loadFilesystem();
      setNewFolderDialog({ open: false, folderName: '' });
    } catch (err) {
      setError(`Failed to create folder: ${err.response?.data?.message || err.message}`);
      console.error('Create folder error:', err);
      setNewFolderDialog({ open: false, folderName: '' });
    }
  };

  const handleNewFolderCancel = () => {
    setNewFolderDialog({ open: false, folderName: '' });
  };

  // Handle file upload
  const handleUploadClick = (node) => {
    // Store the target folder in a ref or state for the upload handler
    fileInputRef.current.targetNode = node;
    fileInputRef.current.click();
    handleCloseContextMenu();
  };

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const targetNode = event.target.targetNode;
    const targetPath = targetNode ? getNodePath(targetNode.id) : '';

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const filepath = targetPath ? `${targetPath}/${file.name}` : file.name;
        formData.append('filepath', filepath);

        await axios.post(`/api/workspace/${projectName}/files/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      }
      await loadFilesystem();
    } catch (err) {
      setError(`Failed to upload: ${err.response?.data?.message || err.message}`);
      console.error('Upload error:', err);
    }

    event.target.value = ''; // Reset input
  };

  // Handle drag and drop for OS files
  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDropExternal = async (event, targetNode) => {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;

    const targetPath = targetNode ? getNodePath(targetNode.id) : '';

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const filepath = targetPath ? `${targetPath}/${file.name}` : file.name;
        formData.append('filepath', filepath);

        await axios.post(`/api/workspace/${projectName}/files/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      }
      await loadFilesystem();
      setDropTarget(null);
    } catch (err) {
      setError(`Failed to upload: ${err.response?.data?.message || err.message}`);
      console.error('Upload error:', err);
      setDropTarget(null);
    }
  };

  // Handle drag and drop for moving files between folders
  const handleDragStart = (event, node) => {
    event.stopPropagation();
    setDraggedNode(node);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    if (node.type === 'folder' && draggedNode && node.id !== draggedNode.id) {
      setDropTarget(node.id);
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = async (event, targetNode) => {
    event.preventDefault();
    event.stopPropagation();

    // Check if it's an external file drop
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      await handleDropExternal(event, targetNode);
      return;
    }

    // Internal drag-and-drop (moving files)
    if (!draggedNode || !targetNode) {
      setDraggedNode(null);
      setDropTarget(null);
      return;
    }

    // Don't allow dropping into self
    if (draggedNode.id === targetNode.id) {
      setDraggedNode(null);
      setDropTarget(null);
      return;
    }

    try {
      const sourcePath = getNodePath(draggedNode.id);
      const targetPath = targetNode ? getNodePath(targetNode.id) : '';
      const destinationPath = targetPath ? `${targetPath}/${draggedNode.label}` : draggedNode.label;

      await axios.post(`/api/workspace/${projectName}/files/move`, {
        sourcePath,
        destinationPath
      });
      await loadFilesystem();
    } catch (err) {
      setError(`Failed to move: ${err.response?.data?.message || err.message}`);
      console.error('Move error:', err);
    } finally {
      setDraggedNode(null);
      setDropTarget(null);
    }
  };

  const filterSystemFiles = (nodes) => {
    if (showSystemFiles) return nodes;

    return nodes.filter(node => {
      // Filter out CLAUDE.md in root and data folder
      if (node.label === 'CLAUDE.md' || node.label === 'data' || node.label === '.claude' || node.label === '.mcp.json') {
        return false;
      }

      // Recursively filter children
      if (node.children) {
        node.children = filterSystemFiles(node.children);
      }

      return true;
    });
  };

  const renderTree = (nodes) => {
    return nodes.map((node) => {
      const isFolder = node.type === 'folder';
      const isDropTarget = dropTarget === node.id;

      // Custom label with drag-and-drop
      const customLabel = (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            padding: '2px 4px',
            backgroundColor: isDropTarget ? 'rgba(25, 118, 210, 0.12)' : 'transparent',
            borderRadius: 1,
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: isDropTarget ? 'rgba(25, 118, 210, 0.2)' : 'rgba(0, 0, 0, 0.04)'
            }
          }}
          draggable
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={handleDragOver}
          onDragEnter={(e) => isFolder && handleDragEnter(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => isFolder && handleDrop(e, node)}
          onClick={(e) => handleContextMenu(e, node)}
        >
          {isFolder ? (
            <PiFolderThin size={19} style={{ color: '#999', marginRight: '4px' }} />
          ) : (
            <IoDocumentOutline style={{ color: '#999', marginRight: '4px' }} />
          )}
          {node.label}
        </Box>
      );

      return (
        <TreeItem
          key={node.id}
          itemId={node.id}
          label={customLabel}
        >
          {isFolder && node.children && renderTree(node.children)}
        </TreeItem>
      );
    });
  };

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

      <Box
        sx={{ flex: 1, border: '1px solid #ddd', borderRadius: 1, overflow: 'auto', p: 1, mr: '0px' }}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, null)} // Drop to root
      >
        <TreeView
          aria-label="file system navigator"
          defaultCollapseIcon={<ExpandMore />}
          defaultExpandIcon={<ChevronRight />}
          sx={{ fontSize: '90%', fontWeight: 300 }}
        >
          {renderTree(filterSystemFiles(tree))}
        </TreeView>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Upload">
            <IconButton
              onClick={() => {
                fileInputRef.current.targetNode = null;
                fileInputRef.current.click();
              }}
            >
              <PiUploadLight />
            </IconButton>
          </Tooltip>
          <Tooltip title="New Folder">
            <IconButton
              onClick={handleNewFolderClick}
            >
              <MdOutlineCreateNewFolder />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton
              onClick={loadFilesystem}
            >
              <Refresh />
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

      {/* Context Menu */}
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
        <MenuItem onClick={handleRenameClick}>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Rename
        </MenuItem>
        {contextMenu?.node?.type === 'folder' && (
          <MenuItem onClick={() => handleUploadClick(contextMenu.node)}>
            <Upload fontSize="small" sx={{ mr: 1 }} />
            Upload to folder
          </MenuItem>
        )}
        <MenuItem onClick={handleDeleteClick}>
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialog.open}
        onClose={handleRenameCancel}
        maxWidth="sm"
        fullWidth
      >
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
              if (e.key === 'Enter') {
                handleRenameSubmit();
              } else if (e.key === 'Escape') {
                handleRenameCancel();
              }
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

      {/* New Folder Dialog */}
      <Dialog
        open={newFolderDialog.open}
        onClose={handleNewFolderCancel}
        maxWidth="sm"
        fullWidth
      >
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
              if (e.key === 'Enter') {
                handleNewFolderSubmit();
              } else if (e.key === 'Escape') {
                handleNewFolderCancel();
              }
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog.node?.label}"?
            {deleteDialog.node?.type === 'folder' && (
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
    </Box>
  );
}
