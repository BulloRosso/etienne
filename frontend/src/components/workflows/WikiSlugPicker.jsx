import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
  TextField,
  Stack,
  Typography,
} from '@mui/material';
import { apiFetch } from '../../services/api';
import { slugify } from './workflowTemplates';

/**
 * Picker that resolves to a wiki page slug. Two modes:
 *   - link: pick an existing wiki/topics/<slug>.md page (autocomplete)
 *   - create: enter title + body for a new page (slug derived from title)
 *
 * Calls `onChange({ mode, slug, title, body })` whenever the selection changes.
 * `value` is the controlled selection (same shape).
 */
export default function WikiSlugPicker({
  projectName,
  value,
  onChange,
  label = 'Wiki page',
  required = false,
}) {
  const [pages, setPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);

  useEffect(() => {
    if (!projectName) return;
    setLoadingPages(true);
    apiFetch(`/api/wiki/${encodeURIComponent(projectName)}/pages?bucket=topics`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPages(Array.isArray(data) ? data : []))
      .catch(() => setPages([]))
      .finally(() => setLoadingPages(false));
  }, [projectName]);

  const mode = value?.mode || 'link';
  const setMode = (next) => {
    if (!next) return;
    onChange({ mode: next, slug: '', title: '', body: '' });
  };

  const selectedSummary = useMemo(() => {
    if (mode !== 'link' || !value?.slug) return null;
    return pages.find((p) => p.slug === value.slug) || { slug: value.slug, title: value.slug };
  }, [mode, value, pages]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
          {label}{required && ' *'}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v) => setMode(v)}
        >
          <ToggleButton value="link" sx={{ py: 0.25, px: 1, textTransform: 'none' }}>Link existing</ToggleButton>
          <ToggleButton value="create" sx={{ py: 0.25, px: 1, textTransform: 'none' }}>Create new</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {mode === 'link' ? (
        <Autocomplete
          size="small"
          options={pages}
          loading={loadingPages}
          value={selectedSummary}
          onChange={(_, opt) => {
            onChange({ mode: 'link', slug: opt?.slug || '', title: opt?.title || '', body: '' });
          }}
          getOptionLabel={(opt) => opt?.title || opt?.slug || ''}
          isOptionEqualToValue={(a, b) => a?.slug === b?.slug}
          renderInput={(params) => (
            <TextField {...params} placeholder="Search wiki pages..." />
          )}
        />
      ) : (
        <Stack spacing={1}>
          <TextField
            size="small"
            label="Title"
            value={value?.title || ''}
            onChange={(e) => {
              const title = e.target.value;
              onChange({
                mode: 'create',
                slug: slugify(title),
                title,
                body: value?.body || '',
              });
            }}
            placeholder="Title of the new wiki page"
          />
          <TextField
            size="small"
            label="Body (markdown)"
            value={value?.body || ''}
            onChange={(e) => onChange({ ...value, mode: 'create', body: e.target.value })}
            multiline
            minRows={4}
            placeholder="Content of the new wiki page..."
          />
          {value?.slug && (
            <Typography variant="caption" color="text.secondary">
              Slug: <code>{value.slug}</code> → <code>wiki/topics/{value.slug}.md</code>
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
}

/**
 * If the picker value indicates 'create', POST the new wiki page and return
 * the resulting slug. If 'link', returns the existing slug. Returns null if
 * the picker is empty.
 */
export async function commitWikiSlugPick(projectName, pick) {
  if (!pick) return null;
  if (pick.mode === 'link') {
    return pick.slug || null;
  }
  if (pick.mode === 'create') {
    if (!pick.title || !pick.slug) return null;
    const now = new Date().toISOString();
    const res = await apiFetch(`/api/wiki/${encodeURIComponent(projectName)}/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: pick.title,
        slug: pick.slug,
        bucket: 'topics',
        body: pick.body || '',
        sources: [{ kind: 'conversation', turn: 'workflow-modal' }],
        classification: 'private',
        provenance: {
          sourceSessions: [],
          sourceEntries: [],
          createdBy: 'user',
          createdAt: now,
          updatedAt: now,
        },
        mode: 'create',
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => `${res.status}`);
      throw new Error(`Failed to create wiki page: ${msg}`);
    }
    const data = await res.json();
    return data.slug;
  }
  return null;
}
