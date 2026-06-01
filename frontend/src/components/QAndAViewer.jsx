import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  TextField,
  Paper,
  Collapse,
  Divider,
  Alert,
  Chip,
  IconButton,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { HiOutlineHandRaised } from 'react-icons/hi2';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { useClaudeEvent } from '../useClaudeEvent';

function renderMarkdown(md) {
  if (!md) return '';
  return DOMPurify.sanitize(marked.parse(String(md), { breaks: true, gfm: true }));
}

// Extract the trainee's username from a path like
//   questions-and-answers/alice.q-and-a.json
// or (legacy / nested) <user>/questions-and-answers/<user>.q-and-a.json
function extractTargetUsername(filename) {
  if (!filename) return null;
  const base = filename.split('/').pop() || '';
  const m = base.match(/^(.+)\.q-and-a\.json$/);
  return m ? m[1] : null;
}

/**
 * Expert previewer for `.q-and-a.json`. Shows open questions at the top with
 * an answer textarea + Save. Answered (not yet acknowledged) entries follow,
 * and acknowledged entries are collapsed at the bottom.
 */
export default function QAndAViewer({ filename, projectName }) {
  const { t } = useTranslation(['askExpert', 'common']);
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const { user } = useAuth();

  const targetUsername = useMemo(() => extractTargetUsername(filename), [filename]);
  // Guests can only ever read their own file via the trainee endpoint.
  // Experts / admins use the expert endpoint and get the editing UI.
  const isGuestSelfView =
    user?.role === 'guest' && targetUsername && user?.username === targetUsername;
  const canEditAnswers = user?.role === 'user' || user?.role === 'admin';

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({}); // entryId -> in-progress answer text
  const [savingId, setSavingId] = useState(null);
  const [ackingId, setAckingId] = useState(null);
  const [showAcked, setShowAcked] = useState(false);

  const load = useCallback(async () => {
    if (!projectName || !targetUsername) {
      setError(t('askExpert:invalidPath', 'Invalid q-and-a file path.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = isGuestSelfView
        ? `/api/q-and-a/${encodeURIComponent(projectName)}?v=${Date.now()}`
        : `/api/q-and-a/${encodeURIComponent(projectName)}/expert/${encodeURIComponent(targetUsername)}?v=${Date.now()}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
      const data = await res.json();
      const next = Array.isArray(data?.entries) ? data.entries : [];
      setEntries(next);
      // Pre-populate drafts so the textarea keeps in-progress edits across reloads.
      setDrafts((prev) => {
        const merged = { ...prev };
        for (const e of next) {
          if (!(e.id in merged)) merged[e.id] = e.answer || '';
        }
        return merged;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectName, targetUsername, isGuestSelfView, t]);

  useEffect(() => {
    load();
  }, [load]);

  useClaudeEvent(
    ClaudeEvents.ASK_EXPERT_UPDATED,
    (data) => {
      if (data?.projectName && projectName && data.projectName !== projectName) return;
      load();
    },
    [projectName, load],
  );

  const saveAnswer = async (entryId) => {
    const text = (drafts[entryId] ?? '').trim();
    if (!text) {
      setError(t('askExpert:answerRequired', 'Answer cannot be empty.'));
      return;
    }
    setSavingId(entryId);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/q-and-a/${encodeURIComponent(projectName)}/expert/${encodeURIComponent(targetUsername)}/${encodeURIComponent(entryId)}/answer`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer: text }),
        },
      );
      if (!res.ok) throw new Error(`Save failed: ${res.statusText}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const acknowledgeEntry = async (entryId) => {
    setAckingId(entryId);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/q-and-a/${encodeURIComponent(projectName)}/acknowledge/${encodeURIComponent(entryId)}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(`Acknowledge failed: ${res.statusText}`);
      claudeEventBus.publish(ClaudeEvents.ASK_EXPERT_UPDATED, { projectName });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAckingId(null);
    }
  };

  const open = entries.filter((e) => e.answer == null);
  const answeredOpen = entries.filter((e) => e.answer != null && !e.acknowledged);
  const acknowledged = entries.filter((e) => e.answer != null && e.acknowledged);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('common:loading', 'Loading…')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto', bgcolor: isDark ? '#121212' : '#fafafa' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <HiOutlineHandRaised size={22} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {t('askExpert:viewerTitle', 'Q&A from {{user}}', { user: targetUsername || '—' })}
        </Typography>
        <Chip
          size="small"
          color={open.length > 0 ? 'error' : 'default'}
          label={t('askExpert:openCount', '{{count}} open', { count: open.length })}
          sx={{ ml: 1 }}
        />
      </Box>

      {error && (
        <Alert severity="warning" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {entries.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('askExpert:noEntries', 'No questions yet.')}
        </Typography>
      )}

      {open.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" sx={{ fontWeight: 600 }}>
            {t('askExpert:openSection', 'Open questions')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {open.map((entry) => (
              <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {new Date(entry.askedAt).toLocaleString()}
                </Typography>
                {entry.context && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {t('askExpert:contextShort', 'Context')}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        color: 'text.secondary',
                        mt: 0.5,
                        maxHeight: 160,
                        overflowY: 'auto',
                        bgcolor: isDark ? '#1e1e1e' : '#f5f5f5',
                        p: 1,
                        borderRadius: 1,
                      }}
                    >
                      {entry.context}
                    </Typography>
                  </Box>
                )}
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {t('askExpert:questionShort', 'Question')}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                    {entry.question}
                  </Typography>
                </Box>
                {canEditAnswers && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <TextField
                      label={t('askExpert:writeAnswer', 'Your answer (Markdown)')}
                      value={drafts[entry.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [entry.id]: e.target.value }))}
                      size="small"
                      multiline
                      minRows={4}
                      fullWidth
                      autoFocus
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => saveAnswer(entry.id)}
                        disabled={savingId === entry.id || !(drafts[entry.id] || '').trim()}
                        startIcon={savingId === entry.id ? <CircularProgress size={14} /> : null}
                      >
                        {t('askExpert:saveAnswer', 'Save answer')}
                      </Button>
                    </Box>
                  </>
                )}
                {isGuestSelfView && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mt: 1, fontStyle: 'italic' }}
                  >
                    {t('askExpert:awaitingExpert', 'Awaiting an answer from the expert.')}
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {answeredOpen.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" sx={{ fontWeight: 600 }}>
            {t('askExpert:answeredOpenSection', 'Answered, awaiting acknowledgment')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {answeredOpen.map((entry) => (
              <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {t('askExpert:askedAt', 'Asked')} {new Date(entry.askedAt).toLocaleString()} ·{' '}
                  {t('askExpert:answeredAt', 'answered')} {entry.answeredAt ? new Date(entry.answeredAt).toLocaleString() : '—'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                  <strong>{t('askExpert:questionShort', 'Question')}:</strong> {entry.question}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {t('askExpert:answerShort', 'Answer')}
                </Typography>
                <Box
                  sx={{ mt: 0.5, '& p': { my: 0.5 } }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer) }}
                />
                {canEditAnswers && (
                  <>
                    <TextField
                      label={t('askExpert:editAnswer', 'Edit answer')}
                      value={drafts[entry.id] ?? entry.answer ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [entry.id]: e.target.value }))}
                      size="small"
                      multiline
                      minRows={3}
                      fullWidth
                      sx={{ mt: 1 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                      <Button
                        size="small"
                        onClick={() => saveAnswer(entry.id)}
                        disabled={savingId === entry.id}
                      >
                        {t('askExpert:updateAnswer', 'Update answer')}
                      </Button>
                    </Box>
                  </>
                )}
                {isGuestSelfView && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => acknowledgeEntry(entry.id)}
                      disabled={ackingId === entry.id}
                      startIcon={ackingId === entry.id ? <CircularProgress size={14} /> : null}
                    >
                      {t('askExpert:acknowledge', 'Acknowledge')}
                    </Button>
                  </Box>
                )}
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {acknowledged.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={() => setShowAcked((v) => !v)}>
              {showAcked ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
            <Typography variant="overline" sx={{ fontWeight: 600 }}>
              {t('askExpert:acknowledgedSection', 'Acknowledged')} ({acknowledged.length})
            </Typography>
          </Box>
          <Collapse in={showAcked}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {acknowledged.map((entry) => (
                <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, opacity: 0.8 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {new Date(entry.askedAt).toLocaleString()}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                    <strong>Q:</strong> {entry.question}
                  </Typography>
                  <Box
                    sx={{ mt: 0.5, '& p': { my: 0.25 } }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer) }}
                  />
                </Paper>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}
