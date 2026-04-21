import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Box,
  Typography,
  CircularProgress,
  LinearProgress,
  Collapse,
  IconButton,
  Checkbox,
  Chip,
  Tabs,
  Tab,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  ContentCopy as DuplicateIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch, apiAxios } from '../services/api';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * RequirementsViewer — previewer for .requirements.json files.
 *
 * On mount it tries to load the existing .requirements.json file.
 * If the file does not exist yet (404) it calls the document_analysis_ears
 * MCP tool, saves the result, and then displays it.
 *
 * Layout:
 *  - Left pane: collapsible TOC tree (first level expanded, second level collapsed)
 *  - Right pane: content detail for the selected section
 *  - Clicking a TOC item opens the content pane; checkbox is unaffected
 */
export default function RequirementsViewer({ filename, projectName }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);

  // Progress and elapsed time tracking
  const [progress, setProgress] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  const pdfBaseName = filename
    ? filename.split('/').pop().replace(/\.requirements\.json$/i, '')
    : '';

  // UI state
  const [activeTab, setActiveTab] = useState(1);
  const [selectedSection, setSelectedSection] = useState(null);

  // Show/hide English translations
  const [showTranslations, setShowTranslations] = useState(true);

  // TOC expanded state persisted per document in localStorage
  const tocExpandedKey = `requirementsViewer.tocExpanded.${pdfBaseName}`;
  const [expandedSections, setExpandedSections] = useState(() => {
    try {
      const saved = localStorage.getItem(tocExpandedKey);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  });
  const handleToggleExpand = useCallback((sectionId) => {
    setExpandedSections((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      try { localStorage.setItem(tocExpandedKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [tocExpandedKey]);

  // Tracking status from progress/tracking.md
  const [trackingStatus, setTrackingStatus] = useState({}); // { "REQ-001": "Done"|"Ignore"|"ToDo" }
  const trackingFile = 'progress/tracking.md';

  // Selected requirements persisted to out/selected-requirements.md
  const [selectedReqs, setSelectedReqs] = useState({}); // { "docName::REQ-ID": { id, original_text } }

  // Selected chapters (ToC sections) persisted to out/selected-chapters.md
  const [checkedSections, setCheckedSections] = useState({}); // { "docName::sectionNumber": { sectionNumber, title } }
  const selectedChaptersFile = 'out/selected-chapters.md';

  // Resizable split: percentage for left (TOC) pane, persisted in localStorage
  const SPLIT_STORAGE_KEY = 'requirementsViewer.tocSplitPct';
  const [tocPct, setTocPct] = useState(() => {
    try {
      const saved = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (saved) return Math.max(20, Math.min(80, Number(saved)));
    } catch { /* ignore */ }
    return 50;
  });
  const draggingRef = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrExtract() {
      try {
        setLoading(true);
        setExtracting(false);
        setError(null);

        const res = await apiFetch(
          `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`,
        );

        if (res.ok) {
          const text = await res.text();
          if (!cancelled) setData(JSON.parse(text));
          return;
        }

        if (res.status === 404) {
          if (!cancelled) {
            setExtracting(true);
            setElapsedSeconds(0);
            timerRef.current = setInterval(() => {
              setElapsedSeconds((s) => s + 1);
            }, 1000);
          }

          const result = await callEarsExtraction(projectName, pdfBaseName, (p) => {
            if (!cancelled) setProgress(p);
          });
          if (cancelled) return;

          const outFolder = 'out/requirements-analysis';
          try {
            await apiAxios.post(`/api/workspace/${projectName}/files/create-folder`, {
              folderPath: outFolder,
            });
          } catch { /* folder may already exist */ }

          await apiAxios.put(
            `/api/workspace/${projectName}/files/save/${filename}`,
            { content: JSON.stringify(result, null, 2) },
          );

          if (!cancelled) setData(result);
          return;
        }

        throw new Error(`Failed to load: ${res.statusText}`);
      } catch (err) {
        console.error('[RequirementsViewer] Error:', err);
        if (!cancelled) setError(err.message);
      } finally {
        clearInterval(timerRef.current);
        timerRef.current = null;
        if (!cancelled) {
          setLoading(false);
          setExtracting(false);
        }
      }
    }

    loadOrExtract();
    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
    };
  }, [filename, projectName, pdfBaseName]);

  const selectedReqsFile = 'out/selected-requirements.md';
  const docName = pdfBaseName;

  // Load existing selected-requirements.md on mount
  useEffect(() => {
    let cancelled = false;
    async function loadSelectedReqs() {
      try {
        const res = await apiFetch(
          `/api/workspace/${encodeURIComponent(projectName)}/files/${selectedReqsFile}`,
        );
        if (!res.ok) return;
        const text = await res.text();
        const parsed = parseSelectedReqsMarkdown(text);
        if (!cancelled) setSelectedReqs(parsed);
      } catch { /* file may not exist yet */ }
    }
    if (projectName) loadSelectedReqs();
    return () => { cancelled = true; };
  }, [projectName]);

  // Load existing selected-chapters.md on mount
  useEffect(() => {
    let cancelled = false;
    async function loadSelectedChapters() {
      try {
        const res = await apiFetch(
          `/api/workspace/${encodeURIComponent(projectName)}/files/${selectedChaptersFile}`,
        );
        if (!res.ok) return;
        const text = await res.text();
        const parsed = parseSelectedChaptersMarkdown(text);
        if (!cancelled) setCheckedSections(parsed);
      } catch { /* file may not exist yet */ }
    }
    if (projectName) loadSelectedChapters();
    return () => { cancelled = true; };
  }, [projectName]);

  // Load tracking.md on mount
  useEffect(() => {
    let cancelled = false;
    async function loadTracking() {
      try {
        const res = await apiFetch(
          `/api/workspace/${encodeURIComponent(projectName)}/files/${trackingFile}`,
        );
        if (!res.ok) return;
        const text = await res.text();
        if (!cancelled) setTrackingStatus(parseTrackingMarkdown(text));
      } catch { /* file may not exist */ }
    }
    if (projectName) loadTracking();
    return () => { cancelled = true; };
  }, [projectName]);

  // Toggle a requirement selection and persist to markdown file
  const handleToggleReq = useCallback(async (req) => {
    const key = `${docName}::${req.id}`;
    const next = { ...selectedReqs };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = { id: req.id, original_text: req.original_text || '' };
    }
    setSelectedReqs(next);

    // Build and save markdown
    const md = buildSelectedReqsMarkdown(next);
    try {
      await apiAxios.put(
        `/api/workspace/${projectName}/files/save/${selectedReqsFile}`,
        { content: md },
      );
    } catch (err) {
      console.error('[RequirementsViewer] Failed to save selected requirements:', err);
    }
  }, [selectedReqs, docName, projectName]);

  // Set tracking status for a requirement and persist to tracking.md
  const handleSetTrackingStatus = useCallback(async (reqId, status) => {
    const next = { ...trackingStatus };
    if (status === null) {
      delete next[reqId];
    } else {
      next[reqId] = status;
    }
    setTrackingStatus(next);

    const md = buildTrackingMarkdown(next);
    try {
      await apiAxios.post(`/api/workspace/${projectName}/files/create-folder`, {
        folderPath: 'progress',
      });
    } catch { /* folder may already exist */ }
    try {
      await apiAxios.put(
        `/api/workspace/${projectName}/files/save/${trackingFile}`,
        { content: md },
      );
    } catch (err) {
      console.error('[RequirementsViewer] Failed to save tracking status:', err);
    }
  }, [trackingStatus, projectName]);

  const handleToggleCheck = useCallback(async (e, sectionId) => {
    e.stopPropagation();
    const key = `${docName}::${sectionId}`;
    const next = { ...checkedSections };
    if (next[key]) {
      delete next[key];
    } else {
      const sectionObj = data?.document_sections?.find(
        (s) => s.section_number === sectionId,
      );
      next[key] = { sectionNumber: sectionId, title: sectionObj?.title || '' };
    }
    setCheckedSections(next);

    const md = buildSelectedChaptersMarkdown(next);
    try {
      await apiAxios.put(
        `/api/workspace/${projectName}/files/save/${selectedChaptersFile}`,
        { content: md },
      );
    } catch (err) {
      console.error('[RequirementsViewer] Failed to save selected chapters:', err);
    }
  }, [checkedSections, docName, projectName, data]);

  const handleSelectSection = useCallback((sectionId) => {
    setSelectedSection((prev) => (prev === sectionId ? null : sectionId));
  }, []);

  // Drag-to-resize handlers
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMove = (ev) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.max(20, Math.min(80, ((ev.clientX - rect.left) / rect.width) * 100));
      setTocPct(pct);
    };

    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // persist
      setTocPct((cur) => {
        try { localStorage.setItem(SPLIT_STORAGE_KEY, String(Math.round(cur))); } catch { /* ignore */ }
        return cur;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [SPLIT_STORAGE_KEY]);

  const displayName = filename
    ? filename.split('/').pop().replace(/\.requirements\.json$/i, '')
    : t('reqViewer.fallbackTitle');

  // Must be before early returns so hook count is stable across renders
  const summary = data?.quality_analysis?.executive_summary || '';
  const summaryHtml = useMemo(() => {
    if (!summary) return '';
    return DOMPurify.sanitize(marked.parse(summary, { breaks: true, gfm: true }));
  }, [summary]);

  // Compute per-section tracking status for TOC indicators
  const sectionTrackingStatus = useMemo(() => {
    const result = {};
    const sections = data?.document_sections || [];
    const requirements = data?.requirements || [];
    if (sections.length === 0 || Object.keys(trackingStatus).length === 0) return result;

    for (const sec of sections) {
      const secNum = sec.section_number;
      const reqs = requirements.filter(
        (r) => r.source_section === secNum || r.source_section?.startsWith(secNum + '.'),
      );
      if (reqs.length === 0) {
        result[secNum] = 'none';
        continue;
      }
      const doneCount = reqs.filter((r) => trackingStatus[r.id] === 'Done').length;
      const doneOrIgnoreCount = reqs.filter(
        (r) => trackingStatus[r.id] === 'Done' || trackingStatus[r.id] === 'Ignore',
      ).length;
      if (doneOrIgnoreCount === reqs.length) {
        result[secNum] = 'complete';
      } else if (doneCount > 0) {
        result[secNum] = 'partial';
      } else {
        result[secNum] = 'none';
      }
    }
    return result;
  }, [data, trackingStatus]);

  if (loading) {
    const hasProgress = extracting && progress?.total;
    const pct = hasProgress ? Math.round((progress.progress / progress.total) * 100) : 0;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, gap: 2 }}>
        {hasProgress ? (
          <>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{ width: '80%', height: 8, borderRadius: 4 }}
            />
            <Typography variant="body2" color="text.secondary">
              {progress.message || t('reqViewer.processingPage', { current: progress.progress, total: progress.total })} — {pct}%
            </Typography>
          </>
        ) : (
          <>
            <CircularProgress />
            {extracting && (
              <Typography variant="body2" color="text.secondary">
                {t('reqViewer.extracting', { name: pdfBaseName })}
              </Typography>
            )}
          </>
        )}
        {extracting && (
          <Typography variant="caption" color="text.secondary">
            {t('reqViewer.elapsed', { time: `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}` })}
          </Typography>
        )}
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!data) return null;

  const qualityAnalysis = data.quality_analysis || {};
  const sections = data.document_sections || [];
  const requirements = data.requirements || [];
  const reqCount = requirements.length;
  const language = data.source_language?.language_name || '';

  // Get requirements for the selected section (including subsections)
  const selectedRequirements = selectedSection
    ? requirements.filter(
        (r) =>
          r.source_section === selectedSection ||
          r.source_section?.startsWith(selectedSection + '.'),
      )
    : [];

  // Find the selected section object
  const selectedSectionObj = selectedSection
    ? sections.find((s) => s.section_number === selectedSection)
    : null;

  // Gather subsections for the selected section
  const selectedSubsections = selectedSection
    ? sections.filter((s) => s.section_number.startsWith(selectedSection + '.'))
    : [];

  const hasContentPane = selectedSection != null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: themeMode === 'dark' ? 'background.default' : 'background.paper',
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, pt: 2, pb: 0, flexShrink: 0 }}>
        <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 600 }}>
          {displayName}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('reqViewer.reqCount', { count: reqCount })}
            {language ? ` · ${t('reqViewer.sourceLanguage', { language })}` : ''}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('reqViewer.showTranslations')}
            </Typography>
            <Checkbox
              size="small"
              checked={showTranslations}
              onChange={(e) => setShowTranslations(e.target.checked)}
              sx={{ p: 0 }}
            />
          </Box>
        </Box>
      </Box>

      {/* Tab strip */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, flexShrink: 0 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="standard"
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
        >
          <Tab label={t('reqViewer.tab.summary')} />
          <Tab label={t('reqViewer.tab.toc')} />
          <Tab label={t('reqViewer.tab.qualityAnalysis')} />
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: (activeTab === 1 || activeTab === 2) ? 'hidden' : 'auto', p: 2 }}>
        {/* Summary tab */}
        {activeTab === 0 && (
          <Box>
            {summary ? (
              <Box
                sx={{
                  lineHeight: 1.6,
                  fontSize: '0.875rem',
                  '& h1, & h2, & h3': { mt: 2, mb: 1 },
                  '& p': { mb: 1 },
                  '& ul, & ol': { pl: 3, mb: 1 },
                  '& li': { mb: 0.5 },
                  '& code': { px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover', fontSize: '0.85em' },
                  '& pre': { p: 1.5, borderRadius: 1, bgcolor: 'action.hover', overflow: 'auto' },
                }}
                dangerouslySetInnerHTML={{ __html: summaryHtml }}
              />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {t('reqViewer.summary.empty')}
              </Typography>
            )}
          </Box>
        )}

        {/* ToC tab */}
        {activeTab === 1 && sections.length > 0 && (
          <Box ref={containerRef} sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* TOC pane */}
            <Box
              sx={{
                width: hasContentPane ? `${tocPct}%` : '100%',
                overflow: 'auto',
                flexShrink: 0,
              }}
            >
              <TocTree
                sections={sections}
                requirements={requirements}
                checkedSections={checkedSections}
                onToggleCheck={handleToggleCheck}
                selectedSection={selectedSection}
                onSelectSection={handleSelectSection}
                expandedSections={expandedSections}
                onToggleExpand={handleToggleExpand}
                showTranslations={showTranslations}
                sectionTrackingStatus={sectionTrackingStatus}
                docName={docName}
                themeMode={themeMode}
              />
            </Box>

            {/* Resize handle */}
            {hasContentPane && (
              <Box
                onMouseDown={handleDragStart}
                sx={{
                  width: 6,
                  flexShrink: 0,
                  cursor: 'col-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '&:hover, &:active': { bgcolor: 'action.hover' },
                  '&::after': {
                    content: '""',
                    width: 2,
                    height: 32,
                    borderRadius: 1,
                    bgcolor: 'divider',
                  },
                }}
              />
            )}

            {/* Content pane */}
            {hasContentPane && (
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'auto',
                  borderLeft: 1,
                  borderColor: 'divider',
                  pl: 2,
                }}
              >
                <SectionContentPane
                  section={selectedSectionObj}
                  subsections={selectedSubsections}
                  requirements={selectedRequirements}
                  selectedReqs={selectedReqs}
                  docName={docName}
                  onToggleReq={handleToggleReq}
                  showTranslations={showTranslations}
                  trackingStatus={trackingStatus}
                  onSetTrackingStatus={handleSetTrackingStatus}
                />
              </Box>
            )}
          </Box>
        )}

        {/* Quality Analysis tab */}
        {activeTab === 2 && (
          <QualityAnalysisPane
            qualityAnalysis={qualityAnalysis}
            requirements={requirements}
          />
        )}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MCP extraction helper
