import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  Typography,
  Divider,
  Paper,
} from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { HiOutlineHandRaised } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { apiFetch } from '../services/api';
import { claudeEventBus, ClaudeEvents } from '../eventBus';

function renderMarkdown(md) {
  if (!md) return '';
  const html = marked.parse(String(md), { breaks: true, gfm: true });
  return DOMPurify.sanitize(html);
}

/**
 * Trainee modal: when there are unacknowledged answers, lands on a two-choice screen
 * (View answers / Ask question). Otherwise opens directly on the ask form pre-filled
 * with the chat-bubble text as editable Context.
 */
export default function AskExpert({ open, onClose, bubbleText, projectName }) {
  const { t } = useTranslation(['askExpert', 'common']);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [entries, setEntries] = useState([]);

  // 'landing' | 'ask' | 'view'
  const [mode, setMode] = useState('ask');
  const [context, setContext] = useState('');
  const [question, setQuestion] = useState('');

  const unackedAnswers = useMemo(
    () => entries.filter((e) => e.answer != null && !e.acknowledged),
    [entries],
  );

  const reload = useCallback(async () => {
    if (!projectName) return [];
    const res = await apiFetch(`/api/q-and-a/${encodeURIComponent(projectName)}?v=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
    const data = await res.json();
    const next = Array.isArray(data?.entries) ? data.entries : [];
    setEntries(next);
    return next;
  }, [projectName]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContext(bubbleText || '');
    setQuestion('');

    reload()
      .then((next) => {
        if (cancelled) return;
        const unacked = next.filter((e) => e.answer != null && !e.acknowledged);
        // If trainee was invoked from a chat bubble (bubbleText present), go straight to ask.
        // Otherwise, if there are unacked answers, show landing.
        if (bubbleText) {
          setMode('ask');
        } else if (unacked.length > 0) {
          setMode('landing');
        } else {
          setMode('ask');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, bubbleText, projectName, reload]);

  const handleSubmit = async () => {
    const q = question.trim();
    if (!q) {
      setError(t('askExpert:questionRequired', 'Please type a question.'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/q-and-a/${encodeURIComponent(projectName)}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, question: q }),
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.statusText}`);
      claudeEventBus.publish(ClaudeEvents.ASK_EXPERT_UPDATED, { projectName });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (entryId) => {
    try {
      const res = await apiFetch(
        `/api/q-and-a/${encodeURIComponent(projectName)}/acknowledge/${encodeURIComponent(entryId)}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(`Acknowledge failed: ${res.statusText}`);
      const next = await reload();
      claudeEventBus.publish(ClaudeEvents.ASK_EXPERT_UPDATED, { projectName });
      const remaining = next.filter((e) => e.answer != null && !e.acknowledged);
      if (remaining.length === 0) {
        // No more answers to view; either land back on ask or close.
        setMode('ask');
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const title = (() => {
    if (mode === 'landing') return t('askExpert:modalTitle', 'Ask the expert');
    if (mode === 'view') return t('askExpert:viewTitle', 'Answers from the expert');
    return t('askExpert:askTitle', 'Ask the expert a question');
  })();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1, gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HiOutlineHandRaised size={20} />
          <Typography component="span" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label={t('common:close', 'Close')}>
          <IoClose />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('common:loading', 'Loading…')}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && (
              <Alert severity="warning" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {mode === 'landing' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('askExpert:landingPrompt', 'What would you like to do?')}
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => setMode('view')}
                >
                  {t('askExpert:viewAnswersWithCount', { count: unackedAnswers.length, defaultValue: 'View answer(s) ({{count}})' })}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => setMode('ask')}
                >
                  {t('askExpert:askQuestion', 'Ask a question to the expert')}
                </Button>
              </Box>
            )}

            {mode === 'ask' && (
              <>
                <TextField
                  label={t('askExpert:contextLabel', 'Context (from the agent reply — edit as needed)')}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  size="small"
                  multiline
                  minRows={6}
                  fullWidth
                />
                <TextField
                  label={t('askExpert:questionLabel', 'Your question for the expert')}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  size="small"
                  multiline
                  minRows={3}
                  fullWidth
                  autoFocus
                />
              </>
            )}

            {mode === 'view' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {unackedAnswers.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('askExpert:noAnswerYet', 'No new answers right now.')}
                  </Typography>
                ) : (
                  unackedAnswers.map((entry) => (
                    <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t('askExpert:askedAt', 'Asked')} {new Date(entry.askedAt).toLocaleString()} ·{' '}
                        {t('askExpert:answeredAt', 'answered')} {entry.answeredAt ? new Date(entry.answeredAt).toLocaleString() : '—'}
                      </Typography>
                      {entry.context && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {t('askExpert:contextShort', 'Context')}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary', maxHeight: 120, overflowY: 'auto', mt: 0.5 }}
                          >
                            {entry.context}
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {t('askExpert:questionShort', 'Your question')}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                          {entry.question}
                        </Typography>
                      </Box>
                      <Divider sx={{ my: 1.5 }} />
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {t('askExpert:answerShort', 'Expert answer')}
                      </Typography>
                      <Box
                        sx={{ mt: 0.5, '& p': { my: 0.5 }, '& pre': { whiteSpace: 'pre-wrap' } }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer) }}
                      />
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                        <Button size="small" variant="contained" onClick={() => handleAcknowledge(entry.id)}>
                          {t('askExpert:acknowledge', 'Acknowledge')}
                        </Button>
                      </Box>
                    </Paper>
                  ))
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {mode === 'view' && (
          <Button onClick={() => setMode('ask')}>
            {t('askExpert:askAnother', 'Ask another question')}
          </Button>
        )}
        <Button onClick={onClose}>{t('common:close', 'Close')}</Button>
        {mode === 'ask' && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={loading || submitting || !question.trim()}
            startIcon={submitting ? <CircularProgress size={14} /> : null}
          >
            {t('askExpert:submit', 'Send to expert')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
