import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  Button,
  Paper,
  Tooltip,
  Chip,
} from '@mui/material';
import { Add, Edit, Delete, ArrowBack, FileDownload, Image } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import ScrapbookNodeEdit from './ScrapbookNodeEdit';

export default function ScrapbookTopics({ projectName, parentNode, onNodeUpdated, onBack }) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('priority');
  const [sortDirection, setSortDirection] = useState('desc');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editNode, setEditNode] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState(null);

  // Fetch children of the selected node
  const fetchChildren = useCallback(async () => {
    if (!parentNode?.id) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${parentNode.id}/children`);
      if (response.ok) {
        const data = await response.json();
        setChildren(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch children:', error);
    } finally {
      setLoading(false);
    }
  }, [projectName, parentNode?.id]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // Sort children
  const sortedChildren = [...children].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'createdAt' || sortField === 'updatedAt') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }

    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Handle add new node
  const handleAddNew = () => {
    setEditNode(null);
    setEditDialogOpen(true);
  };

  // Handle edit node
  const handleEdit = (node) => {
    setEditNode(node);
    setEditDialogOpen(true);
  };

  // Handle delete node
  const handleDelete = async (node) => {
    try {
      await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${node.id}`, {
        method: 'DELETE',
      });
      await fetchChildren();
      onNodeUpdated();
    } catch (error) {
      console.error('Failed to delete node:', error);
    }
  };

  // Handle save (create or update)
  const handleNodeSaved = async () => {
    setEditDialogOpen(false);
    setEditNode(null);
    await fetchChildren();
    onNodeUpdated();
  };

  // Refresh children when dialog closes (to pick up image uploads)
  const handleDialogClose = async () => {
    setEditDialogOpen(false);
    setEditNode(null);
    await fetchChildren(); // Refresh to show any uploaded images
  };

  // Export to Excel
  const handleExport = () => {
    const exportData = sortedChildren.map(node => ({
      Title: node.label,
      Description: node.description || '',
      Priority: node.priority,
      'Attention Weight': node.attentionWeight,
      Type: node.type,
      'Created At': new Date(node.createdAt).toLocaleString(),
      'Updated At': new Date(node.updatedAt).toLocaleString(),
      Icon: node.iconName || '',
      Images: (node.images || []).join(', '),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Topics');
    XLSX.writeFile(wb, `${parentNode.label}-topics.xlsx`);
  };

  // Get first image thumbnail URL
  const getImageUrl = (node) => {
    if (!node.images || node.images.length === 0) return null;
    return `/api/workspace/${projectName}/scrapbook/images/${node.images[0]}`;
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton onClick={onBack} sx={{ mr: 1 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {parentNode?.label} - Topics
        </Typography>
        <Button
          startIcon={<Add />}
          variant="contained"
          size="small"
          onClick={handleAddNew}
          sx={{ mr: 1 }}
        >
          Add
        </Button>
        <Button
          startIcon={<FileDownload />}
          variant="outlined"
          size="small"
          onClick={handleExport}
          disabled={children.length === 0}
        >
          Export
        </Button>
      </Box>

      {/* Description of parent */}
      {parentNode?.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {parentNode.description}
        </Typography>
      )}

      {/* Table */}
      <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'label'}
                  direction={sortField === 'label' ? sortDirection : 'asc'}
                  onClick={() => handleSort('label')}
                >
                  Title
                </TableSortLabel>
              </TableCell>
              <TableCell width={80}>Image</TableCell>
              <TableCell width={100}>
                <TableSortLabel
                  active={sortField === 'priority'}
                  direction={sortField === 'priority' ? sortDirection : 'asc'}
                  onClick={() => handleSort('priority')}
                >
                  Priority
                </TableSortLabel>
              </TableCell>
              <TableCell width={120}>
                <TableSortLabel
                  active={sortField === 'attentionWeight'}
                  direction={sortField === 'attentionWeight' ? sortDirection : 'asc'}
                  onClick={() => handleSort('attentionWeight')}
                >
                  Attention
                </TableSortLabel>
              </TableCell>
              <TableCell>Description</TableCell>
              <TableCell width={160}>
                <TableSortLabel
                  active={sortField === 'createdAt'}
                  direction={sortField === 'createdAt' ? sortDirection : 'asc'}
                  onClick={() => handleSort('createdAt')}
                >
                  Created
                </TableSortLabel>
              </TableCell>
              <TableCell width={100} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedChildren.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No topics yet. Click "Add" to create one.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedChildren.map((node) => (
                <TableRow key={node.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {node.label}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {getImageUrl(node) ? (
                      <Box
                        component="img"
                        src={getImageUrl(node)}
                        alt={node.label}
                        sx={{
                          width: 48,
                          height: 48,
                          objectFit: 'cover',
                          borderRadius: 1,
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          backgroundColor: '#f5f5f5',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Image sx={{ color: '#ccc' }} />
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={node.priority}
                      size="small"
                      color={node.priority >= 8 ? 'error' : node.priority >= 5 ? 'warning' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 50,
                          height: 6,
                          backgroundColor: '#e0e0e0',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            width: `${node.attentionWeight * 100}%`,
                            height: '100%',
                            backgroundColor: node.attentionWeight >= 0.7 ? '#1976d2' : node.attentionWeight >= 0.4 ? '#90caf9' : '#e0e0e0',
                          }}
                        />
                      </Box>
                      <Typography variant="caption">
                        {(node.attentionWeight * 100).toFixed(0)}%
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                      {node.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(node.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => handleEdit(node)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(node)} color="error">
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit/Add Dialog */}
      <ScrapbookNodeEdit
        open={editDialogOpen}
        onClose={handleDialogClose}
        projectName={projectName}
        node={editNode}
        parentNode={parentNode}
        onSaved={handleNodeSaved}
      />
    </Box>
  );
}
