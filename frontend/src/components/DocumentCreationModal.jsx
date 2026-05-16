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
import { Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiFetch, apiAxios } from '../services/api';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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

  const [previewMarkdown, setPreviewMarkdown] = useState('');
  const [lastOutput, setLastOutput] = useState('');
  const [status, setStatus] = useState(null); // { type: 'info'|'error', text }
  const [busy, setBusy] = useState(false);

  const saveTimer = useRef(null);

  // Resizable split (left source tree / right target list)
  const [splitPct, setSplitPct] = useState(45);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef(null);

  const targetKey = (h) => `${h.number}||${h.title}`;

  // ── Load on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !projectName) return;
    setActiveTab(0);
    setSelectedSourceDoc('');
    setSections([]);
    setSourceLanguage(null);
    setMappings({});
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

  async function loadExistingMappings() {
    try {
      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${MAPPINGS_FILE}`,
      );
      if (!res.ok) return;
      const data = JSON.parse(await res.text());
      if (data.targetLanguage) setTargetLanguage(data.targetLanguage);
      if (data.mode) setMode(data.mode);
      if (data.templateDocument) setSelectedTemplate(data.templateDocument);
      if (data.outputFile) setLastOutput(data.outputFile);
      const restored = {};
      for (const m of data.mappings || []) {
        if (!m.targetSection) continue;
        const key = `${m.targetSection.number}||${m.targetSection.title}`;
        restored[key] = {
          sourceSection: m.source
            ? `${m.source.section}||${m.source.title || ''}`
            : '',
          transformation: m.transformation || '',
        };
      }
      setMappings(restored);
    } catch {
      /* no existing mappings yet */
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

  // ── Mapping edits + debounced persistence ─────────────────────────────────
  const buildMappingFile = useCallback(() => {
    const srcLang = sourceLanguage?.language_code || 'unknown';
    return {
      sourceDocuments: selectedSourceDoc ? [selectedSourceDoc] : [],
      templateDocument: selectedTemplate,
      targetLanguage,
      mode,
      outputFile: lastOutput || DEFAULT_OUTPUT,
      mappings: templateHeadings.map((h) => {
        const m = mappings[targetKey(h)] || {};
        let source = null;
        if (m.sourceSection) {
          const [number, title] = m.sourceSection.split('||');
          source = { document: selectedSourceDoc, section: number, title: title || '' };
        }
        return {
          targetSection: { number: h.number, title: h.title },
          source,
          transformation: m.transformation || '',
          sourceLanguage: srcLang,
        };
      }),
    };
  }, [
    sourceLanguage, selectedSourceDoc, selectedTemplate, targetLanguage,
    mode, lastOutput, templateHeadings, mappings,
  ]);

  const persist = useCallback(async () => {
    try {
      await apiAxios.put(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${MAPPINGS_FILE}`,
        { content: JSON.stringify(buildMappingFile(), null, 2) },
      );
      setStatus({ type: 'info', text: t('documentCreation:status.saved') });
    } catch (err) {
      setStatus({
        type: 'error',
        text: t('documentCreation:status.saveFailed', {
          message: err.response?.data?.message || err.message,
        }),
      });
    }
  }, [projectName, buildMappingFile, t]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 600);
  }, [persist]);

  const updateMapping = useCallback((key, patch) => {
    setMappings((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    scheduleSave();
  }, [scheduleSave]);

  // Persist when toolbar selectors change (after sections/headings settle)
  useEffect(() => {
    if (!open || !templateHeadings.length) return;
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLanguage, mode, selectedTemplate]);

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
    const file = buildMappingFile();
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
                  templateHeadings.map((h) => {
                    const key = targetKey(h);
                    const m = mappings[key] || {};
                    return (
                      <Box
                        key={key}
                        sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1.5 }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                          {h.number} {h.title}
                        </Typography>
                        <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                          <InputLabel>{t('documentCreation:targetList.mapTo')}</InputLabel>
                          <Select
                            label={t('documentCreation:targetList.mapTo')}
                            value={m.sourceSection || ''}
                            onChange={(e) => updateMapping(key, { sourceSection: e.target.value })}
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
                          onChange={(e) => updateMapping(key, { transformation: e.target.value })}
                        />
                        {langChip && m.sourceSection && (
                          <Chip size="small" color="primary" sx={{ mt: 1 }} label={langChip} />
                        )}
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
