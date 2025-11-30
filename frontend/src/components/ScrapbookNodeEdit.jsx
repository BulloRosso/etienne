import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Slider,
  IconButton,
  Paper,
  Grid,
  InputAdornment,
} from '@mui/material';
import { Close, CloudUpload, Delete, Search } from '@mui/icons-material';
import * as FaIcons from 'react-icons/fa';
import * as MdIcons from 'react-icons/md';
import * as IoIcons from 'react-icons/io5';
import * as BiIcons from 'react-icons/bi';
import * as AiIcons from 'react-icons/ai';
import * as GiIcons from 'react-icons/gi';
import * as FiIcons from 'react-icons/fi';
import * as TbIcons from 'react-icons/tb';

// Build searchable icon list
const allIcons = {
  ...Object.fromEntries(Object.entries(FaIcons).filter(([k]) => k.startsWith('Fa'))),
  ...Object.fromEntries(Object.entries(MdIcons).filter(([k]) => k.startsWith('Md'))),
  ...Object.fromEntries(Object.entries(IoIcons).filter(([k]) => k.startsWith('Io'))),
  ...Object.fromEntries(Object.entries(BiIcons).filter(([k]) => k.startsWith('Bi'))),
  ...Object.fromEntries(Object.entries(AiIcons).filter(([k]) => k.startsWith('Ai'))),
  ...Object.fromEntries(Object.entries(GiIcons).filter(([k]) => k.startsWith('Gi'))),
  ...Object.fromEntries(Object.entries(FiIcons).filter(([k]) => k.startsWith('Fi'))),
  ...Object.fromEntries(Object.entries(TbIcons).filter(([k]) => k.startsWith('Tb'))),
};

const iconNames = Object.keys(allIcons);