// ---------------------------------------------------------------------------

async function callEarsExtraction(projectName, pdfBaseName, onProgress) {
  const mcpUrl = new URL('/mcp/document-analysis', window.location.origin);
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: { headers: { Authorization: 'test123' } },
  });
  const mcpClient = new Client(
    { name: 'requirements-viewer-extractor', version: '1.0.0' },
    { capabilities: {} },
  );

  try {
    await mcpClient.connect(transport);

    const documentPath = `${projectName}/inbox/${pdfBaseName}.pdf`;

    const result = await mcpClient.callTool(
      {
        name: 'document_analysis_ears',
        arguments: { document_path: documentPath, output_format: 'json' },
      },
      undefined,
      {
        timeout: 30 * 60 * 1000,
        resetTimeoutOnProgress: true,
        onprogress: onProgress,
      },
    );

    const textContent = result.content?.find((c) => c.type === 'text');
    if (!textContent) throw new Error('No text content in MCP response');

    return JSON.parse(textContent.text);
  } finally {
    try { await mcpClient.close(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Renders document_sections as a tree with checkboxes.
 * First level items are visible; second level starts collapsed.
 */
function TocTree({ sections, requirements, checkedSections, onToggleCheck, selectedSection, onSelectSection, expandedSections, onToggleExpand, showTranslations, sectionTrackingStatus, docName, themeMode }) {
  const tree = buildSectionTree(sections);

  // Build a set of top-level section numbers that have at least one requirement
  // (either directly or in any subsection)
  const topLevelWithReqs = new Set();
  for (const req of requirements) {
    const src = req.source_section;
    if (!src) continue;
    // Find which top-level section this belongs to
    for (const root of tree) {
      const rootNum = root.section.section_number;
      if (src === rootNum || src.startsWith(rootNum + '.')) {
        topLevelWithReqs.add(rootNum);
        break;
      }
    }
  }

  return (
    <Box>
      {tree.map((node) => (
        <TocNode
          key={node.section.section_number}
          node={node}
          checkedSections={checkedSections}
          onToggleCheck={onToggleCheck}
          selectedSection={selectedSection}
          onSelectSection={onSelectSection}
          expandedSections={expandedSections}
          onToggleExpand={onToggleExpand}
          showTranslations={showTranslations}
          sectionTrackingStatus={sectionTrackingStatus}
          docName={docName}
          themeMode={themeMode}
          depth={0}
          dimmed={!topLevelWithReqs.has(node.section.section_number)}
        />
      ))}
    </Box>
  );
}

function TocNode({ node, checkedSections, onToggleCheck, selectedSection, onSelectSection, expandedSections, onToggleExpand, showTranslations, sectionTrackingStatus, docName, themeMode, depth, dimmed }) {
  const { section, children } = node;
  const id = section.section_number;
  const hasChildren = children.length > 0;
  const isSelected = selectedSection === id;
  const expanded = !!expandedSections[id];
  const isChecked = !!checkedSections[docName + '::' + id];

  return (
    <Box>
      <Box
        onClick={() => onSelectSection(id)}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          pl: depth * 2,
          cursor: 'pointer',
          borderRadius: 1,
          bgcolor: isSelected
            ? 'action.selected'
            : isChecked
              ? (themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : '#efefef')
              : 'transparent',
          '&:hover': {
            bgcolor: isSelected
              ? 'action.selected'
              : isChecked
                ? (themeMode === 'dark' ? 'rgba(255,255,255,0.12)' : '#e0e0e0')
                : 'action.hover',
          },
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            sx={{ mt: 0.25 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(id);
            }}
          >
            {expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 28 }} />
        )}
        <Checkbox
          size="small"
          checked={isChecked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onToggleCheck(e, id)}
          sx={{ p: 0.5, mt: 0.25 }}
        />
        <Typography
          variant="body2"
          sx={{
            ml: 0.5,
            py: 0.5,
            fontWeight: isSelected ? 600 : 400,
            userSelect: 'none',
            color: dimmed ? '#999' : 'text.primary',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Box component="span" sx={{ fontWeight: 500, mr: 0.5 }}>
            {id}
          </Box>
          {section.title}
          {section.page_start != null && (
            <Box
              component="span"
              sx={{ ml: 1, color: 'text.secondary', fontSize: '0.8em' }}
            >
              (p.{section.page_start})
            </Box>
          )}
          {showTranslations && section.title_en && (
            <Box
              component="span"
              sx={{ ml: 1, color: 'text.secondary', fontStyle: 'italic', fontSize: '0.85em' }}
            >
              — {section.title_en}
            </Box>
          )}
        </Typography>
        {sectionTrackingStatus[id] === 'complete' && (
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0, mt: 0.75, mr: 1 }} />
        )}
        {sectionTrackingStatus[id] === 'partial' && (
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', border: 2, borderColor: 'success.main', flexShrink: 0, mt: 0.75, mr: 1 }} />
        )}
      </Box>
      {hasChildren && (
        <Collapse in={expanded}>
          {children.map((child) => (
            <TocNode
              key={child.section.section_number}
              node={child}
              checkedSections={checkedSections}
              onToggleCheck={onToggleCheck}
              selectedSection={selectedSection}
              onSelectSection={onSelectSection}
              expandedSections={expandedSections}
              onToggleExpand={onToggleExpand}
              showTranslations={showTranslations}
              sectionTrackingStatus={sectionTrackingStatus}
              docName={docName}
              themeMode={themeMode}
              depth={depth + 1}
              dimmed={dimmed}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
}

/**
 * Content pane showing details for the selected section.
 */
function SectionContentPane({ section, subsections, requirements, selectedReqs, docName, onToggleReq, showTranslations, trackingStatus, onSetTrackingStatus }) {
  const { t } = useTranslation();
  if (!section) return null;

  const priorityColor = {
    mandatory: 'error',
    recommended: 'warning',
    optional: 'info',
    desired: 'success',
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
        {section.section_number} {section.title}
      </Typography>
      {section.page_start != null && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          {t('reqViewer.section.page', { page: section.page_start })}
        </Typography>
      )}

      {/* Subsections list */}
      {subsections.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary' }}>
            {t('reqViewer.section.subsections')}
          </Typography>
          {subsections.map((sub) => (
            <Typography key={sub.section_number} variant="body2" sx={{ pl: 1, py: 0.25 }}>
              {sub.section_number} — {sub.title}
            </Typography>
          ))}
        </Box>
      )}

      {/* Requirements */}
      {requirements.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
            {t(requirements.length !== 1 ? 'reqViewer.section.requirementCount_plural' : 'reqViewer.section.requirementCount', { count: requirements.length })}
          </Typography>
          {requirements.map((req) => (
            <Box
              key={req.id}
              sx={{
                mb: 1.5,
                p: 1.5,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {req.id}
                </Typography>
                {req.priority && (
                  <Chip
                    label={req.priority}
                    size="small"
                    color={priorityColor[req.priority] || 'default'}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                )}
                {req.ears_type && (
                  <Chip
                    label={req.ears_type}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                )}
                {req.ambiguity_flag && (
                  <Chip
                    label={t('reqViewer.section.ambiguous')}
                    size="small"
                    color="warning"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                )}
                <Box sx={{ flex: 1 }} />
                <Checkbox
                  size="small"
                  checked={!!selectedReqs[`${docName}::${req.id}`]}
                  onChange={() => onToggleReq(req)}
                  sx={{ p: 0 }}
                />
              </Box>
              {req.original_text && (
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {req.original_text}
                </Typography>
              )}
              {showTranslations && req.ears_normalized && req.ears_normalized !== req.original_text && (
                <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.85em' }}>
                  {req.ears_normalized}
                </Typography>
              )}
              {req.ambiguity_notes && (
                <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mt: 0.5 }}>
                  ⚠ {req.ambiguity_notes}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                {req.actor && (
                  <Typography variant="caption" color="text.secondary">
                    {t('reqViewer.section.actor', { value: req.actor })}
                  </Typography>
                )}
                {req.verification && (
                  <Typography variant="caption" color="text.secondary">
                    {t('reqViewer.section.verification', { value: req.verification })}
                  </Typography>
                )}
                {req.source_page != null && (
                  <Typography variant="caption" color="text.secondary">
                    {t('reqViewer.section.pageMeta', { value: req.source_page })}
                  </Typography>
                )}
              </Box>
              {/* Tracking status */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Select
                  size="small"
                  displayEmpty
                  value={trackingStatus[req.id] || ''}
                  onChange={(e) => onSetTrackingStatus(req.id, e.target.value || null)}
                  sx={{
                    minWidth: 100,
                    height: 28,
                    fontSize: '0.75rem',
                    bgcolor: trackingStatus[req.id] === 'Done' ? 'success.main'
                      : trackingStatus[req.id] === 'ToDo' ? 'info.main'
                      : trackingStatus[req.id] === 'Ignore' ? 'action.disabled'
                      : 'transparent',
                    color: trackingStatus[req.id] ? '#fff' : 'text.primary',
                    '& .MuiSelect-icon': { color: trackingStatus[req.id] ? '#fff' : undefined },
                    borderRadius: 1,
                  }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.75rem' }}>—</MenuItem>
                  <MenuItem value="ToDo" sx={{ fontSize: '0.75rem' }}>ToDo</MenuItem>
                  <MenuItem value="Done" sx={{ fontSize: '0.75rem' }}>Done</MenuItem>
                  <MenuItem value="Ignore" sx={{ fontSize: '0.75rem' }}>Ignore</MenuItem>
                </Select>
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {t('reqViewer.section.noRequirements')}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Quality Analysis tab content — shows duplicates, contradictions, and gaps
 * with a left-side section navigation.
 */
function QualityAnalysisPane({ qualityAnalysis, requirements }) {
  const { t } = useTranslation();
  const duplicates = qualityAnalysis.duplicates || [];
  const contradictions = qualityAnalysis.contradictions || [];
  const gaps = qualityAnalysis.gaps || [];

  // Refs for scrolling to sections
  const duplicatesRef = useRef(null);
  const contradictionsRef = useRef(null);
  const gapsRef = useRef(null);

  const [activeSection, setActiveSection] = useState('duplicates');

  const sections = [
    { key: 'duplicates', label: t('reqViewer.quality.duplicates'), count: duplicates.length, icon: <DuplicateIcon fontSize="small" color="warning" />, ref: duplicatesRef },
    { key: 'contradictions', label: t('reqViewer.quality.contradictions'), count: contradictions.length, icon: <ErrorIcon fontSize="small" color="error" />, ref: contradictionsRef },
    { key: 'gaps', label: t('reqViewer.quality.gaps'), count: gaps.length, icon: <WarningIcon fontSize="small" color="info" />, ref: gapsRef },
  ];

  const handleNavClick = (key, ref) => {
    setActiveSection(key);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Helper to look up requirement text by ID
  const reqById = {};
  for (const r of requirements) {
    reqById[r.id] = r;
  }

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {/* Left navigation */}
      <Box
        sx={{
          width: 200,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          pr: 1,
          mr: 2,
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
        }}
      >
        {sections.map((sec) => (
          <Box
            key={sec.key}
            onClick={() => handleNavClick(sec.key, sec.ref)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1,
              mb: 0.5,
              borderRadius: 1,
              cursor: 'pointer',
              bgcolor: activeSection === sec.key ? 'action.selected' : 'transparent',
              '&:hover': {
                bgcolor: activeSection === sec.key ? 'action.selected' : 'action.hover',
              },
            }}
          >
            {sec.icon}
            <Typography variant="body2" sx={{ fontWeight: activeSection === sec.key ? 600 : 400, flex: 1 }}>
              {sec.label}
            </Typography>
            <Chip label={sec.count} size="small" sx={{ height: 20, fontSize: '0.75rem' }} />
          </Box>
        ))}
      </Box>

      {/* Right content */}
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {/* Duplicates */}
        <Box ref={duplicatesRef} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <DuplicateIcon fontSize="small" color="warning" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t('reqViewer.quality.duplicates')}
            </Typography>
            <Chip label={duplicates.length} size="small" sx={{ height: 20, fontSize: '0.75rem' }} />
          </Box>
          {duplicates.length > 0 ? (
            duplicates.map((dup, i) => (
              <Box
                key={i}
                sx={{
                  mb: 1.5,
                  p: 1.5,
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'warning.main',
                  borderLeftWidth: 3,
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  {dup.ids.map((id) => (
                    <Chip key={id} label={id} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
                  ))}
                </Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {dup.reason}
                </Typography>
                {/* Show the referenced requirements */}
                {dup.ids.map((id) => {
                  const r = reqById[id];
                  if (!r) return null;
                  return (
                    <Typography key={id} variant="caption" sx={{ display: 'block', color: 'text.secondary', pl: 1, py: 0.25 }}>
                      <strong>{id}:</strong> {r.ears_normalized}
                    </Typography>
                  );
                })}
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
              {t('reqViewer.quality.noDuplicates')}
            </Typography>
          )}
        </Box>

        {/* Contradictions */}
        <Box ref={contradictionsRef} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <ErrorIcon fontSize="small" color="error" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t('reqViewer.quality.contradictions')}
            </Typography>
            <Chip label={contradictions.length} size="small" sx={{ height: 20, fontSize: '0.75rem' }} />
          </Box>
          {contradictions.length > 0 ? (
            contradictions.map((c, i) => (
              <Box
                key={i}
                sx={{
                  mb: 1.5,
                  p: 1.5,
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'error.main',
                  borderLeftWidth: 3,
                }}
              >
                {c.ids && (
                  <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                    {c.ids.map((id) => (
                      <Chip key={id} label={id} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
                    ))}
                  </Box>
                )}
                <Typography variant="body2">{c.reason || c.text || JSON.stringify(c)}</Typography>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
              {t('reqViewer.quality.noContradictions')}
            </Typography>
          )}
        </Box>

        {/* Gaps */}
        <Box ref={gapsRef} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <WarningIcon fontSize="small" color="info" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t('reqViewer.quality.gaps')}
            </Typography>
            <Chip label={gaps.length} size="small" sx={{ height: 20, fontSize: '0.75rem' }} />
          </Box>
          {gaps.length > 0 ? (
            gaps.map((gap, i) => (
              <Box
                key={i}
                sx={{
                  mb: 1.5,
                  p: 1.5,
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'info.main',
                  borderLeftWidth: 3,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {gap.area}
                </Typography>
                <Typography variant="body2">
                  {gap.explanation}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
              {t('reqViewer.quality.noGaps')}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// selected-requirements.md persistence helpers
// ---------------------------------------------------------------------------

/**
 * Build markdown content from the selectedReqs map.
 * Format:
 *   # Selected Requirements
 *
 *   ## DocumentName
 *
 *   - **REQ-001**: original italian text
 *   - **REQ-003**: original italian text
 */
function buildSelectedReqsMarkdown(selectedReqs) {
  // Group by document name
  const byDoc = {};
  for (const [key, val] of Object.entries(selectedReqs)) {
    const sepIdx = key.indexOf('::');
    const doc = key.substring(0, sepIdx);
    if (!byDoc[doc]) byDoc[doc] = [];
    byDoc[doc].push(val);
  }

  let md = '# Selected Requirements\n';
  for (const [doc, reqs] of Object.entries(byDoc)) {
    // Sort by requirement ID
    reqs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    md += `\n## ${doc}\n\n`;
    for (const r of reqs) {
      md += `- **${r.id}**: ${r.original_text}\n`;
    }
  }
  return md;
}

/**
 * Parse a selected-requirements.md back into a { "doc::REQ-ID": { id, original_text } } map.
 */
function parseSelectedReqsMarkdown(text) {
  const result = {};
  let currentDoc = '';
  for (const line of text.split('\n')) {
    const docMatch = line.match(/^## (.+)$/);
    if (docMatch) {
      currentDoc = docMatch[1].trim();
      continue;
    }
    const reqMatch = line.match(/^- \*\*([^*]+)\*\*:\s*(.*)$/);
    if (reqMatch && currentDoc) {
      const id = reqMatch[1].trim();
      const original_text = reqMatch[2].trim();
      result[`${currentDoc}::${id}`] = { id, original_text };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// selected-chapters.md persistence helpers
// ---------------------------------------------------------------------------

/**
 * Build markdown content from the checkedSections map.
 * Format:
 *   # Selected Chapters
 *
 *   ## DocumentName
 *
 *   - **2.1**: Attività a canone
 *   - **6.2**: Personale dedicato
 */
function buildSelectedChaptersMarkdown(checkedSections) {
  const byDoc = {};
  for (const [key, val] of Object.entries(checkedSections)) {
    const sepIdx = key.indexOf('::');
    const doc = key.substring(0, sepIdx);
    if (!byDoc[doc]) byDoc[doc] = [];
    byDoc[doc].push(val);
  }

  let md = '# Selected Chapters\n';
  for (const [doc, chapters] of Object.entries(byDoc)) {
    chapters.sort((a, b) =>
      a.sectionNumber.localeCompare(b.sectionNumber, undefined, { numeric: true }),
    );
    md += `\n## ${doc}\n\n`;
    for (const ch of chapters) {
      md += `- **${ch.sectionNumber}**: ${ch.title}\n`;
    }
  }
  return md;
}

/**
 * Parse a selected-chapters.md back into a
 * { "doc::sectionNumber": { sectionNumber, title } } map.
 */
function parseSelectedChaptersMarkdown(text) {
  const result = {};
  let currentDoc = '';
  for (const line of text.split('\n')) {
    const docMatch = line.match(/^## (.+)$/);
    if (docMatch) {
      currentDoc = docMatch[1].trim();
      continue;
    }
    const chapterMatch = line.match(/^- \*\*([^*]+)\*\*:\s*(.*)$/);
    if (chapterMatch && currentDoc) {
      const sectionNumber = chapterMatch[1].trim();
      const title = chapterMatch[2].trim();
      result[`${currentDoc}::${sectionNumber}`] = { sectionNumber, title };
    }
  }
  return result;
}

/**
 * Build a hierarchical tree from a flat list of sections.
 */
function buildSectionTree(sections) {
  if (!sections || sections.length === 0) return [];

  const sorted = [...sections].sort((a, b) =>
    a.section_number.localeCompare(b.section_number, undefined, { numeric: true }),
  );

  const nodes = sorted.map((s) => ({ section: s, children: [] }));
  const roots = [];

  for (let i = 0; i < nodes.length; i++) {
    const current = nodes[i];
    let placed = false;

    for (let j = i - 1; j >= 0; j--) {
      const candidate = nodes[j];
      if (isAncestor(candidate.section.section_number, current.section.section_number)) {
        candidate.children.push(current);
        placed = true;
        break;
      }
    }

    if (!placed) {
      roots.push(current);
    }
  }

  return roots;
}

function isAncestor(parentNum, childNum) {
  return childNum.startsWith(parentNum + '.');
}

// ---------------------------------------------------------------------------
// tracking.md persistence helpers
// ---------------------------------------------------------------------------

/**
 * Parse a progress/tracking.md into a { "REQ-001": "Done"|"Ignore"|"ToDo" } map.
 */
function parseTrackingMarkdown(text) {
  const result = {};
  let currentStatus = null;
  for (const line of text.split('\n')) {
    const headingMatch = line.match(/^#\s+(Done|Ignore|ToDo)\s*$/i);
    if (headingMatch) {
      const raw = headingMatch[1];
      // Normalize to exact casing
      if (raw.toLowerCase() === 'done') currentStatus = 'Done';
      else if (raw.toLowerCase() === 'ignore') currentStatus = 'Ignore';
      else if (raw.toLowerCase() === 'todo') currentStatus = 'ToDo';
      continue;
    }
    const itemMatch = line.match(/^\*\s+(.+)$/);
    if (itemMatch && currentStatus) {
      result[itemMatch[1].trim()] = currentStatus;
    }
  }
  return result;
}

/**
 * Build tracking.md content from a status map.
 * Sections are emitted in fixed order; empty sections are omitted.
 */
function buildTrackingMarkdown(statusMap) {
  const groups = { ToDo: [], Done: [], Ignore: [] };
  for (const [reqId, status] of Object.entries(statusMap)) {
    if (groups[status]) groups[status].push(reqId);
  }
  // Sort each group numerically
  const sortFn = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  let md = '';
  for (const section of ['ToDo', 'Done', 'Ignore']) {
    const items = groups[section].sort(sortFn);
    if (items.length === 0) continue;
    if (md) md += '\n';
    md += `# ${section}\n\n`;
    for (const id of items) {
      md += `* ${id}\n`;
    }
  }
  return md;
}
