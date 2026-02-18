import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TextField
} from '@mui/material';
import { Save, Add, Delete, Edit as EditIcon, Check, Close } from '@mui/icons-material';
import { apiAxios } from '../services/api';
import BackgroundInfo from './BackgroundInfo';

export default function PermissionList({ projectName, showBackgroundInfo }) {
  const [allowedTools, setAllowedTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [newTool, setNewTool] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    loadPermissions();
  }, [projectName]);

  const loadPermissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAxios.post('/api/claude/permissions', {
        projectName
      });
      setAllowedTools(response.data.allowedTools || []);
    } catch (err) {
      setError('Failed to load permissions');
      console.error('Load permissions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await apiAxios.post('/api/claude/permissions/save', {
        projectName,
        allowedTools
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save permissions');
      console.error('Save permissions error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (newTool.trim()) {
      setAllowedTools([...allowedTools, newTool.trim()]);
      setNewTool('');
    }
  };

  const handleDelete = (index) => {
    setAllowedTools(allowedTools.filter((_, i) => i !== index));
  };

  const handleStartEdit = (index) => {
    setEditingIndex(index);
    setEditValue(allowedTools[index]);
  };

  const handleSaveEdit = () => {
    if (editValue.trim()) {
      const updated = [...allowedTools];
      updated[editingIndex] = editValue.trim();
      setAllowedTools(updated);
    }
    setEditingIndex(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <BackgroundInfo infoId="permissions" showBackgroundInfo={showBackgroundInfo} />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          Permissions saved successfully
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ flex: 1, mb: 2 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell><strong>Allowed Tool</strong></TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {allowedTools.map((tool, index) => (
              <TableRow
                key={index}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                sx={{ backgroundColor: index % 2 === 0 ? 'white' : '#EBF5FF', height: '60px' }}
              >
                <TableCell
                  onClick={() => editingIndex !== index && handleStartEdit(index)}
                  sx={{ cursor: editingIndex !== index ? 'pointer' : 'default' }}
                >
                  {editingIndex === index ? (
                    <TextField
                      fullWidth
                      size="small"
                      sx={{ backgroundColor: 'white' }}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                  ) : (
                    <code>{tool}</code>
                  )}
                </TableCell>
                <TableCell align="right">
                  {editingIndex === index ? (
                    <>
                      <IconButton size="small" color="primary" onClick={handleSaveEdit} sx={{ p: 0.5 }}>
                        <Check fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={handleCancelEdit} sx={{ p: 0.5 }}>
                        <Close fontSize="small" />
                      </IconButton>
                    </>
                  ) : (hoveredIndex === index || editingIndex === index) && (
                    <>
                      <IconButton size="small" onClick={() => handleStartEdit(index)} sx={{ p: 0.5 }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(index)} sx={{ p: 0.5 }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Add new tool..."
                  value={newTool}
                  onChange={(e) => setNewTool(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleAdd();
                  }}
                />
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" color="primary" onClick={handleAdd} disabled={!newTool.trim()} sx={{ p: 0.5 }}>
                  <Add fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