export default function ScrapbookNodeEdit({ open, onClose, projectName, node, parentNode, onSaved }) {
  const isEdit = Boolean(node?.id);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(5);
  const [attentionWeight, setAttentionWeight] = useState(0.5);
  const [iconName, setIconName] = useState('');
  const [iconSearch, setIconSearch] = useState('');
  const [iconSelectorOpen, setIconSelectorOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize form when node changes
  useEffect(() => {
    if (node) {
      setLabel(node.label || '');
      setDescription(node.description || '');
      setPriority(node.priority || 5);
      setAttentionWeight(node.attentionWeight || 0.5);
      setIconName(node.iconName || '');
      setImages(node.images || []);
    } else {
      setLabel('');
      setDescription('');
      setPriority(5);
      setAttentionWeight(0.5);
      setIconName('');
      setImages([]);
    }
  }, [node, open]);

  // Search icons
  const filteredIcons = useMemo(() => {
    if (!iconSearch) {
      // Show popular icons when no search
      return ['FaHome', 'FaBook', 'FaUser', 'FaCog', 'FaHeart', 'FaStar', 'FaFolder', 'FaFile',
        'FaImage', 'FaCamera', 'FaMusic', 'FaVideo', 'FaCar', 'FaPlane', 'FaTree', 'FaLeaf',
        'FaBed', 'FaCouch', 'FaTv', 'FaUtensils', 'FaCoffee', 'FaGift', 'FaShoppingCart', 'FaCreditCard',
        'MdHome', 'MdWork', 'MdSchool', 'MdFavorite', 'BiHome', 'BiBook', 'IoHome', 'IoBook'];
    }
    const search = iconSearch.toLowerCase();
    return iconNames.filter(name => name.toLowerCase().includes(search)).slice(0, 30);
  }, [iconSearch]);

  // Handle save
  const handleSave = async () => {
    if (!label.trim()) return;

    setSaving(true);
    try {
      const payload = {
        label: label.trim(),
        description: description.trim(),
        priority,
        attentionWeight,
        iconName: iconName || undefined,
        images,
      };

      if (isEdit) {
        // Update existing node
        await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${node.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new node
        await fetch(`/api/workspace/${projectName}/scrapbook/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            parentId: parentNode?.id,
          }),
        });
      }

      onSaved();
    } catch (error) {
      console.error('Failed to save node:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle image upload
  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !node?.id) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${node.id}/images`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setImages([...images, data.filename]);
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
    } finally {
      setUploading(false);
    }
  };

  // Handle image delete
  const handleDeleteImage = async (filename) => {
    if (!node?.id) return;

    try {
      await fetch(`/api/workspace/${projectName}/scrapbook/nodes/${node.id}/images/${filename}`, {
        method: 'DELETE',
      });
      setImages(images.filter(img => img !== filename));
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  };

  const IconComponent = iconName && allIcons[iconName];

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isEdit ? 'Edit Node' : 'Add New Node'}
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {/* Label */}
            <TextField
              label="Title"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              fullWidth
              required
              autoFocus
            />

            {/* Description */}
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />

            {/* Priority */}
            <Box>
              <Typography gutterBottom>Priority: {priority}</Typography>
              <Slider
                value={priority}
                onChange={(e, v) => setPriority(v)}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Box>

            {/* Attention Weight */}
            <Box>
              <Typography gutterBottom>Attention Weight: {(attentionWeight * 100).toFixed(0)}%</Typography>
              <Slider
                value={attentionWeight}
                onChange={(e, v) => setAttentionWeight(v)}
                min={0.01}
                max={1}
                step={0.01}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
              />
            </Box>

            {/* Icon Selector */}
            <Box>
              <Typography gutterBottom>Icon</Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
                onClick={() => setIconSelectorOpen(true)}
              >
                {IconComponent ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconComponent size={24} />
                    <Typography variant="body2">{iconName}</Typography>
                  </Box>
                ) : (
                  <Typography color="text.secondary">Click to select an icon</Typography>
                )}
              </Paper>
            </Box>

            {/* Image Upload (only for edit mode) */}
            {isEdit && (
              <Box>
                <Typography gutterBottom>Images</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {images.map((filename) => (
                    <Box
                      key={filename}
                      sx={{
                        position: 'relative',
                        width: 80,
                        height: 80,
                      }}
                    >
                      <Box
                        component="img"
                        src={`/api/workspace/${projectName}/scrapbook/images/${filename}`}
                        alt={filename}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: 1,
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteImage(filename)}
                        sx={{
                          position: 'absolute',
                          top: -8,
                          right: -8,
                          backgroundColor: 'error.main',
                          color: 'white',
                          '&:hover': { backgroundColor: 'error.dark' },
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<CloudUpload />}
                  disabled={uploading}
                  size="small"
                >
                  {uploading ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </Button>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!label.trim() || saving}
          >
            {saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Icon Selector Dialog */}
      <Dialog
        open={iconSelectorOpen}
        onClose={() => setIconSelectorOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Select Icon</DialogTitle>
        <DialogContent>
          <TextField
            placeholder="Search icons..."
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <Grid container spacing={1}>
            {filteredIcons.map((name) => {
              const Icon = allIcons[name];
              if (!Icon) return null;
              return (
                <Grid item key={name}>
                  <Paper
                    variant={iconName === name ? 'elevation' : 'outlined'}
                    elevation={iconName === name ? 3 : 0}
                    sx={{
                      width: 48,
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      backgroundColor: iconName === name ? 'primary.light' : 'transparent',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                    onClick={() => {
                      setIconName(name);
                      setIconSelectorOpen(false);
                    }}
                  >
                    <Icon size={24} />
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
          {filteredIcons.length === 0 && (
            <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
              No icons found. Try a different search term.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {iconName && (
            <Button
              onClick={() => {
                setIconName('');
                setIconSelectorOpen(false);
              }}
              color="error"
            >
              Clear Icon
            </Button>
          )}
          <Button onClick={() => setIconSelectorOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
