import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Dialog,
  DialogContent,
  TextField,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from '@mui/material';
import { Add, Edit, Delete, ArrowBack, FileDownload, Image, MoreHoriz, Close, ChevronLeft, ChevronRight, Settings, MoreVert, RemoveCircleOutline } from '@mui/icons-material';
import * as FaIcons from 'react-icons/fa';
import * as MdIcons from 'react-icons/md';
import * as IoIcons from 'react-icons/io5';
import * as BiIcons from 'react-icons/bi';
import * as AiIcons from 'react-icons/ai';
import * as XLSX from 'xlsx';
import ScrapbookNodeEdit from './ScrapbookNodeEdit';
import ColumnSettingsDialog from './ColumnSettingsDialog';

// Icon resolver - tries to find icon from various react-icons libraries
const getIcon = (iconName) => {
  if (!iconName) return null;
  const libraries = [FaIcons, MdIcons, IoIcons, BiIcons, AiIcons];
  for (const lib of libraries) {
    if (lib[iconName]) {
      return lib[iconName];
    }
  }
  return null;
};

// Default column configuration
const DEFAULT_COLUMN_CONFIG = [
  { id: 'icon', visible: true },
  { id: 'label', visible: true },
  { id: 'group', visible: true },
  { id: 'images', visible: true },
  { id: 'priority', visible: true },
  { id: 'attention', visible: true },
  { id: 'description', visible: true },
  { id: 'created', visible: true },
  { id: 'actions', visible: true },
];

