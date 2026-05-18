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
  FormControlLabel,
  Checkbox,
  Autocomplete,
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
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

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

/**
 * Scrapbook images are served from a bearer-token authenticated endpoint; a
 * plain <img src> cannot send the Authorization header (→ 401 → broken image).
 * Fetch through the authenticated apiFetch and render via an object URL.
 */
function AuthedImage({ url, alt, sx }) {
  const [objectUrl, setObjectUrl] = useState(null);
  useEffect(() => {
    if (!url) {
      setObjectUrl(null);
      return;
    }
    let cancelled = false;
    let created = null;
    (async () => {
      try {
        const resp = await apiFetch(url);
        if (!resp.ok) throw new Error(`image fetch failed: HTTP ${resp.status}`);
        const blob = await resp.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      } catch {
        if (!cancelled) setObjectUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (!objectUrl) {
    return <Box sx={{ ...sx, backgroundColor: 'action.hover' }} />;
  }
  return <Box component="img" src={objectUrl} alt={alt} sx={sx} />;
}

export default function ScrapbookNodeEdit({ open, onClose, projectName, graphName = 'default', node, parentNode, allNodes = [], onSaved, onNodeUpdated }) {
  const { t } = useTranslation(["scrapbookNodeEdit","common"]);
  const isEdit = Boolean(node?.id);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(5);
  const [attentionWeight, setAttentionWeight] = useState(0.5);
  const [iconName, setIconName] = useState('');
  const [wikiSlug, setWikiSlug] = useState('');
  const [iconSearch, setIconSearch] = useState('');
  const [iconSelectorOpen, setIconSelectorOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [describeImage, setDescribeImage] = useState(false);
  const [parentId, setParentId] = useState(null);

  // Tree nodes don't always carry parentId (hierarchy is implicit in nesting),
  // so resolve the authoritative parent from the flat allNodes list.
  const flatSelf = isEdit ? allNodes.find((n) => n.id === node.id) : null;
  const currentParentId = flatSelf?.parentId ?? node?.parentId ?? null;

  // Only the actual root (ProjectTheme) cannot be re-parented. A node with no
  // parent that is NOT a ProjectTheme is an orphan ("freier Knoten") — those
  // are precisely the nodes that need to be re-assignable, so do NOT treat
  // "no parent" as root here.
  const flatType = flatSelf?.type ?? node?.type;
  const isRootNode = isEdit && flatType === 'ProjectTheme';

  // Eligible new parents: every node except the node itself and any of its
  // descendants (re-parenting under a descendant would create a cycle).
  const parentOptions = useMemo(() => {
    if (!isEdit || isRootNode) return [];

    // Collect this node's descendant ids from the flat allNodes list.
    const descendantIds = new Set();
    const collect = (id) => {
      allNodes.forEach((n) => {
        if (n.parentId === id && !descendantIds.has(n.id)) {
          descendantIds.add(n.id);
          collect(n.id);
        }
      });
    };
    collect(node.id);

    // Build the ancestor path label so options are identifiable. Many nodes
    // share generic labels ("Hypothesis: …"); showing the parent chain (e.g.
    // "Compliance › Boron <= EU 1.5 mg/L") lets the user pick a specific
    // child of a given node.
    const byId = new Map(allNodes.map((n) => [n.id, n]));
    const pathLabel = (n) => {
      const parts = [];
      let cur = n;
      const guard = new Set();
      while (cur && !guard.has(cur.id)) {
        parts.unshift(cur.label || cur.id);
        guard.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : null;
      }
      return parts.join(' › ');
    };

    return allNodes
      .filter((n) => n.id !== node.id && !descendantIds.has(n.id))
      .map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        pathLabel: pathLabel(n),
      }))
      .sort((a, b) => a.pathLabel.localeCompare(b.pathLabel));
  }, [isEdit, isRootNode, allNodes, node]);

  const selectedParent = parentOptions.find((p) => p.id === parentId) || null;

  // Initialize form when node changes
  useEffect(() => {
    if (node) {
      setLabel(node.label || '');
      setDescription(node.description || '');
      setPriority(node.priority || 5);
      setAttentionWeight(node.attentionWeight || 0.5);
      setIconName(node.iconName || '');
      setWikiSlug(node.wikiSlug || '');
      setImages(node.images || []);
      setParentId(currentParentId);
    } else {
      setLabel('');
      setDescription('');
      setPriority(5);
      setAttentionWeight(0.5);
      setIconName('');
      setWikiSlug('');
      setImages([]);
      setParentId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, open, currentParentId]);

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
        wikiSlug: wikiSlug.trim() || undefined,
        images,
      };

      let response;
      if (isEdit) {
        // Update existing node
        response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${node.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new node
        response = await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            parentId: parentNode?.id,
          }),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to save node:', errorText);
        return;
      }

      // Re-parent if the parent was changed in the dialog (edit mode only,
      // never for the root node, and only when an actual parent is chosen).
      if (isEdit && !isRootNode && parentId && parentId !== currentParentId) {
        const parentResp = await apiFetch(
          `/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${node.id}/parent`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentId }),
          },
        );
        if (!parentResp.ok) {
          const errorText = await parentResp.text();
          console.error('Failed to reassign parent:', errorText);
          return;
        }
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

      // Build URL with describe_image query parameter if enabled
      const url = describeImage
        ? `/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${node.id}/images?describe_image=true`
        : `/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${node.id}/images`;

      const response = await apiFetch(url, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setImages([...images, data.filename]);
        // Update description if it was generated by Claude
        if (data.description) {
          setDescription(data.description);
        }
        // Refresh the canvas to show the new image
        if (onNodeUpdated) {
          onNodeUpdated();
        }
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
      await apiFetch(`/api/workspace/${projectName}/scrapbook/${graphName}/nodes/${node.id}/images/${filename}`, {
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
          {isEdit ? t('scrapbookNodeEdit:dialogTitleEdit') : t('scrapbookNodeEdit:dialogTitleAdd')}
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {/* Label */}
            <TextField
              label={t('scrapbookNodeEdit:title')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              fullWidth
              required
              autoFocus
            />

            {/* Description */}
            <TextField
              label={t('common.description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />

            {/* Parent assignment (edit mode, non-root only). The root node has
                no parent and cannot be re-parented, so the selector is hidden
                for it. */}
            {isEdit && !isRootNode && (
              <Autocomplete
                options={parentOptions}
                value={selectedParent}
                onChange={(_e, val) => setParentId(val ? val.id : null)}
                getOptionLabel={(o) => o.pathLabel || o.label || o.id}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                renderOption={(props, o) => (
                  <li {...props} key={o.id}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2">{o.label || o.id}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {o.pathLabel}
                      </Typography>
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('scrapbookNodeEdit:parent', 'Parent node')}
                    helperText={t(
                      'scrapbookNodeEdit:parentHelp',
                      'Move this node under a different parent. Search by name; the path shows where each node sits.',
                    )}
                  />
                )}
              />
            )}

            {/* Wiki page link */}
            <TextField
              label={t('scrapbookNodeEdit:wikiSlug', 'Wiki page slug (optional)')}
              value={wikiSlug}
              onChange={(e) => setWikiSlug(e.target.value)}
              fullWidth
              placeholder="reverse-osmosis"
              helperText={t(
                'scrapbookNodeEdit:wikiSlugHelp',
                'Links this node to wiki/topics/<slug>.md. Used by "Open wiki page" in the node menu.',
              )}
            />

            {/* Priority */}
            <Box>
              <Typography gutterBottom>{t('scrapbookNodeEdit:priority', { value: priority })}</Typography>
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
              <Typography gutterBottom>{t('scrapbookNodeEdit:attentionWeight', { value: (attentionWeight * 100).toFixed(0) })}</Typography>
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
              <Typography gutterBottom>{t('scrapbookNodeEdit:icon')}</Typography>
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
                  <Typography color="text.secondary">{t('scrapbookNodeEdit:clickToSelectIcon')}</Typography>
                )}
              </Paper>
            </Box>

            {/* Image Upload (only for edit mode) */}
            {isEdit && (
              <Box>
                <Typography gutterBottom>{t('scrapbookNodeEdit:images')}</Typography>
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
                      <AuthedImage
                        url={`/api/workspace/${projectName}/scrapbook/${graphName}/images/${filename}`}
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={describeImage}
                        onChange={(e) => setDescribeImage(e.target.checked)}
                        size="small"
                      />
                    }
                    label={t('scrapbookNodeEdit:describeImage')}
                  />
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUpload />}
                    disabled={uploading}
                    size="small"
                  >
                    {uploading ? t('scrapbookNodeEdit:uploading') : t('scrapbookNodeEdit:uploadImage')}
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!label.trim() || saving}
          >
            {saving ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
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
        <DialogTitle>{t('scrapbookNodeEdit:selectIconTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            placeholder={t('scrapbookNodeEdit:searchIconsPlaceholder')}
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
              {t('scrapbookNodeEdit:noIconsFound')}
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
              {t('scrapbookNodeEdit:clearIcon')}
            </Button>
          )}
          <Button onClick={() => setIconSelectorOpen(false)}>{t('common.cancel')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
