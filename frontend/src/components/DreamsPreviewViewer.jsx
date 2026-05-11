import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Paper, IconButton, Button, Stack, Chip, Alert, CircularProgress, Tooltip } from '@mui/material';
import { ThumbUpAlt, ThumbDownAlt } from '@mui/icons-material';
import { TbShovel } from 'react-icons/tb';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

/**
 * Renders a .dreams.json file as a feedback questionnaire.
 * Each item gets three buttons: thumbs-up (good), thumbs-down (bad), shovel (deepen).
 * Submit posts the verdicts to /api/dreaming/:project/dreams/:fileName/feedback.
 */
export default function DreamsPreviewViewer({ filename, projectName }) {
  const { t } = useTranslation(['dreaming', 'common']);
  const [dream, setDream] = useState(null);
  const [verdicts, setVerdicts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const dreamFileName = useMemo(() => {
    if (!filename) return null;
    const parts = String(filename).split(/[\\/]/);
    return parts[parts.length - 1];
  }, [filename]);

  useEffect(() => {
    if (!projectName || !dreamFileName) return;
    setLoading(true);
    setError(null);
    apiFetch(`/api/dreaming/${encodeURIComponent(projectName)}/dreams/${encodeURIComponent(dreamFileName)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        setDream(data);
        const initial = {};
        for (const item of data.items || []) {
          if (item.dismissedByUser && item.status) {
            const back = { active: 'good', deprecated: 'bad', investigating: 'deepen' };
            initial[item.id] = back[item.status];
          }
        }
        setVerdicts(initial);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectName, dreamFileName]);

  const setVerdict = (itemId, verdict) => {
    setVerdicts((prev) => ({ ...prev, [itemId]: prev[itemId] === verdict ? undefined : verdict }));
  };

  const allItemsDecided = dream?.items?.length > 0 && dream.items.every((i) => verdicts[i.id]);

  const handleSubmit = async () => {
    if (!dream) return;
    setSubmitting(true);
    setError(null);
    const feedback = dream.items
      .filter((i) => verdicts[i.id])
      .map((i) => ({ itemId: i.id, verdict: verdicts[i.id] }));
    try {
      const res = await apiFetch(
        `/api/dreaming/${encodeURIComponent(projectName)}/dreams/${encodeURIComponent(dreamFileName)}/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDream(data.dream);
      setSubmitted(true);
      window.dispatchEvent(new CustomEvent('quick-actions:changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const generatedAtLocal = useMemo(() => {
    if (!dream?.generatedAt) return '';
    const d = new Date(dream.generatedAt);
    return Number.isNaN(d.getTime()) ? dream.generatedAt : d.toLocaleString();
  }, [dream?.generatedAt]);

  if (loading) {
    return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;
  }
  if (!dream) return null;

  return (
    <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ mb: 1 }}>
            {t('dreaming:previewTitle', 'Tonight’s dreams')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {t('dreaming:previewSubtitle', 'Run {{runId}} — generated {{ts}}', { runId: dream.runId, ts: generatedAtLocal })}
          </Typography>
        </Box>
        <Box sx={{ width: 200, flexShrink: 0 }}>
          <img src="/dreaming.png" alt="Dreaming" style={{ width: 200, height: 'auto', display: 'block' }} />
        </Box>
      </Box>

      {submitted && <Alert severity="success" sx={{ mb: 2 }}>{t('dreaming:feedbackSaved', 'Feedback recorded for the next run.')}</Alert>}

      {(dream.items || []).length === 0 && (
        <Alert severity="info">{t('dreaming:noItems', 'This dream produced no items.')}</Alert>
      )}

      <Stack spacing={2}>
        {(dream.items || []).map((item) => {
          const v = verdicts[item.id];
          return (
            <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{item.title}</Typography>
                    <Chip size="small" label={item.domain} />
                    {item.status === 'contested' && <Chip size="small" color="warning" label="contested" />}
                    {item.dismissedByUser && <Chip size="small" color="default" label={t('dreaming:dismissed', 'reviewed')} />}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {t('dreaming:scoreLabel', 'Composite score')}: {Number(item.compositeScore).toFixed(3)}
                  </Typography>
                  <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.875rem', m: 0, color: 'text.secondary' }}>
                    {item.body}
                  </Box>
                  {Array.isArray(item.evidence) && item.evidence.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {t('dreaming:evidence', 'Evidence')}:
                      </Typography>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {item.evidence.map((e, i) => (
                          <li key={i} style={{ fontSize: '0.8rem' }}>{e}</li>
                        ))}
                      </ul>
                    </Box>
                  )}
                </Box>

                <Stack direction="column" spacing={1} sx={{ flexShrink: 0 }}>
                  <Tooltip title={t('dreaming:verdictGood', 'Keep — strategy looks useful')}>
                    <IconButton
                      size="small"
                      color={v === 'good' ? 'success' : 'default'}
                      onClick={() => setVerdict(item.id, 'good')}
                    >
                      <ThumbUpAlt fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('dreaming:verdictBad', 'Reject — discard this strategy')}>
                    <IconButton
                      size="small"
                      color={v === 'bad' ? 'error' : 'default'}
                      onClick={() => setVerdict(item.id, 'bad')}
                    >
                      <ThumbDownAlt fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('dreaming:verdictDeepen', 'Investigate further on next run')}>
                    <IconButton
                      size="small"
                      color={v === 'deepen' ? 'primary' : 'default'}
                      onClick={() => setVerdict(item.id, 'deepen')}
                    >
                      <TbShovel size={18} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            </Paper>
          );
        })}
      </Stack>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !allItemsDecided}
        >
          {submitting ? t('common:submitting', 'Submitting...') : t('dreaming:submit', 'Submit feedback')}
        </Button>
      </Box>
    </Box>
  );
}
