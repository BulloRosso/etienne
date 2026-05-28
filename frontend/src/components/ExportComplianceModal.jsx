import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Article as ArticleIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import { apiAxios } from '../services/api';

/**
 * ExportComplianceModal — opened by the compliance-matrix cockpit's
 * "Export" button (via agentbus event → context-menu modal wiring).
 *
 * The cockpit passes its active RFP and the full RFP registry through
 * `initialRfp` / `rfps`. The modal:
 *
 *  - lets the user re-pick an RFP if the project has more than one,
 *  - offers only the export modes compatible with that RFP's
 *    `exportTarget.kind`:
 *      · `docx-fillback`        → fresh | fillback-annotate | fillback-replace
 *      · `xlsx-questionnaire`   → fresh | fillback-xlsx
 *  - sends fill-back to the matching backend endpoint
 *    (`/documents/fill-back` for DOCX, `/documents/fill-back-xlsx` for XLSX).
 *
 * If neither prop is supplied (e.g. older callers), the modal degrades to
 * the legacy single-RFP behaviour: free pick of any .docx under the
 * project, write into out/coverage/current.coverage.json.
 */
export default function ExportComplianceModal({
  open,
  onClose,
  projectName,
  initialRfp = null,
  rfps = [],
}) {
  const { t } = useTranslation();

  // RFP state — defaults to whatever the cockpit was showing. Falls back
  // to the first registry entry if `initialRfp` is null (e.g. context-menu
  // opener path that doesn't know the cockpit's active RFP).
  const initialRfpId =
    initialRfp?.id ?? (rfps[0]?.id ?? null);
  const [selectedRfpId, setSelectedRfpId] = useState(initialRfpId);

  const selectedRfp = useMemo(() => {
    if (initialRfp && initialRfp.id === selectedRfpId) return initialRfp;
    return rfps.find((r) => r.id === selectedRfpId) ?? initialRfp ?? null;
  }, [initialRfp, rfps, selectedRfpId]);

  const exportKind = selectedRfp?.exportTarget?.kind ?? null;

  const [mode, setMode] = useState(''); // unset by design
  const [sourceDocs, setSourceDocs] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Reset mode whenever the selected RFP changes — the available modes
  // depend on the RFP's exportTarget.kind, and stale selections would
  // produce confusing canRun behaviour.
  useEffect(() => {
    setMode('');
    setSelectedSource(null);
    setResult(null);
    setError(null);
  }, [selectedRfpId]);

  // DOCX picker fetch — only relevant when:
  //  - exportKind is docx-fillback OR no RFP context (legacy fallback),
  //  - AND the user has chosen a fill-back mode.
  const needsDocxPicker =
    (exportKind === 'docx-fillback' || exportKind === null) &&
    (mode === 'fillback-annotate' || mode === 'fillback-replace');

  useEffect(() => {
    if (!open || !needsDocxPicker) return;
    if (sourceDocs.length > 0) return;
    let cancelled = false;
    setLoadingDocs(true);
    apiAxios
      .post('/api/claude/filesystem', { projectName })
      .then((response) => {
        if (cancelled) return;
        const flat = [];
        const walk = (node, prefix = '') => {
          if (!node) return;
          const p = prefix ? `${prefix}/${node.name}` : node.name;
          if (node.type === 'file' && /\.docx$/i.test(node.name)) {
            flat.push(p);
          }
          if (Array.isArray(node.children)) {
            for (const c of node.children) walk(c, p);
          }
        };
        const root = response.data?.tree || response.data;
        if (Array.isArray(root)) {
          for (const top of root) walk(top, '');
        } else if (root) {
          walk(root, '');
        }
        // Prefer files under documents/ (the original RFP volume lives there)
        flat.sort((a, b) => {
          const ad = /^documents\//i.test(a) ? 0 : 1;
          const bd = /^documents\//i.test(b) ? 0 : 1;
          return ad - bd || a.localeCompare(b);
        });
        setSourceDocs(flat);
      })
      .catch(() => {
        if (!cancelled) setSourceDocs([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDocs(false);
      });
    return () => { cancelled = true; };
  }, [open, needsDocxPicker, projectName, sourceDocs.length]);

  const canRun = useMemo(() => {
    if (busy) return false;
    if (!mode) return false;
    if (mode === 'fresh') return true;
    if (mode === 'fillback-xlsx') return Boolean(selectedRfp);
    return Boolean(selectedSource);
  }, [busy, mode, selectedSource, selectedRfp]);

  const handleClose = () => {
    if (busy) return;
    setResult(null);
    setError(null);
    setMode('');
    setSelectedSource(null);
    onClose?.();
  };

  const handleRun = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'fresh') {
        // Existing "fresh deliverable" path: hand off to the subagent.
        window.dispatchEvent(
          new CustomEvent('viewer-auto-prompt', {
            detail: {
              fresh: true,
              message:
                'Run the export step on the current coverage matrix. Refuse to render if any row is still in state open / drafted / reviewed and list the blockers with owners. Otherwise render the technical specification + compliance matrix into the customer\'s required Word/PDF template, stamping every section with the requirement IDs it answers and any override edges. Traceability must survive the export.',
            },
          }),
        );
        setResult({
          kind: 'fresh',
          message:
            t('exportCompliance:freshHandoff', {
              defaultValue:
                'Handed off to the export-specification subagent. Watch the chat for progress.',
            }),
        });
      } else if (mode === 'fillback-xlsx') {
        const response = await apiAxios.post(
          `/api/workspace/${encodeURIComponent(projectName)}/documents/fill-back-xlsx`,
          { rfpId: selectedRfp.id },
        );
        setResult({ kind: 'xlsx', ...response.data });
      } else {
        const backendMode = mode === 'fillback-annotate' ? 'annotate' : 'replace';
        // When operating on an explicit RFP, pass its coverageRef so the
        // backend reads the right coverage file (otherwise it falls back
        // to the legacy out/coverage/current.coverage.json).
        const body = {
          sourceDocPath: selectedSource,
          mode: backendMode,
        };
        if (selectedRfp?.coverageRef) {
          body.coverageRef = selectedRfp.coverageRef;
        }
        const response = await apiAxios.post(
          `/api/workspace/${encodeURIComponent(projectName)}/documents/fill-back`,
          body,
        );
        setResult({ kind: backendMode, ...response.data });
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Show the RFP picker when the project has more than one RFP. With a
  // single (or zero) registered RFP the picker is unhelpful clutter.
  const showRfpPicker = rfps.length >= 2;

  return (
    <Dialog open={!!open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('exportCompliance:title', { defaultValue: 'Export compliance matrix' })}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <DialogContentText>
            {t('exportCompliance:description', {
              defaultValue:
                'Pick a mode. No default is pre-selected — you must choose explicitly before the Run button activates.',
            })}
          </DialogContentText>

          {showRfpPicker && (
            <FormControl size="small" fullWidth>
              <InputLabel id="export-rfp-label">RFP</InputLabel>
              <Select
                labelId="export-rfp-label"
                label="RFP"
                value={selectedRfpId ?? ''}
                onChange={(e) => setSelectedRfpId(String(e.target.value))}
              >
                {rfps.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.title}{r.kind === 'xlsx-questionnaire' ? ' (XLSX)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl>
            <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
              <FormControlLabel
                value="fresh"
                control={<Radio />}
                sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: '6px' } }}
                label={
                  <Stack>
                    <Typography variant="body2" fontWeight={600}>
                      {t('exportCompliance:modeFresh', { defaultValue: 'Fresh deliverable' })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('exportCompliance:modeFreshDesc', {
                        defaultValue:
                          'Build a new spec + compliance matrix from the committed rows. Today\'s default behaviour.',
                      })}
                    </Typography>
                  </Stack>
                }
              />
              {(exportKind === 'docx-fillback' || exportKind === null) && (
                <>
                  <FormControlLabel
                    value="fillback-annotate"
                    control={<Radio />}
                    sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: '6px' } }}
                    label={
                      <Stack>
                        <Typography variant="body2" fontWeight={600}>
                          {t('exportCompliance:modeAnnotate', {
                            defaultValue: 'Fill-back · annotate (Word comments)',
                          })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('exportCompliance:modeAnnotateDesc', {
                            defaultValue:
                              'Inject each committed response as a Word comment at the matched clause. Source RFP DOCX is left untouched.',
                          })}
                        </Typography>
                      </Stack>
                    }
                  />
                  <FormControlLabel
                    value="fillback-replace"
                    control={<Radio />}
                    sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: '6px' } }}
                    label={
                      <Stack>
                        <Typography variant="body2" fontWeight={600}>
                          {t('exportCompliance:modeReplace', {
                            defaultValue: 'Fill-back · replace (inline paragraph)',
                          })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('exportCompliance:modeReplaceDesc', {
                            defaultValue:
                              'Insert each committed response as a styled "Response" paragraph after the matched clause.',
                          })}
                        </Typography>
                      </Stack>
                    }
                  />
                </>
              )}
              {exportKind === 'xlsx-fill' && (
                <FormControlLabel
                  value="fillback-xlsx"
                  control={<Radio />}
                  sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: '6px' } }}
                  label={
                    <Stack>
                      <Typography variant="body2" fontWeight={600}>
                        {t('exportCompliance:modeXlsx', {
                          defaultValue: 'Fill-back · questionnaire (XLSX answer column)',
                        })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t('exportCompliance:modeXlsxDesc', {
                          defaultValue:
                            'Open the questionnaire workbook, write each committed response into the "Response" column at the matched row, and save a copy under out/fill-back/.',
                        })}
                      </Typography>
                    </Stack>
                  }
                />
              )}
            </RadioGroup>
          </FormControl>

          {needsDocxPicker && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Source RFP (.docx)
              </Typography>
              <Autocomplete
                value={selectedSource}
                onChange={(_, v) => setSelectedSource(v)}
                options={sourceDocs}
                loading={loadingDocs}
                size="small"
                sx={{ mt: 0.5 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={t('exportCompliance:pickSource', {
                      defaultValue: 'Pick a .docx file from the project',
                    })}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingDocs ? <CircularProgress size={14} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {t('exportCompliance:sourceHelp', {
                  defaultValue:
                    'Output goes to out/fill-back/<source>.responded.docx — the original under documents/ is never overwritten.',
                })}
              </Typography>
            </Box>
          )}

          {mode === 'fillback-xlsx' && selectedRfp?.exportTarget?.templatePath && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Template workbook
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                {selectedRfp.exportTarget.templatePath}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {t('exportCompliance:xlsxHelp', {
                  defaultValue:
                    'Output goes to out/fill-back/<rfp-id>.responded.xlsx — the original under inbox/ is never overwritten.',
                })}
              </Typography>
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {result && result.kind === 'fresh' && (
            <Alert severity="success">{result.message}</Alert>
          )}

          {result && (result.kind === 'annotate' || result.kind === 'replace' || result.kind === 'xlsx') && (
            <Stack spacing={1}>
              <Alert severity="success">
                {result.message}{' '}
                <Box component="span" sx={{ fontFamily: 'monospace', ml: 0.5 }}>
                  {result.outputPath}
                </Box>
              </Alert>
              {Array.isArray(result.filled) && result.filled.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Filled ({result.filled.length})
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {result.filled.map((entry) => (
                      <Chip
                        key={entry.requirementId}
                        size="small"
                        label={`${entry.requirementId} · ${entry.locator}`}
                        icon={<ArticleIcon fontSize="inherit" />}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {Array.isArray(result.unfilled) && result.unfilled.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Unfilled ({result.unfilled.length})
                  </Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {result.unfilled.map((entry, idx) => (
                      <Typography
                        key={`${entry.requirementId}-${idx}`}
                        variant="caption"
                        color="text.secondary"
                      >
                        <Box component="span" sx={{ fontFamily: 'monospace', mr: 0.5 }}>
                          {entry.requirementId}
                        </Box>
                        — {entry.reason}
                        {entry.locator ? (
                          <Box component="span" sx={{ fontFamily: 'monospace', ml: 0.5, color: 'text.disabled' }}>
                            ({entry.locator})
                          </Box>
                        ) : null}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          {result ? t('common:close', { defaultValue: 'Close' }) : t('common:cancel', { defaultValue: 'Cancel' })}
        </Button>
        {!result && (
          <Button
            onClick={handleRun}
            disabled={!canRun}
            variant="contained"
            startIcon={busy ? <CircularProgress size={14} /> : <FileDownloadIcon fontSize="small" />}
          >
            {busy
              ? t('exportCompliance:running', { defaultValue: 'Running…' })
              : t('exportCompliance:run', { defaultValue: 'Run' })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
