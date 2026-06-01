import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  TextField,
  Paper,
  Collapse,
  Divider,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  KeyboardArrowUp,
  KeyboardArrowDown,
  DeleteOutline,
  EditOutlined,
  Save,
  Close,
  Add,
  PictureAsPdf,
} from '@mui/icons-material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { RiSketching } from 'react-icons/ri';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { useClaudeEvent } from '../useClaudeEvent';

const EMPTY_CHEATSHEET = { groups: [] };

function normalizeCheatsheet(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) return { groups: [] };
  return {
    groups: raw.groups
      .filter((g) => g && typeof g === 'object')
      .map((g) => ({
        name: typeof g.name === 'string' ? g.name : '',
        items: Array.isArray(g.items)
          ? g.items
              .filter((i) => i && typeof i === 'object')
              .map((i) => ({
                title: typeof i.title === 'string' ? i.title : '',
                content: typeof i.content === 'string' ? i.content : '',
              }))
          : [],
      })),
  };
}

function reorder(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function serializeToMarkdown(cheatsheet) {
  const lines = [];
  for (const group of cheatsheet.groups) {
    lines.push(`# ${group.name || '(untitled group)'}`);
    lines.push('');
    for (const item of group.items) {
      lines.push(`## ${item.title || '(untitled)'}`);
      lines.push('');
      lines.push(item.content || '');
      lines.push('');
    }
  }
  return lines.join('\n');
}

export default function CheatsheetViewer({ filename, projectName }) {
  const { t } = useTranslation(['cheatsheet', 'common']);
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';

  const [cheatsheet, setCheatsheet] = useState(EMPTY_CHEATSHEET);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [editingItem, setEditingItem] = useState(null); // { groupIdx, itemIdx, title, content }
  const [editingGroupName, setEditingGroupName] = useState(null); // { groupIdx, name }
  const [exporting, setExporting] = useState(false);

  const saveSeqRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/cheatsheet/${encodeURIComponent(projectName)}?v=${Date.now()}`);
      if (!res.ok) {
        throw new Error(`Failed to load cheatsheet: ${res.statusText}`);
      }
      const data = await res.json();
      setCheatsheet(normalizeCheatsheet(data?.cheatsheet));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    load();
  }, [load]);

  useClaudeEvent(
    ClaudeEvents.CHEATSHEET_UPDATED,
    (data) => {
      if (data?.projectName === projectName) load();
    },
    [projectName, load],
  );

  const persist = useCallback(
    async (next) => {
      const mySeq = ++saveSeqRef.current;
      setSaving(true);
      try {
        const res = await apiFetch(`/api/cheatsheet/${encodeURIComponent(projectName)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cheatsheet: next }),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.statusText}`);
        if (mySeq === saveSeqRef.current) {
          claudeEventBus.publish(ClaudeEvents.CHEATSHEET_UPDATED, { projectName });
        }
      } catch (e) {
        setError(e.message);
      } finally {
        if (mySeq === saveSeqRef.current) setSaving(false);
      }
    },
    [projectName],
  );

  const update = useCallback(
    (nextOrFn) => {
      setCheatsheet((prev) => {
        const next = typeof nextOrFn === 'function' ? nextOrFn(prev) : nextOrFn;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const toggleGroup = (idx) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const addGroup = () => {
    const name = window.prompt(t('cheatsheet:newGroupPrompt', 'Group name?'));
    if (!name) return;
    update((cur) => ({ groups: [...cur.groups, { name: name.trim(), items: [] }] }));
  };

  const renameGroup = (groupIdx, name) => {
    update((cur) => ({
      groups: cur.groups.map((g, i) => (i === groupIdx ? { ...g, name } : g)),
    }));
  };

  const deleteGroup = (groupIdx) => {
    if (!window.confirm(t('cheatsheet:confirmDeleteGroup', 'Delete this group and all its items?'))) return;
    update((cur) => ({ groups: cur.groups.filter((_, i) => i !== groupIdx) }));
  };

  const moveGroup = (groupIdx, dir) => {
    update((cur) => ({ groups: reorder(cur.groups, groupIdx, groupIdx + dir) }));
  };

  const addItem = (groupIdx) => {
    update((cur) => ({
      groups: cur.groups.map((g, i) =>
        i === groupIdx ? { ...g, items: [...g.items, { title: t('cheatsheet:newItemTitle', 'New item'), content: '' }] } : g,
      ),
    }));
    setEditingItem({ groupIdx, itemIdx: cheatsheet.groups[groupIdx]?.items.length ?? 0, title: t('cheatsheet:newItemTitle', 'New item'), content: '' });
  };

  const saveItemEdit = () => {
    if (!editingItem) return;
    const { groupIdx, itemIdx, title, content } = editingItem;
    update((cur) => ({
      groups: cur.groups.map((g, gi) =>
        gi !== groupIdx
          ? g
          : {
              ...g,
              items: g.items.map((it, ii) => (ii === itemIdx ? { title, content } : it)),
            },
      ),
    }));
    setEditingItem(null);
  };

  const deleteItem = (groupIdx, itemIdx) => {
    if (!window.confirm(t('cheatsheet:confirmDeleteItem', 'Delete this item?'))) return;
    update((cur) => ({
      groups: cur.groups.map((g, i) =>
        i === groupIdx ? { ...g, items: g.items.filter((_, ii) => ii !== itemIdx) } : g,
      ),
    }));
  };

  const moveItem = (groupIdx, itemIdx, dir) => {
    update((cur) => ({
      groups: cur.groups.map((g, i) =>
        i === groupIdx ? { ...g, items: reorder(g.items, itemIdx, itemIdx + dir) } : g,
      ),
    }));
  };

  const renderMarkdown = useMemo(
    () => (md) => {
      const html = marked.parse(md || '', { breaks: true, gfm: true });
      return DOMPurify.sanitize(html);
    },
    [],
  );

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const markdown = serializeToMarkdown(cheatsheet);
      const baseName = (filename.split('/').pop() || 'cheatsheet').replace(/\.cheatsheet\.json$/i, '') || 'cheatsheet';
      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/download-pdf`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: markdown, filename: baseName }),
        },
      );
      if (!res.ok) throw new Error(`PDF export failed: ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <RiSketching size={18} />
          {t('cheatsheet:title', 'Cheat Sheet')}
          {saving && (
            <Typography component="span" sx={{ ml: 1, fontSize: '0.75rem', color: 'text.secondary' }}>
              {t('cheatsheet:saving', 'saving…')}
            </Typography>
          )}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<Add />} onClick={addGroup}>
            {t('cheatsheet:addGroup', 'Add group')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={14} /> : <PictureAsPdf />}
            onClick={handleExportPdf}
            disabled={exporting || cheatsheet.groups.length === 0}
          >
            {t('cheatsheet:saveAsPdf', 'Save as PDF')}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 1 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {cheatsheet.groups.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mt: 4 }}>
            {t('cheatsheet:empty', 'No notes yet. Add one from a chat message via "Add to cheat sheet", or click "Add group" above.')}
          </Typography>
        )}

        {cheatsheet.groups.map((group, gi) => {
          const collapsed = collapsedGroups.has(gi);
          const isRenaming = editingGroupName?.groupIdx === gi;
          return (
            <Paper
              key={gi}
              elevation={0}
              sx={{
                mb: 2,
                border: 1,
                borderColor: 'divider',
                bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  borderBottom: collapsed ? 0 : 1,
                  borderColor: 'divider',
                }}
              >
                <IconButton size="small" onClick={() => toggleGroup(gi)}>
                  {collapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
                </IconButton>
                {isRenaming ? (
                  <>
                    <TextField
                      value={editingGroupName.name}
                      onChange={(e) => setEditingGroupName({ groupIdx: gi, name: e.target.value })}
                      size="small"
                      autoFocus
                      sx={{ flex: 1 }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => {
                        renameGroup(gi, editingGroupName.name.trim());
                        setEditingGroupName(null);
                      }}
                    >
                      <Save fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setEditingGroupName(null)}>
                      <Close fontSize="small" />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography sx={{ flex: 1, fontWeight: 600 }}>{group.name || '(untitled group)'}</Typography>
                    <Tooltip title={t('cheatsheet:moveUp', 'Move up')}>
                      <span>
                        <IconButton size="small" onClick={() => moveGroup(gi, -1)} disabled={gi === 0}>
                          <KeyboardArrowUp fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('cheatsheet:moveDown', 'Move down')}>
                      <span>
                        <IconButton size="small" onClick={() => moveGroup(gi, 1)} disabled={gi === cheatsheet.groups.length - 1}>
                          <KeyboardArrowDown fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('cheatsheet:renameGroup', 'Rename group')}>
                      <IconButton size="small" onClick={() => setEditingGroupName({ groupIdx: gi, name: group.name })}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('cheatsheet:addItem', 'Add item')}>
                      <IconButton size="small" onClick={() => addItem(gi)}>
                        <Add fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('cheatsheet:deleteGroup', 'Delete group')}>
                      <IconButton size="small" onClick={() => deleteGroup(gi)}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Box>

              <Collapse in={!collapsed}>
                <Box sx={{ p: 1 }}>
                  {group.items.length === 0 && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', px: 1, py: 1 }}>
                      {t('cheatsheet:groupEmpty', 'No items in this group.')}
                    </Typography>
                  )}
                  {group.items.map((item, ii) => {
                    const isEditing = editingItem?.groupIdx === gi && editingItem?.itemIdx === ii;
                    return (
                      <Box
                        key={ii}
                        sx={{
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          p: 1,
                          mb: 1,
                          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                        }}
                      >
                        {isEditing ? (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <TextField
                              label={t('cheatsheet:itemTitleLabel', 'Title')}
                              value={editingItem.title}
                              onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                              size="small"
                              fullWidth
                            />
                            <TextField
                              label={t('cheatsheet:itemContentLabel', 'Content (Markdown)')}
                              value={editingItem.content}
                              onChange={(e) => setEditingItem({ ...editingItem, content: e.target.value })}
                              size="small"
                              multiline
                              minRows={4}
                              fullWidth
                            />
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                              <Button size="small" onClick={() => setEditingItem(null)}>
                                {t('common:cancel', 'Cancel')}
                              </Button>
                              <Button size="small" variant="contained" onClick={saveItemEdit}>
                                {t('common:save', 'Save')}
                              </Button>
                            </Box>
                          </Box>
                        ) : (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                              <Typography
                                sx={{
                                  flex: 1,
                                  fontWeight: 600,
                                  fontSize: '0.95rem',
                                  color: isDark ? '#7ec7ff' : '#1976d2',
                                }}
                              >
                                {item.title || '(untitled)'}
                              </Typography>
                              <IconButton size="small" onClick={() => moveItem(gi, ii, -1)} disabled={ii === 0}>
                                <KeyboardArrowUp fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => moveItem(gi, ii, 1)}
                                disabled={ii === group.items.length - 1}
                              >
                                <KeyboardArrowDown fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() =>
                                  setEditingItem({ groupIdx: gi, itemIdx: ii, title: item.title, content: item.content })
                                }
                              >
                                <EditOutlined fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={() => deleteItem(gi, ii)}>
                                <DeleteOutline fontSize="small" />
                              </IconButton>
                            </Box>
                            <Divider sx={{ mb: 1 }} />
                            <Box
                              sx={{
                                fontSize: '0.875rem',
                                '& p': { my: 0.5 },
                                '& pre': { fontSize: '0.8rem', overflowX: 'auto' },
                                '& code': { fontSize: '0.8rem' },
                              }}
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }}
                            />
                          </>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Collapse>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
