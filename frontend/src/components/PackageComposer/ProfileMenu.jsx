import React, { useEffect, useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Bookmark,
  BookmarkAdd,
  BookmarkRemove,
  FolderOpen,
  Save,
} from '@mui/icons-material';
import {
  deleteProfile,
  getProfile,
  listProfiles,
  saveProfile,
} from '../../services/packageProfiles';
import usePackageDraftStore from '../../stores/usePackageDraftStore';

/**
 * Toolbar dropdown for managing saved profiles.
 *
 * - "Save as…" prompts for an id and PUTs the current manifest.
 * - Each saved profile is a menu entry; clicking loads it into the draft.
 * - A small × on hover deletes the profile.
 */
export default function ProfileMenu() {
  const manifest = usePackageDraftStore((s) => s.manifest);
  const loadManifest = usePackageDraftStore((s) => s.loadManifest);
  const resolveNow = usePackageDraftStore((s) => s.resolveNow);

  const [anchorEl, setAnchorEl] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveId, setSaveId] = useState('');
  const [saveError, setSaveError] = useState(null);

  const open = Boolean(anchorEl);

  const refresh = async () => {
    setLoading(true);
    try {
      const items = await listProfiles();
      setProfiles(items);
    } catch (err) {
      console.error('Failed to load profiles', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleLoad = async (id) => {
    try {
      const profile = await getProfile(id);
      loadManifest(profile.manifest);
      setAnchorEl(null);
      resolveNow();
    } catch (err) {
      console.error('Failed to load profile', err);
    }
  };

  const handleDelete = async (id, ev) => {
    ev.stopPropagation();
    if (!window.confirm(`Delete profile "${id}"?`)) return;
    try {
      await deleteProfile(id);
      await refresh();
    } catch (err) {
      console.error('Failed to delete profile', err);
    }
  };

  const openSaveDialog = () => {
    setSaveId(manifest.name || '');
    setSaveError(null);
    setSaveDialogOpen(true);
    setAnchorEl(null);
  };

  const handleSave = async () => {
    if (!saveId.trim()) {
      setSaveError('Profile id is required.');
      return;
    }
    try {
      await saveProfile(saveId.trim(), manifest);
      setSaveDialogOpen(false);
    } catch (err) {
      setSaveError(err?.response?.data?.message || err?.message || 'Save failed');
    }
  };

  return (
    <>
      <Button
        size="small"
        startIcon={<Bookmark />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ mr: 1 }}
      >
        Profiles
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { minWidth: 240 } }}
      >
        <MenuItem onClick={openSaveDialog}>
          <ListItemIcon>
            <BookmarkAdd fontSize="small" />
          </ListItemIcon>
          <ListItemText>Save current as…</ListItemText>
        </MenuItem>
        {profiles.length > 0 && <Divider />}
        {loading && (
          <MenuItem disabled>
            <ListItemText>Loading…</ListItemText>
          </MenuItem>
        )}
        {!loading && profiles.length === 0 && (
          <MenuItem disabled>
            <ListItemText
              primary="No saved profiles"
              secondary="Save the current manifest to reuse it later."
            />
          </MenuItem>
        )}
        {profiles.map((p) => (
          <MenuItem key={p.id} onClick={() => handleLoad(p.id)}>
            <ListItemIcon>
              <FolderOpen fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={p.label} secondary={p.id} />
            <Tooltip title="Delete">
              <IconButton size="small" onClick={(e) => handleDelete(p.id, e)}>
                <BookmarkRemove fontSize="small" />
              </IconButton>
            </Tooltip>
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save profile</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Profile id (kebab-case)"
            value={saveId}
            onChange={(e) => setSaveId(e.target.value)}
            error={!!saveError}
            helperText={saveError || 'Used as the filesystem directory name.'}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<Save />} onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
