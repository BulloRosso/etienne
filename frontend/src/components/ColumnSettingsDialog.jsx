import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Divider,
  Tooltip,
  Paper,
} from '@mui/material';
import {
  Add,
  Delete,
  Visibility,
  VisibilityOff,
  ArrowUpward,
  ArrowDownward,
} from '@mui/icons-material';

// Default columns that are always available
const DEFAULT_COLUMNS = [
  { id: 'icon', label: 'Icon', removable: false },
  { id: 'label', label: 'Title', removable: false },
  { id: 'group', label: 'Group', removable: false },
  { id: 'images', label: 'Images', removable: false },
  { id: 'priority', label: 'Priority', removable: false },
  { id: 'attention', label: 'Attention', removable: false },
  { id: 'description', label: 'Description', removable: false },
  { id: 'created', label: 'Created', removable: false },
  { id: 'actions', label: 'Actions', removable: false },
];

export default function ColumnSettingsDialog({
  open,
  onClose,
  customProperties = [],
  columnConfig = [],
  onSave,
}) {
  // Local state for editing
  const [properties, setProperties] = useState([]);
  const [columns, setColumns] = useState([]);
  const [newPropertyName, setNewPropertyName] = useState('');
  const [newPropertyType, setNewPropertyType] = useState('text');
  const [newPropertyUnit, setNewPropertyUnit] = useState('');

  // Initialize local state when dialog opens
  useEffect(() => {
    if (open) {
      setProperties([...customProperties]);

      // Build column config - merge existing with defaults
      const existingIds = new Set(columnConfig.map(c => c.id));
      const defaultConfig = DEFAULT_COLUMNS.map(col => {
        const existing = columnConfig.find(c => c.id === col.id);
        return existing || { id: col.id, visible: true };
      });

      // Add custom property columns
      const customConfig = customProperties.map(prop => {
        const existing = columnConfig.find(c => c.id === prop.id);
        return existing || { id: prop.id, visible: true };
      });

      // Preserve order from columnConfig if it exists
      if (columnConfig.length > 0) {
        // Start with existing column order
        const orderedConfig = [...columnConfig];
        // Add any new defaults or custom props not in config
        [...DEFAULT_COLUMNS, ...customProperties].forEach(col => {
          const colId = col.id;
          if (!orderedConfig.find(c => c.id === colId)) {
            orderedConfig.push({ id: colId, visible: true });
          }
        });
        setColumns(orderedConfig);
      } else {
        setColumns([...defaultConfig, ...customConfig]);
      }
    }
  }, [open, customProperties, columnConfig]);

  // Get label for a column id
  const getColumnLabel = (id) => {
    const defaultCol = DEFAULT_COLUMNS.find(c => c.id === id);
    if (defaultCol) return defaultCol.label;
    const customProp = properties.find(p => p.id === id);
    if (customProp) return customProp.name;
    return id;
  };

  // Check if column is removable (only custom properties)
  const isRemovable = (id) => {
    return !DEFAULT_COLUMNS.find(c => c.id === id);
  };

  // Add new custom property
  const handleAddProperty = () => {
    if (!newPropertyName.trim()) return;

    const newProp = {
      id: `custom-${Date.now()}`,
      name: newPropertyName.trim(),
      fieldType: newPropertyType,
      unit: newPropertyUnit.trim() || undefined,
    };

    setProperties([...properties, newProp]);
    setColumns([...columns, { id: newProp.id, visible: true }]);

    // Reset form
    setNewPropertyName('');
    setNewPropertyType('text');
    setNewPropertyUnit('');
  };

  // Delete custom property
  const handleDeleteProperty = (propId) => {
    setProperties(properties.filter(p => p.id !== propId));
    setColumns(columns.filter(c => c.id !== propId));
  };

  // Toggle column visibility
  const handleToggleVisibility = (colId) => {
    setColumns(columns.map(c =>
      c.id === colId ? { ...c, visible: !c.visible } : c
    ));
  };

  // Move column up
  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newColumns = [...columns];
    [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
    setColumns(newColumns);
  };

  // Move column down
  const handleMoveDown = (index) => {
    if (index === columns.length - 1) return;
    const newColumns = [...columns];
    [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
    setColumns(newColumns);
  };

  // Save changes
  const handleSave = () => {
    onSave({
      customProperties: properties,
      columnConfig: columns,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Column Settings</DialogTitle>
      <DialogContent>
        {/* Add New Custom Property Section */}
        <Paper sx={{ p: 2, mb: 3, backgroundColor: '#f5f5f5' }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            Add Custom Property
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              label="Property Name"
              size="small"
              value={newPropertyName}
              onChange={(e) => setNewPropertyName(e.target.value)}
              sx={{ flex: 1, minWidth: 120 }}
            />
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={newPropertyType}
                label="Type"
                onChange={(e) => setNewPropertyType(e.target.value)}
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="numeric">Numeric</MenuItem>
                <MenuItem value="currency">Currency</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Unit/Symbol"
              size="small"
              value={newPropertyUnit}
              onChange={(e) => setNewPropertyUnit(e.target.value)}
              placeholder="e.g., $, kg, cm"
              sx={{ width: 100 }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              onClick={handleAddProperty}
              disabled={!newPropertyName.trim()}
            >
              Add
            </Button>
          </Box>
        </Paper>

        {/* Custom Properties List */}
        {properties.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Custom Properties
            </Typography>
            <List dense sx={{ mb: 2 }}>
              {properties.map((prop) => (
                <ListItem key={prop.id} sx={{ backgroundColor: '#fff', mb: 0.5, borderRadius: 1 }}>
                  <ListItemText
                    primary={prop.name}
                    secondary={`${prop.fieldType}${prop.unit ? ` (${prop.unit})` : ''}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleDeleteProperty(prop.id)}
                      color="error"
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
            <Divider sx={{ my: 2 }} />
          </>
        )}

        {/* Column Order & Visibility */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Column Order & Visibility
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Use arrows to reorder columns, toggle visibility to show/hide.
        </Typography>
        <List dense>
          {columns.map((col, index) => (
            <ListItem
              key={col.id}
              sx={{
                backgroundColor: col.visible ? '#fff' : '#f5f5f5',
                mb: 0.5,
                borderRadius: 1,
                border: '1px solid #e0e0e0',
                opacity: col.visible ? 1 : 0.6,
              }}
            >
              <ListItemText
                primary={getColumnLabel(col.id)}
                sx={{ flex: 1 }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title="Move Up">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                    >
                      <ArrowUpward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move Down">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === columns.length - 1}
                    >
                      <ArrowDownward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={col.visible ? 'Hide Column' : 'Show Column'}>
                  <IconButton
                    size="small"
                    onClick={() => handleToggleVisibility(col.id)}
                  >
                    {col.visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </Box>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
