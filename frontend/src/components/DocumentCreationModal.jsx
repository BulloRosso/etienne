/**
 * DocumentCreationModal.jsx
 *
 * Launched from the filesystem context menu on a project's `source/` folder
 * ("Create document from sections…").
 *
 * Three tabs:
 *   1. Mappings   — pick a source doc, see its sections (left), map them onto
 *                   the target template sections (right), one row per target
 *                   section with a source-section dropdown + free-text
 *                   transformation note + language chip.
 *   2. Freestyle  — informational; the user drives the agent via chat.
 *   3. Preview    — rendered instruction markdown + last generated docx path.
 *
 * State persists to `source-target.sectionmappings.json` at the project root.
 * "Create document now" writes the instructions file and asks the agent (via
 * the viewer-auto-prompt bus) to run the document-creation skill.
 *
 * Sections are extracted via the `extract_document_sections` MCP tool
 * (group `document-analysis`); template headings via `extract_document_headings`
 * (group `requirements-matcher`).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiFetch, apiAxios } from '../services/api';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  mergeMappings,
  buildMappingFile,
  statusMap,
  coverageCounts,
  targetKeyOf,
} from './documentCreationMapping';

const STATUS_CHIP = {
  unmapped: { color: 'default', variant: 'outlined' },
  mapped: { color: 'info', variant: 'filled' },
  generated: { color: 'success', variant: 'filled' },
  skipped: { color: 'warning', variant: 'filled' },
  error: { color: 'error', variant: 'filled' },
  reviewed: { color: 'success', variant: 'outlined' },
};

const OUTSTANDING = new Set(['unmapped', 'mapped', 'error']);

const TARGET_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
];

const MAPPINGS_FILE = 'source-target.sectionmappings.json';
const INSTRUCTIONS_FILE = 'target/document-creation-instructions.md';
const DEFAULT_OUTPUT = 'target/generated-document.docx';

export default function DocumentCreationModal({ open, onClose, projectName }) {
  const { t } = useTranslation(['documentCreation', 'common']);
  const [activeTab, setActiveTab] = useState(0);

  // Source documents (source/*.pdf|docx) and the selected one
  const [sourceDocs, setSourceDocs] = useState([]); // [{ name, path }]
  const [selectedSourceDoc, setSelectedSourceDoc] = useState('');

  // Template (target/*.docx) — auto-picked, selectable if several
  const [templateDocs, setTemplateDocs] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const [mode, setMode] = useState('structured');
  const [targetLanguage, setTargetLanguage] = useState('en');

  // Extracted source sections + detected language
  const [sourceLanguage, setSourceLanguage] = useState(null); // { language_code, language_name }
  const [sections, setSections] = useState([]); // [{ number, title, level, image_count }]
  const [extractingSections, setExtractingSections] = useState(false);

  // Target template headings
  const [templateHeadings, setTemplateHeadings] = useState([]); // [{ number, title }]
  const [extractingHeadings, setExtractingHeadings] = useState(false);

  // Mappings keyed by target section "number||title"
  const [mappings, setMappings] = useState({}); // key -> { sourceSection, transformation }

  // Full mapping rows last seen on disk, keyed by targetKey. Used as the
  // comparison base for status display (detecting "user changed a generated
  // row" needs the source/transformation that were saved, not just status).
  const [baseByKey, setBaseByKey] = useState({}); // key -> mapping object
  const [lastRun, setLastRun] = useState(null); // { at, outputFile, filled, skipped, error }
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [previewMarkdown, setPreviewMarkdown] = useState('');
  const [lastOutput, setLastOutput] = useState('');
  const [status, setStatus] = useState(null); // { type: 'info'|'error', text }
  const [busy, setBusy] = useState(false);

  // Resizable split (left source tree / right target list)
  const [splitPct, setSplitPct] = useState(45);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef(null);

  const targetKey = (h) => targetKeyOf(h);

  // ── Load on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !projectName) return;
    setActiveTab(0);
    setSelectedSourceDoc('');
    setSections([]);
    setSourceLanguage(null);
    setMappings({});
    setBaseByKey({});
    setLastRun(null);
    setOutstandingOnly(false);
    setPreviewMarkdown('');
    setStatus(null);
    provisionSkill();
    loadDocs();
    loadExistingMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectName]);

  async function provisionSkill() {
    try {
      await apiAxios.post(
        `/api/skills/${encodeURIComponent(projectName)}/provision-template`,
        { skillName: 'document-creation' },
      );
    } catch (err) {
      // Non-fatal — the skill may already exist or provisioning may be denied.
      setStatus({
        type: 'error',
        text: t('documentCreation:status.provisionFailed', {
          message: err.response?.data?.message || err.message,
        }),
      });
    }
  }

  // Discover source/*.{pdf,docx} and target/*.docx via the filesystem tree.
  async function loadDocs() {
    try {
      const response = await apiAxios.post('/api/claude/filesystem', { projectName });
      const tree = response.data.tree || [];
      const src = [];
      const tpl = [];
      collectFolderFiles(tree, 'source', src, ['.pdf', '.docx', '.doc']);
      collectFolderFiles(tree, 'target', tpl, ['.docx']);
      setSourceDocs(src);
      setTemplateDocs(tpl);
      if (tpl.length) setSelectedTemplate(tpl[0].path);
      if (src.length) setSelectedSourceDoc(src[0].path);
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    }
  }

  function collectFolderFiles(nodes, folderName, results, exts) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (node.label === folderName && node.children) {
          walkFiles(node.children, results, exts);
        } else if (node.children) {
          collectFolderFiles(node.children, folderName, results, exts);
        }
      }
    }
  }

  function walkFiles(nodes, results, exts) {
    for (const node of nodes) {
      if (node.type === 'folder' && node.children) {
        walkFiles(node.children, results, exts);
      } else if (node.type !== 'folder') {
        const lower = (node.label || '').toLowerCase();
        if (exts.some((e) => lower.endsWith(e))) {
          results.push({ name: node.label, path: node.id });
        }
      }
    }
  }

  // Fetch the file and return the parsed object (or null). Used both on open
  // and by the manual Refresh — the fetched object is also the authoritative
  // base for the read-modify-write in `persist`.
  async function fetchMappingFile() {
    try {
      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${MAPPINGS_FILE}`,
      );
      if (!res.ok) return null;
      return JSON.parse(await res.text());
    } catch {
      return null;
    }
  }

  // Apply a fetched file object into UI + skill-display state.
  function applyMappingFile(data) {
    if (!data) return;
    if (data.targetLanguage) setTargetLanguage(data.targetLanguage);
    if (data.mode) setMode(data.mode);
    if (data.templateDocument) setSelectedTemplate(data.templateDocument);
    if (data.outputFile) setLastOutput(data.outputFile);
    setLastRun(data.lastRun || null);

    const restored = {};
    const base = {};
    for (const m of data.mappings || []) {
      if (!m.targetSection) continue;
      const key = targetKeyOf(m.targetSection);
      restored[key] = {
        sourceSection: m.source
          ? `${m.source.section}||${m.source.title || ''}`
          : '',
        transformation: m.transformation || '',
      };
      base[key] = m; // full row: status, provenance, source, transformation
    }
    setMappings(restored);
    setBaseByKey(base);
  }

  async function loadExistingMappings() {
    applyMappingFile(await fetchMappingFile());
  }

  // Manual refresh — surfaces a skill run that completed while the modal
  // was open (the skill runs async in chat after "Create document now").
  async function handleRefresh() {
    setRefreshing(true);
    try {
      applyMappingFile(await fetchMappingFile());
    } finally {
      setRefreshing(false);
    }
  }

  // ── Extract source sections when the selected source doc changes ──────────
  useEffect(() => {
    if (!open || !selectedSourceDoc) return;
    extractSections(selectedSourceDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceDoc, open]);

  async function extractSections(docPath) {
    setExtractingSections(true);
    setSections([]);
    setSourceLanguage(null);
    try {
      const mcpUrl = new URL('/mcp/document-analysis', window.location.origin);
      const transport = new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers: { Authorization: 'test123' } },
      });
      const client = new Client(
        { name: 'doc-creation-sections', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      const result = await client.callTool(
        {
          name: 'extract_document_sections',
          arguments: { document_path: `${projectName}/${docPath}` },
        },
        undefined,
        { timeout: 10 * 60 * 1000, resetTimeoutOnProgress: true },
      );
      const textContent = result.content?.find((c) => c.type === 'text');
      if (textContent) {
        let parsed = textContent.text;
        try { parsed = JSON.parse(parsed); } catch { /* already object */ }
        if (parsed && typeof parsed === 'object') {
          setSourceLanguage(parsed.source_language || null);
          setSections(Array.isArray(parsed.sections) ? parsed.sections : []);
        }
      }
      try { await client.close(); } catch { /* ignore */ }
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setExtractingSections(false);
    }
  }

  // ── Extract template headings when the template changes ───────────────────
  useEffect(() => {
    if (!open || !selectedTemplate) return;
    extractHeadings(selectedTemplate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, open]);

  async function extractHeadings(docPath) {
    setExtractingHeadings(true);
    setTemplateHeadings([]);
    try {
      const mcpUrl = new URL('/mcp/requirements-matcher', window.location.origin);
      const transport = new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers: { Authorization: 'test123' } },
      });
      const client = new Client(
        { name: 'doc-creation-headings', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      const result = await client.callTool(
        {
          name: 'extract_document_headings',
          arguments: { document_path: `${projectName}/${docPath}` },
        },
        undefined,
        { timeout: 5 * 60 * 1000 },
      );
      const textContent = result.content?.find((c) => c.type === 'text');
      if (textContent) {
        let headings = textContent.text;
        try { headings = JSON.parse(headings); } catch { /* already parsed */ }
        if (Array.isArray(headings)) setTemplateHeadings(headings);
      }
      try { await client.close(); } catch { /* ignore */ }
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setExtractingHeadings(false);
    }
  }

  // ── Mapping edits + read-modify-write persistence ────────────────────────
  //
  // No debounce. Saving is a read-modify-write: GET the current file, merge
  // our UI delta onto it (preserving skill-written status/provenance/lastRun),
  // PUT the result. We persist on *commit* (blur / discrete selector change),
  // never on every keystroke.

  // Snapshot of UI state for the mapping module. Reads live state via refs so
  // a save triggered from an event handler sees the latest values.
  const uiRef = useRef({});
  useEffect(() => {
    uiRef.current = {
      sourceDocuments: selectedSourceDoc ? [selectedSourceDoc] : [],
      templateDocument: selectedTemplate,
      targetLanguage,
      mode,
      outputFile: lastOutput || DEFAULT_OUTPUT,
      sourceLanguageCode: sourceLanguage?.language_code || 'unknown',
      rows: templateHeadings.map((h) => {
        const m = mappings[targetKey(h)] || {};
        return {
          targetSection: { number: h.number, title: h.title },
          sourceSection: m.sourceSection || '',
          transformation: m.transformation || '',
        };
      }),
    };
  }, [
    selectedSourceDoc, selectedTemplate, targetLanguage, mode, lastOutput,
    sourceLanguage, templateHeadings, mappings,
  ]);

  const persist = useCallback(async () => {
    const ui = uiRef.current;
    if (!ui.rows || ui.rows.length === 0) return; // nothing meaningful yet
    try {
      // Read: authoritative base (reflects any skill run since we loaded).
      const base = await fetchMappingFile();
      // Modify: merge UI delta onto the base, preserving skill fields.
      const merged = mergeMappings(base, ui);
      // Write.
      await apiAxios.put(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${MAPPINGS_FILE}`,
        { content: JSON.stringify(merged, null, 2) },
      );
      // The merged file is now the authoritative base for status display.
      const nextBase = {};
      for (const m of merged.mappings || []) {
        nextBase[targetKeyOf(m.targetSection)] = m;
      }
      setBaseByKey(nextBase);
      if (merged.lastRun) setLastRun(merged.lastRun);
      setStatus({ type: 'info', text: t('documentCreation:status.saved') });
    } catch (err) {
      setStatus({
        type: 'error',
        text: t('documentCreation:status.saveFailed', {
          message: err.response?.data?.message || err.message,
        }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, t]);

  // Local-only edit (no save). Used by onChange of the transformation field.
  const editMapping = useCallback((key, patch) => {
    setMappings((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // Edit + immediately persist. Used for discrete commits (source dropdown).
  const commitMapping = useCallback((key, patch) => {
    setMappings((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    // Defer so uiRef picks up the new state before persist reads it.
    setTimeout(() => persist(), 0);
  }, [persist]);

  // Derived per-key status: current UI intent compared against the last-seen
  // base row (which carries the skill-written status/provenance).
  const uiRows = templateHeadings.map((h) => {
    const m = mappings[targetKey(h)] || {};
    return {
      targetSection: { number: h.number, title: h.title },
      sourceSection: m.sourceSection || '',
      transformation: m.transformation || '',
    };
  });
  const statusByKey = statusMap(uiRows, baseByKey);
  const coverage = coverageCounts(uiRows, statusByKey);

  // Mark a generated row as reviewed (user-owned transition). Read-modify-write
  // so we don't disturb other rows or the skill's provenance.
  const handleMarkReviewed = useCallback(async (key) => {
    try {
      const base = await fetchMappingFile();
      if (!base || !Array.isArray(base.mappings)) return;
      const next = {
        ...base,
        mappings: base.mappings.map((mm) =>
          targetKeyOf(mm.targetSection) === key && mm.status === 'generated'
            ? { ...mm, status: 'reviewed' }
            : mm,
        ),
      };
      await apiAxios.put(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${MAPPINGS_FILE}`,
        { content: JSON.stringify(next, null, 2) },
      );
      const nextBase = {};
      for (const mm of next.mappings) nextBase[targetKeyOf(mm.targetSection)] = mm;
      setBaseByKey(nextBase);
    } catch (err) {
      setStatus({
        type: 'error',
        text: t('documentCreation:status.saveFailed', {
          message: err.response?.data?.message || err.message,
        }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, t]);

  // ── Split drag ────────────────────────────────────────────────────────────
  const handleSplitDragStart = useCallback((e) => {
    e.preventDefault();
    splitDragging.current = true;
    const onMove = (ev) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = Math.max(25, Math.min(75, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPct(pct);
    };
    const onUp = () => {
      splitDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // ── Preview + Create ──────────────────────────────────────────────────────
  const langChip = (() => {
    const src = sourceLanguage?.language_code;
    if (!src || src === targetLanguage) return null;
    return `${src.toUpperCase()} → ${targetLanguage.toUpperCase()}`;
  })();

  function renderInstructions() {
    const file = buildMappingFile(uiRef.current);
    const lines = [
      '# Document Creation Instructions',
      '',
      `- Source document(s): ${file.sourceDocuments.join(', ') || '(none)'}`,
      `- Template: ${file.templateDocument || '(none)'}`,
      `- Target language: ${file.targetLanguage}`,
      `- Mode: ${file.mode}`,
      `- Output file: ${file.outputFile}`,
      '',
      '## Section mappings',
      '',
    ];
    for (const m of file.mappings) {
      lines.push(`### ${m.targetSection.number} ${m.targetSection.title}`);
      if (!m.source) {
        lines.push('- _Unmapped — leave the template section untouched._', '');
        continue;
      }
      lines.push(`- Source section: ${m.source.section} ${m.source.title}`.trimEnd());
      lines.push(
        `- Transformation: ${m.transformation || '(copy faithfully)'}`,
      );
      if (m.sourceLanguage && m.sourceLanguage !== file.targetLanguage) {
        lines.push(
          `- Translate from ${m.sourceLanguage} to ${file.targetLanguage}`,
        );
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  const mappedCount = templateHeadings.filter(
    (h) => mappings[targetKey(h)]?.sourceSection,
  ).length;

  function handleGeneratePreview() {
    setPreviewMarkdown(renderInstructions());
    setActiveTab(2);
  }

  async function handleCreateNow() {
    if (mappedCount === 0) {
      setStatus({ type: 'error', text: t('documentCreation:status.noMappings') });
      return;
    }
    setBusy(true);
    try {
      await persist();
      await apiAxios.put(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${INSTRUCTIONS_FILE}`,
        { content: renderInstructions() },
      );
      const message =
        `Run the document-creation skill: read ${MAPPINGS_FILE} and generate ` +
        `${lastOutput || DEFAULT_OUTPUT} from the source documents, applying ` +
        `each transformation note and translating to ${targetLanguage} where ` +
        `the source language differs. See ${INSTRUCTIONS_FILE} for the summary.`;
      window.dispatchEvent(
        new CustomEvent('viewer-auto-prompt', {
          detail: {
            source: 'DocumentCreationModal',
            filename: MAPPINGS_FILE,
            message,
          },
        }),
      );
      setStatus({
        type: 'info',
        text: t('documentCreation:status.createdInstructions'),
      });
      onClose?.();
    } catch (err) {
      setStatus({
        type: 'error',
        text: t('documentCreation:status.createFailed', {
          message: err.response?.data?.message || err.message,
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '85vh', maxHeight: '85vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {t('documentCreation:title')}
        <IconButton onClick={onClose} disabled={busy} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', p: 0 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={t('documentCreation:tabs.mappings')} />
          <Tab label={t('documentCreation:tabs.freestyle')} />
          <Tab label={t('documentCreation:tabs.preview')} />
        </Tabs>

        {status && (
          <Box sx={{ px: 2, py: 1, bgcolor: status.type === 'error' ? 'error.light' : 'info.light' }}>
            <Typography variant="body2">{status.text}</Typography>
          </Box>
        )}

        {/* ── Mappings tab ── */}
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Toolbar */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', p: 2 }}>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>{t('documentCreation:toolbar.sourceDocument')}</InputLabel>
                <Select
                  label={t('documentCreation:toolbar.sourceDocument')}
                  value={selectedSourceDoc}
                  onChange={(e) => setSelectedSourceDoc(e.target.value)}
                >
                  {sourceDocs.map((d) => (
                    <MenuItem key={d.path} value={d.path}>{d.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>{t('documentCreation:toolbar.template')}</InputLabel>
                <Select
                  label={t('documentCreation:toolbar.template')}
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  displayEmpty
                >
                  {templateDocs.length === 0 && (
                    <MenuItem value="" disabled>
                      {t('documentCreation:toolbar.noTemplate')}
                    </MenuItem>
                  )}
                  {templateDocs.map((d) => (
                    <MenuItem key={d.path} value={d.path}>{d.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>{t('documentCreation:toolbar.mode')}</InputLabel>
                <Select
                  label={t('documentCreation:toolbar.mode')}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <MenuItem value="freestyle">{t('documentCreation:toolbar.modeFreestyle')}</MenuItem>
                  <MenuItem value="structured">{t('documentCreation:toolbar.modeStructured')}</MenuItem>
                  <MenuItem value="structured-requirements">{t('documentCreation:toolbar.modeRequirements')}</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>{t('documentCreation:toolbar.targetLanguage')}</InputLabel>
                <Select
                  label={t('documentCreation:toolbar.targetLanguage')}
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                >
                  {TARGET_LANGUAGES.map((l) => (
                    <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {extractingSections ? (
                <Chip size="small" label={t('documentCreation:toolbar.detectingLanguage')} />
              ) : sourceLanguage ? (
                <Chip
                  size="small"
                  color="default"
                  label={t('documentCreation:toolbar.sourceLanguage', {
                    language: sourceLanguage.language_name || sourceLanguage.language_code,
                  })}
                />
              ) : null}
            </Box>

            {/* Coverage meter + filters (Fivetran/Lokalise pattern) */}
            <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ minWidth: 220, flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('documentCreation:coverage', {
                    mapped: coverage.mapped,
                    total: coverage.total,
                    generated: coverage.generated,
                  })}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={
                    coverage.total
                      ? Math.round((coverage.generated / coverage.total) * 100)
                      : 0
                  }
                  sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                />
              </Box>
              <Button
                size="small"
                variant={outstandingOnly ? 'contained' : 'outlined'}
                onClick={() => setOutstandingOnly((v) => !v)}
              >
                {t('documentCreation:actions.showOutstanding')}
              </Button>
              <Button
                size="small"
                startIcon={
                  refreshing ? <CircularProgress size={14} /> : <RefreshIcon />
                }
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {t('documentCreation:actions.refresh')}
              </Button>
            </Box>

            {/* Split panes */}
            <Box ref={splitContainerRef} sx={{ display: 'flex', flex: 1, minHeight: 0, px: 2, pb: 2 }}>
              {/* Left: source sections */}
              <Box sx={{ width: `${splitPct}%`, overflow: 'auto', pr: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('documentCreation:sourceTree.title')}
                </Typography>
                {extractingSections ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2">{t('documentCreation:sourceTree.loading')}</Typography>
                  </Box>
                ) : sections.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('documentCreation:sourceTree.empty')}
                  </Typography>
                ) : (
                  sections.map((s, i) => (
                    <Box
                      key={`${s.number}-${i}`}
                      sx={{ pl: Math.max(0, (s.level || 1) - 1) * 2, py: 0.5 }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {s.number} {s.title}
                      </Typography>
                      {s.image_count > 0 && (
                        <Chip
                          size="small"
                          sx={{ mt: 0.5 }}
                          label={t('documentCreation:sourceTree.images', { count: s.image_count })}
                        />
                      )}
                    </Box>
                  ))
                )}
              </Box>

              <Box
                onMouseDown={handleSplitDragStart}
                sx={{ width: 6, cursor: 'col-resize', bgcolor: 'divider', mx: 0.5, borderRadius: 1 }}
              />

              {/* Right: target sections + mapping rows */}
              <Box sx={{ width: `${100 - splitPct}%`, overflow: 'auto', pl: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('documentCreation:targetList.title')}
                </Typography>
                {extractingHeadings ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                    <CircularProgress size={18} />
                  </Box>
                ) : templateHeadings.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('documentCreation:targetList.empty')}
                  </Typography>
                ) : (
                  templateHeadings
                    .filter((h) =>
                      !outstandingOnly ||
                      OUTSTANDING.has(statusByKey[targetKey(h)] || 'unmapped'),
                    )
                    .map((h) => {
                      const key = targetKey(h);
                      const m = mappings[key] || {};
                      const st = statusByKey[key] || 'unmapped';
                      const chip = STATUS_CHIP[st] || STATUS_CHIP.unmapped;
                      const prov = baseByKey[key]?.provenance;
                      return (
                        <Box
                          key={key}
                          sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1.5 }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {h.number} {h.title}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                              <Chip
                                size="small"
                                color={chip.color}
                                variant={chip.variant}
                                icon={st === 'reviewed' ? <CheckCircleIcon /> : undefined}
                                label={t(`documentCreation:statusLabel.${st}`)}
                              />
                              {st === 'generated' && (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => handleMarkReviewed(key)}
                                >
                                  {t('documentCreation:actions.markReviewed')}
                                </Button>
                              )}
                            </Box>
                          </Box>
                          <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                            <InputLabel>{t('documentCreation:targetList.mapTo')}</InputLabel>
                            <Select
                              label={t('documentCreation:targetList.mapTo')}
                              value={m.sourceSection || ''}
                              onChange={(e) => commitMapping(key, { sourceSection: e.target.value })}
                            >
                              <MenuItem value="">
                                <em>{t('documentCreation:targetList.unmapped')}</em>
                              </MenuItem>
                              {sections.map((s, i) => (
                                <MenuItem key={`${s.number}-${i}`} value={`${s.number}||${s.title}`}>
                                  {s.number} {s.title}
                                  {s.image_count > 0 ? ` (${s.image_count} 🖼)` : ''}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            fullWidth
                            multiline
                            minRows={1}
                            placeholder={t('documentCreation:targetList.transformationPlaceholder')}
                            value={m.transformation || ''}
                            onChange={(e) => editMapping(key, { transformation: e.target.value })}
                            onBlur={() => persist()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.target.blur();
                              }
                            }}
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                            {langChip && m.sourceSection && (
                              <Chip size="small" color="primary" label={langChip} />
                            )}
                            {prov?.generatedAt && (
                              <Typography variant="caption" color="text.secondary">
                                {t('documentCreation:provenance', {
                                  at: new Date(prov.generatedAt).toLocaleString(),
                                  note: prov.note || '',
                                })}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      );
                    })
                )}
              </Box>
            </Box>
          </Box>
        )}

        {/* ── Freestyle tab ── */}
        {activeTab === 1 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('documentCreation:freestyle.heading')}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t('documentCreation:freestyle.body')}
            </Typography>
            <Button variant="outlined" onClick={onClose}>
              {t('documentCreation:freestyle.openChat')}
            </Button>
          </Box>
        )}

        {/* ── Preview tab ── */}
        {activeTab === 2 && (
          <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
            {lastRun && (
              <Box sx={{ mb: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('documentCreation:lastRun.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('documentCreation:lastRun.summary', {
                    at: new Date(lastRun.at).toLocaleString(),
                    filled: lastRun.filled ?? 0,
                    skipped: lastRun.skipped ?? 0,
                    error: lastRun.error ?? 0,
                    outputFile: lastRun.outputFile || lastOutput || '',
                  })}
                </Typography>
              </Box>
            )}
            {lastOutput && (
              <Typography variant="body2" sx={{ mb: 1 }} color="text.secondary">
                {t('documentCreation:preview.lastOutput', { path: lastOutput })}
              </Typography>
            )}
            {previewMarkdown ? (
              <Box
                component="pre"
                sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13, m: 0 }}
              >
                {previewMarkdown}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('documentCreation:preview.empty')}
              </Typography>
            )}
          </Box>
        )}

        {busy && <LinearProgress />}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('documentCreation:actions.close')}
        </Button>
        <Button onClick={handleGeneratePreview} disabled={busy}>
          {t('documentCreation:actions.generatePreview')}
        </Button>
        <Button
          variant="contained"
          onClick={handleCreateNow}
          disabled={busy || mappedCount === 0}
        >
          {t('documentCreation:actions.createNow')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