export default function ScrapbookTopics({
  projectName,
  parentNode,
  onNodeUpdated,
  onBack,
  customProperties = [],
  columnConfig = [],
  onSettingsChange,
}) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('label');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editNode, setEditNode] = useState(null);
  const [dragOverNodeId, setDragOverNodeId] = useState(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // Selection state for group management
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [groupName, setGroupName] = useState('Alternatives A');

  // Context menu state
  const [contextMenuAnchor, setContextMenuAnchor] = useState(null);
  const [contextMenuNode, setContextMenuNode] = useState(null);

  // Inline editing state
  const [editingCell, setEditingCell] = useState(null); // { nodeId, propertyId }
  const [editingValue, setEditingValue] = useState('');
  const savingRef = useRef(false); // Prevent double-save on Enter+Blur

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Get effective column config (merge defaults with saved config)
  const effectiveColumnConfig = columnConfig.length > 0
    ? columnConfig
    : [...DEFAULT_COLUMN_CONFIG, ...customProperties.map(p => ({ id: p.id, visible: true }))];

  // Filter to visible columns only
  const visibleColumns = effectiveColumnConfig.filter(c => c.visible);

  // Fetch children of the selected node with group info
  const fetchChildren = useCallback(async () => {
    if (!parentNode?.id) return;

    try {
      setLoading(true);
      // Get all nodes with groups to have group info populated
      const allNodesResponse = await fetch(`/api/workspace/${projectName}/scrapbook/nodes-with-groups`);
      if (allNodesResponse.ok) {
        const allNodes = await allNodesResponse.json();
        // Filter to children of the parent node
        const childNodes = allNodes.filter(n => n.parentId === parentNode.id);
        console.log('Fetched children with groups:', childNodes);
        setChildren(childNodes || []);
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

  // Sort children - keep group items together, then sort by title ascending
  const sortedChildren = [...children].sort((a, b) => {
    // First, sort by group (grouped items come together)
    const aGroup = a.groupName || '';
    const bGroup = b.groupName || '';
    if (aGroup !== bGroup) {
      // Items with groups come before items without groups
      if (aGroup && !bGroup) return -1;
      if (!aGroup && bGroup) return 1;
      // Both have groups, sort by group name
      return aGroup.localeCompare(bGroup);
    }

    // Within same group (or no group), sort by the selected field
    let aVal = a[sortField];
    let bVal = b[sortField];

    // Handle custom property sorting
    if (sortField.startsWith('custom-')) {
      aVal = a.customProperties?.[sortField] ?? '';
      bVal = b.customProperties?.[sortField] ?? '';
    }

    if (sortField === 'createdAt' || sortField === 'updatedAt') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }

    // Handle numeric comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // Handle string comparison
    if (sortDirection === 'asc') {
      return String(aVal || '').localeCompare(String(bVal || ''));
    }
    return String(bVal || '').localeCompare(String(aVal || ''));
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

  // Refresh children when dialog closes
  const handleDialogClose = async () => {
    setEditDialogOpen(false);
    setEditNode(null);
    await fetchChildren();
  };

  // Handle row selection toggle
  const handleRowClick = (nodeId) => {
    setSelectedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Handle context menu
  const handleContextMenuOpen = (event, node) => {
    event.stopPropagation();
    setContextMenuAnchor(event.currentTarget);
    setContextMenuNode(node);
  };

  const handleContextMenuClose = () => {
    setContextMenuAnchor(null);
    setContextMenuNode(null);
  };

  // Handle remove from group via context menu
  const handleRemoveFromGroup = async () => {
    if (!contextMenuNode) return;

    try {
      await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${contextMenuNode.id}/group`, {
        method: 'DELETE',
      });
      await fetchChildren();
      onNodeUpdated();
    } catch (error) {
      console.error('Failed to remove node from group:', error);
    }

    handleContextMenuClose();
  };

  // Handle assigning selected nodes to a group
  const handleAssignGroup = async () => {
    if (selectedNodeIds.size < 2) return;

    try {
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeIds: Array.from(selectedNodeIds),
          groupName: groupName,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to assign group:', error);
        return;
      }

      // Clear selection and refresh
      setSelectedNodeIds(new Set());
      await fetchChildren();
      onNodeUpdated();
    } catch (error) {
      console.error('Failed to assign group:', error);
    }
  };

  // Handle inline editing of custom properties
  const handleStartEdit = (nodeId, propertyId, currentValue) => {
    setEditingCell({ nodeId, propertyId });
    setEditingValue(currentValue ?? '');
  };

  const handleSaveEdit = async (node) => {
    // Prevent double-save (Enter triggers both onKeyDown and onBlur)
    if (!editingCell || savingRef.current) return;
    savingRef.current = true;

    const { propertyId } = editingCell;
    const prop = customProperties.find(p => p.id === propertyId);

    // Get the current value from state before clearing
    const valueToSave = editingValue;

    // Clear editing state immediately
    setEditingCell(null);
    setEditingValue('');

    // Convert value based on type
    let value = valueToSave;
    if (prop?.fieldType === 'numeric' || prop?.fieldType === 'currency') {
      value = parseFloat(valueToSave) || 0;
    }

    // Update node with new custom property value
    const updatedCustomProps = {
      ...(node.customProperties || {}),
      [propertyId]: value,
    };

    console.log('Saving custom property:', { nodeId: node.id, propertyId, value, updatedCustomProps });

    try {
      const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customProperties: updatedCustomProps }),
      });

      if (!response.ok) {
        console.error('Failed to save custom property:', await response.text());
        return;
      }

      const savedNode = await response.json();
      console.log('Saved node response:', savedNode);

      await fetchChildren();
    } catch (error) {
      console.error('Failed to update property:', error);
    } finally {
      savingRef.current = false;
    }
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  // Export to Excel
  const handleExport = () => {
    const exportData = sortedChildren.map(node => {
      const row = {
        Title: node.label,
        Description: node.description || '',
        Priority: node.priority,
        'Attention Weight': node.attentionWeight,
        Type: node.type,
        'Created At': new Date(node.createdAt).toLocaleString(),
        'Updated At': new Date(node.updatedAt).toLocaleString(),
        Icon: node.iconName || '',
        Images: (node.images || []).join(', '),
      };

      // Add custom properties
      customProperties.forEach(prop => {
        const value = node.customProperties?.[prop.id];
        row[prop.name] = value ?? '';
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Topics');
    XLSX.writeFile(wb, `${parentNode.label}-topics.xlsx`);
  };

  // Handle drag & drop for images
  const handleDragOver = (e, nodeId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(nodeId);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(null);
  };

  const handleDrop = async (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(null);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    );

    if (files.length === 0) return;

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        await fetch(
          `/api/workspace/${projectName}/scrapbook/nodes/${node.id}/images`,
          { method: 'POST', body: formData }
        );
      } catch (error) {
        console.error('Failed to upload image:', error);
      }
    }

    await fetchChildren();
    onNodeUpdated();
  };

  // Lightbox functions
  const openLightbox = (images, startIndex = 0) => {
    setLightboxImages(images);
    setLightboxIndex(startIndex);
    setLightboxOpen(true);
  };

  const handleLightboxPrev = () => {
    setLightboxIndex(prev => (prev > 0 ? prev - 1 : lightboxImages.length - 1));
  };

  const handleLightboxNext = () => {
    setLightboxIndex(prev => (prev < lightboxImages.length - 1 ? prev + 1 : 0));
  };

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handleLightboxPrev();
      else if (e.key === 'ArrowRight') handleLightboxNext();
      else if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxImages.length]);

  // Handle column settings save
  const handleColumnSettingsSave = (settings) => {
    onSettingsChange?.(settings);
  };

  // Format custom property value for display
  const formatPropertyValue = (prop, value) => {
    if (value === undefined || value === null || value === '') return '-';

    if (prop.fieldType === 'currency') {
      const num = parseFloat(value);
      if (isNaN(num)) return value;
      return `${prop.unit || '$'}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (prop.fieldType === 'numeric') {
      const num = parseFloat(value);
      if (isNaN(num)) return value;
      return prop.unit ? `${num.toLocaleString()} ${prop.unit}` : num.toLocaleString();
    }

    return value;
  };

  // Render a table cell based on column type
  const renderCell = (colId, node, isDragOver) => {
    const IconComponent = getIcon(node.iconName);
    const images = node.images || [];
    const displayImages = images.slice(0, 3);
    const hasMoreImages = images.length > 3;

    switch (colId) {
      case 'icon':
        return IconComponent ? (
          <IconComponent size={20} style={{ color: '#666' }} />
        ) : (
          <Box sx={{ width: 20, height: 20 }} />
        );

      case 'label':
        return (
          <Typography variant="body2" fontWeight={500}>
            {node.label}
          </Typography>
        );

      case 'images':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {displayImages.length > 0 ? (
              <>
                {displayImages.map((img, idx) => (
                  <Box
                    key={idx}
                    component="img"
                    src={`/api/workspace/${projectName}/scrapbook/images/${img}`}
                    alt={`${node.label} ${idx + 1}`}
                    onClick={() => openLightbox(images, idx)}
                    sx={{
                      width: 36, height: 36, objectFit: 'cover', borderRadius: 1, cursor: 'pointer',
                      '&:hover': { opacity: 0.8, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' },
                    }}
                  />
                ))}
                {hasMoreImages && (
                  <Tooltip title={`${images.length - 3} more images`}>
                    <Box
                      onClick={() => openLightbox(images, 3)}
                      sx={{
                        width: 36, height: 36, backgroundColor: '#f5f5f5', borderRadius: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        '&:hover': { backgroundColor: '#e0e0e0' },
                      }}
                    >
                      <MoreHoriz sx={{ color: '#999', fontSize: 16 }} />
                    </Box>
                  </Tooltip>
                )}
              </>
            ) : (
              <Tooltip title="Drag & drop images here">
                <Box
                  sx={{
                    width: 36, height: 36,
                    backgroundColor: isDragOver ? 'rgba(25, 118, 210, 0.2)' : '#f5f5f5',
                    borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: isDragOver ? '2px dashed #1976d2' : '2px dashed transparent',
                  }}
                >
                  <Image sx={{ color: '#ccc', fontSize: 18 }} />
                </Box>
              </Tooltip>
            )}
          </Box>
        );

      case 'priority':
        return (
          <Chip
            label={node.priority}
            size="small"
            color={node.priority >= 8 ? 'error' : node.priority >= 5 ? 'warning' : 'default'}
          />
        );

      case 'attention':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 50, height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
              <Box
                sx={{
                  width: `${node.attentionWeight * 100}%`, height: '100%',
                  backgroundColor: node.attentionWeight >= 0.7 ? '#1976d2' : node.attentionWeight >= 0.4 ? '#90caf9' : '#e0e0e0',
                }}
              />
            </Box>
            <Typography variant="caption">{(node.attentionWeight * 100).toFixed(0)}%</Typography>
          </Box>
        );

      case 'description':
        return (
          <Typography sx={{ fontSize: '12px', color: 'text.secondary' }} noWrap>
            {node.description || '-'}
          </Typography>
        );

      case 'created':
        return (
          <Typography variant="caption" color="text.secondary">
            {new Date(node.createdAt).toLocaleDateString()}
          </Typography>
        );

      case 'group':
        return node.groupName ? (
          <Chip
            label={node.groupName}
            size="small"
            sx={{
              backgroundColor: '#fff3e0',
              color: '#e65100',
              borderColor: '#ffb74d',
              border: '1px solid',
            }}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">-</Typography>
        );

      case 'actions':
        return (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Tooltip title="Actions">
              <IconButton size="small" onClick={(e) => handleContextMenuOpen(e, node)}>
                <MoreVert fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );

      default:
        // Custom property column
        if (colId.startsWith('custom-')) {
          const prop = customProperties.find(p => p.id === colId);
          if (!prop) return '-';

          const value = node.customProperties?.[colId];
          const isEditing = editingCell?.nodeId === node.id && editingCell?.propertyId === colId;

          if (isEditing) {
            return (
              <TextField
                size="small"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={() => handleSaveEdit(node)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit(node);
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                autoFocus
                type={prop.fieldType === 'text' ? 'text' : 'number'}
                sx={{ width: '100%' }}
                InputProps={{
                  sx: { fontSize: '12px' },
                  ...(prop.fieldType === 'currency' && prop.unit && {
                    startAdornment: <Typography sx={{ mr: 0.5, fontSize: '12px' }}>{prop.unit}</Typography>,
                  }),
                  ...(prop.fieldType === 'numeric' && prop.unit && {
                    endAdornment: <Typography sx={{ ml: 0.5, fontSize: '12px' }}>{prop.unit}</Typography>,
                  }),
                }}
              />
            );
          }

          return (
            <Typography
              sx={{
                fontSize: '12px',
                cursor: 'pointer',
                '&:hover': { backgroundColor: '#f5f5f5', borderRadius: 0.5 },
                px: 0.5,
                py: 0.25,
              }}
              onClick={() => handleStartEdit(node.id, colId, value)}
            >
              {formatPropertyValue(prop, value)}
            </Typography>
          );
        }
        return '-';
    }
  };

  // Get column header label
  const getColumnLabel = (colId) => {
    const labels = {
      icon: 'Icon',
      label: 'Title',
      group: 'Group',
      images: 'Images',
      priority: 'Priority',
      attention: 'Attention',
      description: 'Description',
      created: 'Created',
      actions: 'Actions',
    };
    if (labels[colId]) return labels[colId];

    // Custom property
    const prop = customProperties.find(p => p.id === colId);
    return prop?.name || colId;
  };

  // Get column width
  const getColumnWidth = (colId) => {
    const widths = {
      icon: 50,
      label: undefined, // flex
      group: 130,
      images: 160,
      priority: 100,
      attention: 120,
      description: undefined, // flex
      created: 120,
      actions: 60,
    };
    return widths[colId] || 120;
  };

  // Check if column is sortable
  const isSortable = (colId) => {
    return ['label', 'priority', 'attention', 'createdAt', 'description'].includes(
      colId === 'attention' ? 'attentionWeight' : colId === 'created' ? 'createdAt' : colId
    ) || colId.startsWith('custom-');
  };

  // Get sort field for column
  const getSortField = (colId) => {
    if (colId === 'attention') return 'attentionWeight';
    if (colId === 'created') return 'createdAt';
    return colId;
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
        <Tooltip title="Column Settings">
          <IconButton onClick={() => setColumnSettingsOpen(true)} sx={{ mr: 1 }}>
            <Settings />
          </IconButton>
        </Tooltip>
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
        <Typography sx={{ mb: 2, fontSize: '12px', color: '#999' }}>
          {parentNode.description}
        </Typography>
      )}

      {/* Group assignment bar - shows when 2+ items are selected */}
      {selectedNodeIds.size >= 2 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 1.5, backgroundColor: '#fff3e0', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: '#e65100', fontWeight: 500 }}>
            {selectedNodeIds.size} items selected
          </Typography>
          <TextField
            size="small"
            label="Group of alternatives"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            sx={{ width: 200 }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleAssignGroup}
            sx={{ backgroundColor: '#ff9800', '&:hover': { backgroundColor: '#f57c00' } }}
          >
            Set
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setSelectedNodeIds(new Set())}
          >
            Clear
          </Button>
        </Box>
      )}

      {/* Table */}
      <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {/* Checkbox column for selection */}
              <TableCell width={40} padding="checkbox" />
              {visibleColumns.map((col) => (
                <TableCell
                  key={col.id}
                  width={getColumnWidth(col.id)}
                  align={col.id === 'actions' ? 'right' : 'left'}
                >
                  {isSortable(col.id) ? (
                    <TableSortLabel
                      active={sortField === getSortField(col.id)}
                      direction={sortField === getSortField(col.id) ? sortDirection : 'asc'}
                      onClick={() => handleSort(getSortField(col.id))}
                    >
                      {getColumnLabel(col.id)}
                    </TableSortLabel>
                  ) : (
                    getColumnLabel(col.id)
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedChildren.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No topics yet. Click "Add" to create one.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedChildren.map((node) => {
                const isDragOver = dragOverNodeId === node.id;
                const isSelected = selectedNodeIds.has(node.id);
                return (
                  <TableRow
                    key={node.id}
                    hover
                    onClick={() => handleRowClick(node.id)}
                    onDragOver={(e) => handleDragOver(e, node.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, node)}
                    selected={isSelected}
                    sx={{
                      cursor: 'pointer',
                      backgroundColor: isDragOver ? 'rgba(25, 118, 210, 0.1)' : isSelected ? 'rgba(255, 152, 0, 0.1)' : undefined,
                      transition: 'background-color 0.2s',
                      '&.Mui-selected': {
                        backgroundColor: 'rgba(255, 152, 0, 0.15)',
                        '&:hover': { backgroundColor: 'rgba(255, 152, 0, 0.25)' },
                      },
                    }}
                  >
                    {/* Checkbox for selection */}
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleRowClick(node.id)}
                        sx={{
                          color: '#ff9800',
                          '&.Mui-checked': { color: '#ff9800' },
                        }}
                      />
                    </TableCell>
                    {visibleColumns.map((col) => (
                      <TableCell key={col.id} align={col.id === 'actions' ? 'right' : 'left'}>
                        {renderCell(col.id, node, isDragOver)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
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
        customProperties={customProperties}
      />

      {/* Column Settings Dialog */}
      <ColumnSettingsDialog
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
        customProperties={customProperties}
        columnConfig={effectiveColumnConfig}
        onSave={handleColumnSettingsSave}
      />

      {/* Lightbox Dialog */}
      <Dialog
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { backgroundColor: 'rgba(0, 0, 0, 0.9)', boxShadow: 'none' } }}
      >
        <DialogContent
          sx={{ p: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '70vh' }}
        >
          <IconButton
            onClick={() => setLightboxOpen(false)}
            sx={{ position: 'absolute', top: 8, right: 8, color: 'white', backgroundColor: 'rgba(0, 0, 0, 0.5)', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.7)' } }}
          >
            <Close />
          </IconButton>
          {lightboxImages.length > 1 && (
            <IconButton
              onClick={handleLightboxPrev}
              sx={{ position: 'absolute', left: 16, color: 'white', backgroundColor: 'rgba(0, 0, 0, 0.5)', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.7)' } }}
            >
              <ChevronLeft fontSize="large" />
            </IconButton>
          )}
          {lightboxImages.length > 0 && (
            <Box
              component="img"
              src={`/api/workspace/${projectName}/scrapbook/images/${lightboxImages[lightboxIndex]}`}
              alt={`Image ${lightboxIndex + 1}`}
              sx={{ maxWidth: '90%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          )}
          {lightboxImages.length > 1 && (
            <IconButton
              onClick={handleLightboxNext}
              sx={{ position: 'absolute', right: 16, color: 'white', backgroundColor: 'rgba(0, 0, 0, 0.5)', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.7)' } }}
            >
              <ChevronRight fontSize="large" />
            </IconButton>
          )}
          {lightboxImages.length > 1 && (
            <Typography
              sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'white', backgroundColor: 'rgba(0, 0, 0, 0.5)', px: 2, py: 0.5, borderRadius: 1 }}
            >
              {lightboxIndex + 1} / {lightboxImages.length}
            </Typography>
          )}
        </DialogContent>
      </Dialog>

      {/* Context Menu for row actions */}
      <Menu
        anchorEl={contextMenuAnchor}
        open={Boolean(contextMenuAnchor)}
        onClose={handleContextMenuClose}
      >
        <MenuItem onClick={() => { handleEdit(contextMenuNode); handleContextMenuClose(); }}>
          <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { handleDelete(contextMenuNode); handleContextMenuClose(); }}>
          <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={handleRemoveFromGroup}
          disabled={!contextMenuNode?.groupName}
        >
          <ListItemIcon><RemoveCircleOutline fontSize="small" /></ListItemIcon>
          <ListItemText sx={{ color: !contextMenuNode?.groupName ? 'text.disabled' : undefined }}>
            Remove from group
          </ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
