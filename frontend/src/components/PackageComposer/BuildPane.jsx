import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Divider,
  Alert,
  Chip,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
} from '@mui/material';
import {
  CloudDownload,
  RocketLaunch,
  ErrorOutline,
  WarningAmber,
  InfoOutlined,
} from '@mui/icons-material';
import { apiAxios } from '../../services/api';
import usePackageDraftStore from '../../stores/usePackageDraftStore';
import ManifestPreviewTree from './ManifestPreviewTree';
import BuildSuccessDialog from './BuildSuccessDialog';
import LockfileInfoDialog from './LockfileInfoDialog';

/**
 * Right pane: validation summary + the two terminal actions
 * (Build → zip download, Deploy → POST /api/packages/deploy).
 *
 * Both terminal actions hit the same materializer on the backend — the
 * only difference is where it writes (tmp dir → zip vs. /workspace/<name>/).
 */
export default function BuildPane({ onDeployed }) {
  const manifest = usePackageDraftStore((s) => s.manifest);
  const lockfile = usePackageDraftStore((s) => s.lockfile);
  const conflicts = usePackageDraftStore((s) => s.conflicts);
  const warnings = usePackageDraftStore((s) => s.warnings);
  const resolving = usePackageDraftStore((s) => s.resolving);
  const resolveError = usePackageDraftStore((s) => s.resolveError);

  const [busy, setBusy] = useState(null); // 'build' | 'deploy' | null
  const [actionError, setActionError] = useState(null);
  const [buildSuccess, setBuildSuccess] = useState(null); // { filename, warnings }
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deployProjectName, setDeployProjectName] = useState('');
  const [lockfileInfoOpen, setLockfileInfoOpen] = useState(false);

  const canBuild = !!manifest.name && conflicts.length === 0 && !!lockfile;
  // Deploy doesn't require manifest.name up front — the dialog prompts for
  // the target project name.
  const canDeploy = conflicts.length === 0 && !!lockfile;

  const handleBuild = async () => {
    setBusy('build');
    setActionError(null);
    try {
      const res = await apiAxios.post('/api/packages/build', manifest, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const cd = res.headers?.['content-disposition'] || '';
      const m = /filename="?([^";]+)"?/.exec(cd);
      const filename = m ? m[1] : `${manifest.name || 'package'}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show the "apply on another instance" guidance — the user just got
      // a portable artifact, so this is the right moment to surface how
      // to use it. Parse warnings from the X-Package-Warnings header.
      let buildWarnings = [];
      const headerVal = res.headers?.['x-package-warnings'];
      if (headerVal) {
        try {
          buildWarnings = JSON.parse(headerVal);
        } catch {
          // ignore parse errors
        }
      }
      setBuildSuccess({ filename, warnings: buildWarnings });
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Build failed');
    } finally {
      setBusy(null);
    }
  };

  const openDeployDialog = () => {
    // Seed the dialog with the current manifest name; the user can override
    // before we POST. Deploy creates /workspace/<this name>/.
    setDeployProjectName(manifest.name || '');
    setActionError(null);
    setDeployDialogOpen(true);
  };

  const handleDeployConfirm = async () => {
    const name = deployProjectName.trim();
    if (!name) {
      setActionError('Project name is required.');
      return;
    }
    setBusy('deploy');
    setActionError(null);
    try {
      // Override manifest.name without mutating the draft — the user may
      // want to keep the original name for future Builds.
      const res = await apiAxios.post('/api/packages/deploy', { ...manifest, name });
      if (res.data?.success) {
        setDeployDialogOpen(false);
        onDeployed?.(res.data);
      } else {
        const errs = (res.data?.errors || []).join(', ');
        setActionError(errs || 'Deploy failed');
      }
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Deploy failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
          Validation
        </Typography>
        <IconButton
          size="small"
          onClick={() => setLockfileInfoOpen(true)}
          title="What is a lockfile?"
        >
          <InfoOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Chip
          size="small"
          icon={resolving ? <CircularProgress size={12} /> : undefined}
          label={
            resolving
              ? 'Resolving…'
              : conflicts.length > 0
              ? `${conflicts.length} error${conflicts.length === 1 ? '' : 's'}`
              : 'Valid'
          }
          color={conflicts.length > 0 ? 'error' : 'success'}
          variant={conflicts.length > 0 ? 'filled' : 'outlined'}
        />
        {warnings.length > 0 && (
          <Chip
            size="small"
            icon={<WarningAmber sx={{ fontSize: 14 }} />}
            label={`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
            color="warning"
            variant="outlined"
          />
        )}
      </Stack>

      {resolveError && (
        <Alert severity="error" sx={{ mb: 1, py: 0 }}>
          {resolveError}
        </Alert>
      )}

      {conflicts.map((c, idx) => (
        <Alert
          key={`c-${idx}`}
          severity="error"
          icon={<ErrorOutline />}
          sx={{ mb: 0.5, py: 0, fontSize: '0.75rem' }}
        >
          {c.message}
        </Alert>
      ))}
      {warnings.map((w, idx) => (
        <Alert
          key={`w-${idx}`}
          severity="warning"
          icon={<WarningAmber />}
          sx={{ mb: 0.5, py: 0, fontSize: '0.75rem' }}
        >
          {w.message}
        </Alert>
      ))}

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Layout preview
      </Typography>
      <Box sx={{ mb: 2, maxHeight: 220, overflowY: 'auto', p: 1, bgcolor: '#fafafa', borderRadius: 1 }}>
        <ManifestPreviewTree lockfile={lockfile} manifest={manifest} />
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {actionError && !deployDialogOpen && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {actionError}
        </Alert>
      )}

      <Stack spacing={1}>
        <Button
          variant="outlined"
          startIcon={busy === 'build' ? <CircularProgress size={14} /> : <CloudDownload />}
          disabled={!canBuild || busy !== null}
          onClick={handleBuild}
        >
          Build zip
        </Button>
        <Button
          variant="contained"
          startIcon={busy === 'deploy' ? <CircularProgress size={14} /> : <RocketLaunch />}
          disabled={!canDeploy || busy !== null}
          onClick={openDeployDialog}
        >
          Deploy to project
        </Button>
      </Stack>

      <BuildSuccessDialog
        open={!!buildSuccess}
        filename={buildSuccess?.filename}
        manifest={manifest}
        lockfile={lockfile}
        warnings={buildSuccess?.warnings || []}
        onClose={() => setBuildSuccess(null)}
      />

      <Dialog
        open={deployDialogOpen}
        onClose={() => busy !== 'deploy' && setDeployDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Deploy package to project</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            A new workspace project will be created at{' '}
            <code>/workspace/{deployProjectName || '<name>'}/</code>. The deploy
            will fail if a project with this name already exists.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Project name (kebab-case)"
            value={deployProjectName}
            onChange={(e) => setDeployProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && deployProjectName.trim() && busy !== 'deploy') {
                handleDeployConfirm();
              }
            }}
            sx={{ mt: 1 }}
          />
          {actionError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {actionError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployDialogOpen(false)} disabled={busy === 'deploy'}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={busy === 'deploy' ? <CircularProgress size={14} /> : <RocketLaunch />}
            onClick={handleDeployConfirm}
            disabled={!deployProjectName.trim() || busy === 'deploy'}
          >
            Deploy
          </Button>
        </DialogActions>
      </Dialog>

      <LockfileInfoDialog open={lockfileInfoOpen} onClose={() => setLockfileInfoOpen(false)} />
    </Box>
  );
}
