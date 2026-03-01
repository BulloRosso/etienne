import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Collapse,
  Divider,
  Snackbar,
  Tooltip,
} from '@mui/material';
import {
  Close,
  ExpandMore,
  ExpandLess,
  CheckCircleOutline,
  CancelOutlined,
  Refresh,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../services/api';

const STATUS_COLORS = {
  OPEN: 'default',
  APPROVED: 'info',
  REJECTED: 'error',
  DIAGNOSING: 'warning',
  DIAGNOSED: 'secondary',
  PATCH_PENDING: 'warning',
  PATCHING: 'warning',
  VERIFYING: 'info',
  RESOLVED: 'success',
  FAILED: 'error',
  ESCALATED: 'error',
};

const SEVERITY_COLORS = {
  CRITICAL: '#d32f2f',
  HIGH: '#f57c00',
  MEDIUM: '#fbc02d',
  LOW: '#4caf50',
};

const AUTONOMY_LABELS = [
  { level: 0, name: 'OBSERVE', description: 'Diagnose only, suggest fix, change nothing' },
  { level: 1, name: 'SUGGEST', description: 'Create patch diff, admin must review and approve each patch' },
  { level: 2, name: 'AUTO_LOW', description: 'Auto-apply low-risk patches; high-risk goes to admin review' },
  { level: 3, name: 'AUTO_ALL', description: 'Auto-apply all patches with rollback guarantee' },
];

const ACTIVE_STATUSES = ['OPEN', 'APPROVED', 'DIAGNOSING', 'DIAGNOSED', 'PATCH_PENDING', 'PATCHING', 'VERIFYING'];
const HISTORY_STATUSES = ['RESOLVED', 'FAILED', 'REJECTED', 'ESCALATED'];

export default function IssueManager({ open, onClose, currentProject }) {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [tabValue, setTabValue] = useState(0);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // Report form state
  const [reportTitle, setReportTitle] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSteps, setReportSteps] = useState('');
  const [reportExpected, setReportExpected] = useState('');
  const [reportActual, setReportActual] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reject dialog state
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingIssueId, setRejectingIssueId] = useState(null);

  // Autonomy config
  const [autonomyLevel, setAutonomyLevel] = useState(0);
  const [autonomyLoading, setAutonomyLoading] = useState(false);

  // Comment state
  const [commentText, setCommentText] = useState('');

  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  useEffect(() => {
    if (open && currentProject) {
      fetchIssues();
      if (isAdmin) fetchAutonomyLevel();
    }
  }, [open, currentProject]);

  const fetchIssues = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/issues/${currentProject}`);
      const data = await response.json();
      if (data.success) {
        setIssues(data.issues || []);
      }
    } catch (error) {
      console.error('Failed to fetch issues:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAutonomyLevel = async () => {
    try {
      const response = await apiFetch(`/api/issues/${currentProject}/config/autonomy`);
      const data = await response.json();
      if (data.success) {
        setAutonomyLevel(data.config.autonomyLevel);
      }
    } catch (error) {
      console.error('Failed to fetch autonomy level:', error);
    }
  };

  const handleSubmitIssue = async () => {
    if (!reportTitle.trim() || !reportDescription.trim()) return;
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/issues/${currentProject}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reportTitle.trim(),
          description: reportDescription.trim(),
          stepsToReproduce: reportSteps.trim() || undefined,
          expectedBehavior: reportExpected.trim() || undefined,
          actualBehavior: reportActual.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        showToast(t('issues.issueCreated'));
        setReportTitle('');
        setReportDescription('');
        setReportSteps('');
        setReportExpected('');
        setReportActual('');
        setTabValue(0);
        fetchIssues();
      } else {
        showToast(data.message || 'Failed to create issue', 'error');
      }
    } catch (error) {
      showToast('Failed to create issue', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (issueId) => {
    try {
      const response = await apiFetch(`/api/issues/${currentProject}/${issueId}/approve`, {
        method: 'PATCH',
      });
      const data = await response.json();
      if (data.success) {
        showToast(t('issues.issueApproved'));
        fetchIssues();
      }
    } catch (error) {
      showToast('Failed to approve issue', 'error');
    }
  };

  const handleReject = async (issueId) => {
    if (!rejectReason.trim()) return;
    try {
      const response = await apiFetch(`/api/issues/${currentProject}/${issueId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        showToast(t('issues.issueRejected'));
        setRejectingIssueId(null);
        setRejectReason('');
        fetchIssues();
      }
    } catch (error) {
      showToast('Failed to reject issue', 'error');
    }
  };

  const handleUpdatePriority = async (issueId, field, value) => {
    try {
      const body = {};
      body[field] = value;
      await apiFetch(`/api/issues/${currentProject}/${issueId}/priority`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      fetchIssues();
    } catch (error) {
      showToast('Failed to update priority', 'error');
    }
  };

  const handleAddComment = async (issueId) => {
    if (!commentText.trim()) return;
    try {
      await apiFetch(`/api/issues/${currentProject}/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      setCommentText('');
      fetchIssues();
    } catch (error) {
      showToast('Failed to add comment', 'error');
    }
  };

  const handleAutonomyChange = async (newLevel) => {
    setAutonomyLoading(true);
    try {
      const response = await apiFetch(`/api/issues/${currentProject}/config/autonomy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: newLevel }),
      });
      const data = await response.json();
      if (data.success) {
        setAutonomyLevel(newLevel);
        showToast(`Autonomy level set to ${AUTONOMY_LABELS[newLevel].name}`);
      }
    } catch (error) {
      showToast('Failed to update autonomy level', 'error');
    } finally {
      setAutonomyLoading(false);
    }
  };

  const activeIssues = issues.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const historyIssues = issues.filter((i) => HISTORY_STATUSES.includes(i.status));

  const renderIssueRow = (issue, showAdminActions = true) => (
    <React.Fragment key={issue.id}>
      <TableRow
        hover
        onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
        sx={{ cursor: 'pointer' }}
      >
        <TableCell sx={{ fontWeight: 600, width: 60 }}>#{issue.number}</TableCell>
        <TableCell>{issue.title}</TableCell>
        <TableCell>
          <Chip label={issue.status} color={STATUS_COLORS[issue.status] || 'default'} size="small" />
        </TableCell>
        <TableCell>
          <Chip
            label={issue.severity}
            size="small"
            sx={{ bgcolor: SEVERITY_COLORS[issue.severity], color: '#fff', fontWeight: 600 }}
          />
        </TableCell>
        <TableCell>{issue.priority}</TableCell>
        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {new Date(issue.createdAt).toLocaleDateString()}
        </TableCell>
        <TableCell>
          {expandedIssue === issue.id ? <ExpandLess /> : <ExpandMore />}
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, border: expandedIssue === issue.id ? undefined : 'none' }}>
          <Collapse in={expandedIssue === issue.id} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>{t('issues.description')}</Typography>
              <Typography variant="body2" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>{issue.description}</Typography>

              {issue.stepsToReproduce && (
                <>
                  <Typography variant="subtitle2" gutterBottom>{t('issues.stepsToReproduce')}</Typography>
                  <Typography variant="body2" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>{issue.stepsToReproduce}</Typography>
                </>
              )}

              {issue.expectedBehavior && (
                <>
                  <Typography variant="subtitle2" gutterBottom>{t('issues.expectedBehavior')}</Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>{issue.expectedBehavior}</Typography>
                </>
              )}

              {issue.actualBehavior && (
                <>
                  <Typography variant="subtitle2" gutterBottom>{t('issues.actualBehavior')}</Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>{issue.actualBehavior}</Typography>
                </>
              )}

              {issue.rootCause && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" gutterBottom>{t('issues.rootCause')}</Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>{issue.rootCause}</Typography>
                  {issue.confidenceScore != null && (
                    <Typography variant="caption" color="text.secondary">
                      {t('issues.confidence')}: {(issue.confidenceScore * 100).toFixed(0)}%
                    </Typography>
                  )}
                </>
              )}

              {issue.rejectionReason && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" color="error" gutterBottom>{t('issues.rejectionReason')}</Typography>
                  <Typography variant="body2">{issue.rejectionReason}</Typography>
                </>
              )}

              {issue.resolvedAt && (
                <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 1 }}>
                  {t('issues.resolvedAt')}: {new Date(issue.resolvedAt).toLocaleString()}
                  {issue.timeToResolve && ` (${Math.round(issue.timeToResolve / 60000)} min)`}
                </Typography>
              )}

              {/* Comments */}
              {issue.comments && issue.comments.length > 0 && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" gutterBottom>{t('issues.comments')}</Typography>
                  {issue.comments.map((c) => (
                    <Box key={c.id} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {c.author} ({c.role}) — {new Date(c.createdAt).toLocaleString()}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.content}</Typography>
                    </Box>
                  ))}
                </>
              )}

              {/* Add comment */}
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder={t('issues.addComment')}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(issue.id); } }}
                />
                <Button size="small" variant="text" onClick={() => handleAddComment(issue.id)}>
                  {t('issues.submitIssue')}
                </Button>
              </Box>

              {/* Admin actions */}
              {isAdmin && showAdminActions && issue.status === 'OPEN' && (
                <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<CheckCircleOutline />}
                    onClick={(e) => { e.stopPropagation(); handleApprove(issue.id); }}
                  >
                    {t('issues.approve')}
                  </Button>

                  {rejectingIssueId === issue.id ? (
                    <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder={t('issues.rejectReasonPlaceholder')}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                      <Button size="small" variant="contained" color="error" onClick={() => handleReject(issue.id)}>
                        {t('issues.confirmReject')}
                      </Button>
                      <Button size="small" onClick={() => { setRejectingIssueId(null); setRejectReason(''); }}>
                        {t('issues.cancel')}
                      </Button>
                    </Box>
                  ) : (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<CancelOutlined />}
                      onClick={(e) => { e.stopPropagation(); setRejectingIssueId(issue.id); }}
                    >
                      {t('issues.reject')}
                    </Button>
                  )}

                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel>{t('issues.severity')}</InputLabel>
                    <Select
                      value={issue.severity}
                      label={t('issues.severity')}
                      onChange={(e) => handleUpdatePriority(issue.id, 'severity', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuItem value="CRITICAL">Critical</MenuItem>
                      <MenuItem value="HIGH">High</MenuItem>
                      <MenuItem value="MEDIUM">Medium</MenuItem>
                      <MenuItem value="LOW">Low</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 80 }}>
                    <InputLabel>{t('issues.priority')}</InputLabel>
                    <Select
                      value={issue.priority}
                      label={t('issues.priority')}
                      onChange={(e) => handleUpdatePriority(issue.id, 'priority', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuItem value="P0">P0</MenuItem>
                      <MenuItem value="P1">P1</MenuItem>
                      <MenuItem value="P2">P2</MenuItem>
                      <MenuItem value="P3">P3</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );

  const renderIssueTable = (issueList, showAdminActions = true) => (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t('issues.title')}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t('issues.status')}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t('issues.severity')}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t('issues.priority')}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t('issues.date')}</TableCell>
            <TableCell sx={{ width: 40 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {issueList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                {t('issues.noIssues')}
              </TableCell>
            </TableRow>
          ) : (
            issueList.map((issue) => renderIssueRow(issue, showAdminActions))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderTop: '4px solid #ff9800' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">{t('issues.dialogTitle')}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={t('issues.refresh')}>
              <IconButton size="small" onClick={fetchIssues}>
                <Refresh />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={onClose}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label={`${t('issues.tabOpen')} (${activeIssues.length})`} />
            <Tab label={t('issues.tabReport')} />
            <Tab label={`${t('issues.tabHistory')} (${historyIssues.length})`} />
          </Tabs>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ p: 2 }}>
              {/* Tab 0: Open Issues */}
              {tabValue === 0 && renderIssueTable(activeIssues)}

              {/* Tab 1: Report Issue */}
              {tabValue === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label={t('issues.titleLabel')}
                    required
                    fullWidth
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    placeholder={t('issues.titlePlaceholder')}
                  />
                  <TextField
                    label={t('issues.descriptionLabel')}
                    required
                    fullWidth
                    multiline
                    rows={3}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder={t('issues.descriptionPlaceholder')}
                  />
                  <TextField
                    label={t('issues.stepsLabel')}
                    fullWidth
                    multiline
                    rows={2}
                    value={reportSteps}
                    onChange={(e) => setReportSteps(e.target.value)}
                    placeholder={t('issues.stepsPlaceholder')}
                  />
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label={t('issues.expectedLabel')}
                      fullWidth
                      multiline
                      rows={2}
                      value={reportExpected}
                      onChange={(e) => setReportExpected(e.target.value)}
                    />
                    <TextField
                      label={t('issues.actualLabel')}
                      fullWidth
                      multiline
                      rows={2}
                      value={reportActual}
                      onChange={(e) => setReportActual(e.target.value)}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      startIcon={submitting ? <CircularProgress size={16} /> : null}
                      disabled={!reportTitle.trim() || !reportDescription.trim() || submitting}
                      onClick={handleSubmitIssue}
                    >
                      {t('issues.submitIssue')}
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Tab 2: History */}
              {tabValue === 2 && renderIssueTable(historyIssues, false)}
            </Box>
          )}

          {/* Admin: Autonomy Level config */}
          {isAdmin && (
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" gutterBottom>
                {t('issues.autonomyLevel')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {AUTONOMY_LABELS.map((al) => (
                  <Tooltip key={al.level} title={al.description}>
                    <Chip
                      label={`L${al.level}: ${al.name}`}
                      variant={autonomyLevel === al.level ? 'filled' : 'outlined'}
                      color={autonomyLevel === al.level ? 'primary' : 'default'}
                      onClick={() => handleAutonomyChange(al.level)}
                      disabled={autonomyLoading}
                      sx={{ cursor: 'pointer' }}
                    />
                  </Tooltip>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
