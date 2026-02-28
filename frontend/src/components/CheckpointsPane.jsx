import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Collapse,
  Chip,
  Tooltip,
  Paper,
} from '@mui/material';
import { MdOutlineRestorePage, MdClose, MdExpandMore, MdExpandLess } from 'react-icons/md';
import { IoMdAdd, IoIosGitNetwork } from 'react-icons/io';
import { IoShieldCheckmark } from 'react-icons/io5';
import { RiDeleteBinLine } from 'react-icons/ri';
import { VscDiscard } from 'react-icons/vsc';
import { apiAxios } from '../services/api';
import BackgroundInfo from './BackgroundInfo';
import ComplianceReleaseWizard from './ComplianceReleaseWizard';
import { useTranslation } from 'react-i18next';

const statusColors = {
  modified: '#f59e0b',
  added: '#22c55e',
  untracked: '#22c55e',
  deleted: '#ef4444',
  renamed: '#3b82f6',
};

const statusLabels = {
  modified: 'M',
  added: 'A',
  untracked: '?',
  deleted: 'D',
  renamed: 'R',
};

export default function CheckpointsPane({ projectName, showBackgroundInfo, onRestoreComplete }) {
  const { t } = useTranslation();
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newCheckpointMessage, setNewCheckpointMessage] = useState('');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [complianceWizardOpen, setComplianceWizardOpen] = useState(false);
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [complianceLoading, setComplianceLoading] = useState(false);

  // Uncommitted changes
  const [changes, setChanges] = useState([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [discardConfirm, setDiscardConfirm] = useState(null);

  // Commit files for selected checkpoint dialog
  const [commitFiles, setCommitFiles] = useState([]);
  const [commitFilesLoading, setCommitFilesLoading] = useState(false);

  // Git connection check
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [connectionLoading, setConnectionLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:6060';

  // Load checkpoints and changes on mount and when projectName changes
  useEffect(() => {
    if (projectName) {
      loadCheckpoints();
      loadChanges();
    }
  }, [projectName]);

  const loadCheckpoints = async () => {
    if (!projectName) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiAxios.get(`${API_BASE}/api/checkpoints/${projectName}/list`);
      if (response.data.success) {
        setCheckpoints(response.data.checkpoints || []);
      } else {
        setError(response.data.message || t('checkpoints.errorLoadFailed'));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('checkpoints.errorLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadChanges = async () => {
    if (!projectName) return;

    setChangesLoading(true);
    try {
      const response = await apiAxios.get(`${API_BASE}/api/checkpoints/${projectName}/changes`);
      if (response.data.success) {
        setChanges(response.data.changes || []);
      }
    } catch (err) {
      // Changes endpoint may not be available with legacy provider — silently ignore
      console.debug('Changes not available:', err.message);
      setChanges([]);
    } finally {
      setChangesLoading(false);
    }
  };

  const createCheckpoint = async () => {
    if (!newCheckpointMessage.trim() || !projectName) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await apiAxios.post(`${API_BASE}/api/checkpoints/${projectName}/create`, {
        message: newCheckpointMessage
      });

      if (response.data.success) {
        setNewCheckpointMessage('');
        await loadCheckpoints();
        await loadChanges();
      } else {
        setError(response.data.message || t('checkpoints.errorCreateFailed'));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('checkpoints.errorCreateFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const restoreCheckpoint = async () => {
    if (!selectedCheckpoint || !projectName) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await apiAxios.post(`${API_BASE}/api/checkpoints/${projectName}/restore`, {
        commitHash: selectedCheckpoint.gitId
      });

      if (response.data.success) {
        setDialogOpen(false);
        setSelectedCheckpoint(null);
        await loadChanges();
        if (onRestoreComplete) {
          onRestoreComplete();
        }
      } else {
        setError(response.data.message || t('checkpoints.errorRestoreFailed'));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('checkpoints.errorRestoreFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const deleteCheckpoint = async () => {
    if (!selectedCheckpoint || !projectName) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await apiAxios.delete(
        `${API_BASE}/api/checkpoints/${projectName}/${selectedCheckpoint.gitId}`
      );

      if (response.data.success) {
        setDialogOpen(false);
        setSelectedCheckpoint(null);
        await loadCheckpoints();
      } else {
        setError(response.data.message || t('checkpoints.errorDeleteFailed'));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('checkpoints.errorDeleteFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const discardFile = async (filePath) => {
    if (!projectName) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await apiAxios.post(`${API_BASE}/api/checkpoints/${projectName}/discard`, {
        path: filePath
      });

      if (response.data.success) {
        setDiscardConfirm(null);
        await loadChanges();
      } else {
        setError(response.data.message || t('checkpoints.errorDiscardFailed'));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('checkpoints.errorDiscardFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckpointClick = async (checkpoint) => {
    setSelectedCheckpoint(checkpoint);
    setDialogOpen(true);
    setError(null);
    setCommitFiles([]);

    // Load files changed in this commit
    setCommitFilesLoading(true);
    try {
      const response = await apiAxios.get(
        `${API_BASE}/api/checkpoints/${projectName}/commit-files/${checkpoint.gitId}`
      );
      if (response.data.success) {
        setCommitFiles(response.data.files || []);
      }
    } catch (err) {
      console.debug('Commit files not available:', err.message);
    } finally {
      setCommitFilesLoading(false);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedCheckpoint(null);
    setCommitFiles([]);
    setError(null);
  };

  const openComplianceWizard = async () => {
    setComplianceLoading(true);
    setError(null);
    try {
      const response = await apiAxios.get(`${API_BASE}/api/compliance/${projectName}/status`);
      setComplianceStatus(response.data);
      setComplianceWizardOpen(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('checkpoints.errorComplianceFailed'));
    } finally {
      setComplianceLoading(false);
    }
  };

  const handleReleaseCreated = () => {
    loadCheckpoints();
    loadChanges();
  };

  const checkGitConnection = async () => {
    setConnectionLoading(true);
    setConnectionStatus(null);
    try {
      const response = await apiAxios.get(`${API_BASE}/api/checkpoints/connection-check`);
      setConnectionStatus(response.data);
    } catch (err) {
      setConnectionStatus({
        connected: false,
        url: '',
        username: '',
        error: err.response?.data?.message || err.message || t('checkpoints.errorConnectionFailed'),
      });
    } finally {
      setConnectionLoading(false);
    }
  };

  if (!projectName) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', color: '#999' }}>
        <Typography>{t('checkpoints.noProject')}</Typography>
      </Box>
    );
  }

  const hasChanges = changes.length > 0;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <BackgroundInfo infoId="checkpoints" showBackgroundInfo={showBackgroundInfo} />

      {/* Create new checkpoint */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={t('checkpoints.placeholder')}
          value={newCheckpointMessage}
          onChange={(e) => setNewCheckpointMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !actionLoading) {
              createCheckpoint();
            }
          }}
          disabled={actionLoading}
        />
        <IconButton
          color="primary"
          onClick={createCheckpoint}
          disabled={!newCheckpointMessage.trim() || actionLoading || !hasChanges}
        >
          {actionLoading ? <CircularProgress size={24} /> : <IoMdAdd />}
        </IconButton>
      </Box>

      {/* Error display */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Uncommitted changes */}
      <Box sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            mb: 0.5,
          }}
          onClick={() => setChangesExpanded(!changesExpanded)}
        >
          {changesExpanded ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}
          <Typography variant="subtitle2" sx={{ ml: 0.5, flex: 1 }}>
            {t('checkpoints.uncommittedChanges')}
          </Typography>
          {changesLoading ? (
            <CircularProgress size={14} />
          ) : (
            <Chip
              label={changes.length}
              size="small"
              color={hasChanges ? 'warning' : 'default'}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); loadChanges(); }} sx={{ ml: 0.5 }}>
            <i className="codicon codicon-refresh" style={{ fontSize: 14 }} />
          </IconButton>
        </Box>
        <Collapse in={changesExpanded}>
          {!hasChanges && !changesLoading ? (
            <Typography variant="body2" color="text.secondary" sx={{ pl: 3, py: 1 }}>
              {t('checkpoints.noUncommittedChanges')}
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 200, overflowY: 'auto', py: 0 }}>
              {changes.map((change) => (
                <ListItem
                  key={change.path}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => setDiscardConfirm(change)}
                      disabled={actionLoading}
                      title={t('checkpoints.discardChanges')}
                    >
                      <VscDiscard size={14} />
                    </IconButton>
                  }
                >
                  <ListItemButton sx={{ py: 0.25, px: 1 }} dense>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mr: 1,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        color: statusColors[change.status] || '#999',
                      }}
                    >
                      {statusLabels[change.status] || '?'}
                    </Box>
                    <ListItemText
                      primary={change.path}
                      primaryTypographyProps={{ variant: 'body2', noWrap: true, fontSize: '0.8rem' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Collapse>
      </Box>

      {/* Checkpoints list */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : checkpoints.length === 0 ? (
          <Box sx={{ textAlign: 'center', color: '#999', p: 4 }}>
            <MdOutlineRestorePage size={48} />
            <Typography sx={{ mt: 2 }}>{t('checkpoints.noCheckpointsYet')}</Typography>
            <Typography variant="body2">{t('checkpoints.createFirstCheckpoint')}</Typography>
          </Box>
        ) : (
          <>
          <Typography variant="subtitle2" sx={{ px: 1, pt: 1, pb: 0.5 }}>
            {t('checkpoints.previousCheckpoints')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {checkpoints.map((checkpoint) => (
              <Paper key={checkpoint.gitId} variant="outlined" sx={{ overflow: 'hidden' }}>
                <ListItemButton onClick={() => handleCheckpointClick(checkpoint)} sx={{ py: 0.75 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <MdOutlineRestorePage size={20} />
                    <ListItemText
                      primary={checkpoint.commit}
                      secondary={new Date(checkpoint.timestamp_created).toLocaleString()}
                    />
                  </Box>
                </ListItemButton>
              </Paper>
            ))}
          </Box>
          </>
        )}
      </Box>

      {/* Bottom actions */}
      {connectionStatus && (
        <Alert
          severity={connectionStatus.connected ? 'success' : 'error'}
          onClose={() => setConnectionStatus(null)}
          sx={{ mb: 1, '& .MuiAlert-message': { fontSize: '0.8rem' } }}
        >
          {connectionStatus.connected ? (
            t('checkpoints.connectedTo', { url: connectionStatus.url, username: connectionStatus.username })
          ) : (
            <>
              {connectionStatus.error}
              {connectionStatus.url && (
                <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                  {t('checkpoints.connectionUrl', { url: connectionStatus.url })}
                </Typography>
              )}
            </>
          )}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          fullWidth
          variant="outlined"
          size="small"
          startIcon={complianceLoading ? <CircularProgress size={16} /> : <IoShieldCheckmark />}
          onClick={openComplianceWizard}
          disabled={complianceLoading || actionLoading}
        >
          {t('checkpoints.createRelease')}
        </Button>
        <Tooltip title={t('checkpoints.checkGitConnection')}>
          <span>
            <Button
              variant="outlined"
              size="small"
              startIcon={connectionLoading ? <CircularProgress size={16} /> : <IoIosGitNetwork />}
              onClick={checkGitConnection}
              disabled={connectionLoading}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {t('checkpoints.testConnection')}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Checkpoint actions dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { overflowX: 'hidden' }
        }}
      >
        <DialogTitle sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pr: 1,
          minWidth: 0
        }}>
          <Box sx={{
            flexGrow: 1,
            minWidth: 0,
            mr: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {t('checkpoints.dialogTitle', { commit: selectedCheckpoint?.commit })}
          </Box>
          <IconButton
            edge="end"
            color="inherit"
            onClick={handleCloseDialog}
            disabled={actionLoading}
            aria-label={t('common.close')}
            sx={{ flexShrink: 0 }}
          >
            <MdClose />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ overflowX: 'hidden' }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {t('checkpoints.dialogCreated', { date: selectedCheckpoint ? new Date(selectedCheckpoint.timestamp_created).toLocaleString() : '' })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, wordBreak: 'break-all' }}>
            {t('checkpoints.dialogHash', { hash: selectedCheckpoint?.gitId?.substring(0, 8) })}
          </Typography>

          {/* Files changed in this commit */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('checkpoints.dialogFilesChanged')}
            </Typography>
            {commitFilesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} />
              </Box>
            ) : commitFiles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('checkpoints.dialogNoFileInfo')}
              </Typography>
            ) : (
              <List dense sx={{ maxHeight: 200, overflowY: 'auto', py: 0 }}>
                {commitFiles.map((file) => (
                  <ListItem key={file.path} disablePadding>
                    <ListItemButton sx={{ py: 0.25, px: 1 }} dense>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mr: 1,
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          color: statusColors[file.status] || '#999',
                        }}
                      >
                        {statusLabels[file.status] || '?'}
                      </Box>
                      <ListItemText
                        primary={file.path}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true, fontSize: '0.8rem' }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
          <IconButton
            onClick={deleteCheckpoint}
            disabled={actionLoading}
            color="error"
            aria-label={t('checkpoints.deleteCheckpointAriaLabel')}
          >
            <RiDeleteBinLine />
          </IconButton>
          <Button
            onClick={restoreCheckpoint}
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : t('checkpoints.dialogRestoreNow')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Discard confirmation dialog */}
      <Dialog
        open={discardConfirm !== null}
        onClose={() => setDiscardConfirm(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('checkpoints.discardTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('checkpoints.discardMessage', { path: discardConfirm?.path })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {discardConfirm?.status === 'untracked'
              ? t('checkpoints.discardUntrackedWarning')
              : t('checkpoints.discardRevertWarning')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardConfirm(null)}>{t('common.cancel')}</Button>
          <Button
            onClick={() => discardFile(discardConfirm?.path)}
            color="error"
            variant="contained"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : t('checkpoints.discardButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Compliance Release Wizard */}
      <ComplianceReleaseWizard
        open={complianceWizardOpen}
        onClose={() => setComplianceWizardOpen(false)}
        projectName={projectName}
        status={complianceStatus}
        onReleaseCreated={handleReleaseCreated}
      />
    </Box>
  );
}
