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
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  ContentCopy as DuplicateIcon,
} from '@mui/icons-material';
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
  const [activeTab, setActiveTab] = useState(0);
  const [checkedSections, setCheckedSections] = useState({});
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

  // Selected requirements persisted to out/selected-requirements.md
  const [selectedReqs, setSelectedReqs] = useState({}); // { "docName::REQ-ID": { id, original_text } }

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

  const handleToggleCheck = useCallback((e, sectionId) => {
    e.stopPropagation();
    setCheckedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

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
    : 'Requirements';

  // Must be before early returns so hook count is stable across renders
  const summary = data?.quality_analysis?.executive_summary || '';
  const summaryHtml = useMemo(() => {
    if (!summary) return '';
    return DOMPurify.sanitize(marked.parse(summary, { breaks: true, gfm: true }));
  }, [summary]);

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
              {progress.message || `Processing page ${progress.progress} of ${progress.total}`} — {pct}%
            </Typography>
          </>
        ) : (
          <>
            <CircularProgress />
            {extracting && (
              <Typography variant="body2" color="text.secondary">
                Extracting requirements from {pdfBaseName}.pdf — this may take a moment…
              </Typography>
            )}
          </>
        )}
        {extracting && (
          <Typography variant="caption" color="text.secondary">
            {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')} elapsed
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
            {reqCount} requirements extracted
            {language ? ` · Source language: ${language}` : ''}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Show translations
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
          <Tab label="Summary" />
          <Tab label="ToC" />
          <Tab label="Quality Analysis" />
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: activeTab === 1 ? 'hidden' : 'auto', p: 2 }}>
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
                No summary available.
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
function TocTree({ sections, requirements, checkedSections, onToggleCheck, selectedSection, onSelectSection, expandedSections, onToggleExpand, showTranslations }) {
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
          depth={0}
          dimmed={!topLevelWithReqs.has(node.section.section_number)}
        />
      ))}
    </Box>
  );
}

function TocNode({ node, checkedSections, onToggleCheck, selectedSection, onSelectSection, expandedSections, onToggleExpand, showTranslations, depth, dimmed }) {
  const { section, children } = node;
  const id = section.section_number;
  const hasChildren = children.length > 0;
  const isSelected = selectedSection === id;
  const expanded = !!expandedSections[id];

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
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
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
          checked={!!checkedSections[id]}
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
function SectionContentPane({ section, subsections, requirements, selectedReqs, docName, onToggleReq, showTranslations }) {
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
          Page {section.page_start}
        </Typography>
      )}

      {/* Subsections list */}
      {subsections.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary' }}>
            Subsections
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
            {requirements.length} Requirement{requirements.length !== 1 ? 's' : ''}
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
                    label="ambiguous"
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
                    Actor: {req.actor}
                  </Typography>
                )}
                {req.verification && (
                  <Typography variant="caption" color="text.secondary">
                    Verification: {req.verification}
                  </Typography>
                )}
                {req.source_page != null && (
                  <Typography variant="caption" color="text.secondary">
                    Page: {req.source_page}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No requirements extracted for this section.
        </Typography>
      )}
    </Box>
  );
}

/**
 * Quality Analysis tab content — shows duplicates, contradictions, and gaps.
 */
function QualityAnalysisPane({ qualityAnalysis, requirements }) {
  const duplicates = qualityAnalysis.duplicates || [];
  const contradictions = qualityAnalysis.contradictions || [];
  const gaps = qualityAnalysis.gaps || [];

  // Helper to look up requirement text by ID
  const reqById = {};
  for (const r of requirements) {
    reqById[r.id] = r;
  }

  return (
    <Box>
      {/* Duplicates */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <DuplicateIcon fontSize="small" color="warning" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Duplicates
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
            No duplicates detected.
          </Typography>
        )}
      </Box>

      {/* Contradictions */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <ErrorIcon fontSize="small" color="error" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Contradictions
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
            No contradictions detected.
          </Typography>
        )}
      </Box>

      {/* Gaps */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <WarningIcon fontSize="small" color="info" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Gaps
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
            No gaps identified.
          </Typography>
        )}
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
