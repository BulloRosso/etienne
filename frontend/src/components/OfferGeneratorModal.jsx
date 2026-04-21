/**
 * OfferGeneratorModal.jsx
 *
 * Modal dialog triggered from the filesystem context menu on "selected-requirements.md".
 * Three tabs:
 *   1. Requirements — lists selected requirements + offer documents from "previous-offers"
 *   2. Output structure — Monaco editor for guidance structure (Markdown)
 *   3. Generated content — progress bar + Monaco editor with the result
 *
 * Calls the `find_solutions_for` MCP tool via requirements-matcher group.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  IconButton,
  LinearProgress,
  MenuItem,
  Radio,
  Select,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { BsMagic } from 'react-icons/bs';
import Editor from '@monaco-editor/react';
import { apiFetch, apiAxios } from '../services/api';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DEFAULT_GUIDANCE_STRUCTURE = `1. Executive Summary
1.1 Project Overview
1.2 Proposed Solution Overview
2. Technical Solution
2.1 System Architecture
2.2 Hardware and Infrastructure
2.3 Software and Applications
2.4 Network and Connectivity
3. Implementation Plan
3.1 Project Timeline
3.2 Resource Allocation
3.3 Risk Management
4. Service and Support
4.1 Maintenance and Operations
4.2 Service Level Agreements
4.3 Training and Knowledge Transfer
5. Compliance and Standards
5.1 Regulatory Compliance
5.2 Quality Assurance
5.3 Security Measures
6. Team and Qualifications
6.1 Project Team
6.2 Relevant Experience
6.3 Certifications
7. Commercial Offer
7.1 Pricing Structure
7.2 Payment Terms
7.3 Warranty and Guarantees
8. Appendices
8.1 Technical Specifications
8.2 Reference Projects`;

export default function OfferGeneratorModal({ open, onClose, projectName }) {
  const [activeTab, setActiveTab] = useState(0);

  // Requirements state
  const [requirements, setRequirements] = useState([]);
  const [loadingReqs, setLoadingReqs] = useState(false);

  // Offer documents state
  const [offerDocs, setOfferDocs] = useState([]); // { name, path, selected }
  const [offerDocsError, setOfferDocsError] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Resizable split for Requirements tab (percentage for left pane)
  const [splitPct, setSplitPct] = useState(65);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef(null);

  // Template document (selected from offer docs, must be .docx)
  const [templateDocPath, setTemplateDocPath] = useState(null);
  const [templateHeadings, setTemplateHeadings] = useState([]); // [{ number, title, selected }]
  const [extractingHeadings, setExtractingHeadings] = useState(false);

  // Output structure (used when no template is selected)
  const [guidanceStructure, setGuidanceStructure] = useState(DEFAULT_GUIDANCE_STRUCTURE);

  // Output language
  const [outputLanguage, setOutputLanguage] = useState('it');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(null); // { progress, total, message }
  const [generatedContent, setGeneratedContent] = useState('');
  const [generationError, setGenerationError] = useState(null);

  // Save/Export dialog state
  const [saveDialog, setSaveDialog] = useState({ open: false, filename: '' });
  const [exportDialog, setExportDialog] = useState({ open: false, filename: '' });
  const [saving, setSaving] = useState(false);

  const mcpClientRef = useRef(null);

  // Load requirements and offer documents when modal opens
  useEffect(() => {
    if (!open || !projectName) return;
    loadRequirements();
    loadOfferDocuments();
    // Reset state
    setTemplateDocPath(null);
    setTemplateHeadings([]);
    setExtractingHeadings(false);
    setOutputLanguage('it');
    setGenerating(false);
    setProgress(null);
    setGeneratedContent('');
    setGenerationError(null);
    setSaveDialog({ open: false, filename: '' });
    setExportDialog({ open: false, filename: '' });
    setActiveTab(0);
  }, [open, projectName]);

  // Clean up MCP client on close
  useEffect(() => {
    return () => {
      if (mcpClientRef.current) {
        try { mcpClientRef.current.close(); } catch { /* ignore */ }
      }
    };
  }, []);

  /**
   * Load selected requirements from selected-requirements.md,
   * then load the full requirement data from the corresponding .requirements.json.
   */
  async function loadRequirements() {
    setLoadingReqs(true);
    try {
      // 1. Load selected-requirements.md
      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/out/selected-requirements.md`,
      );
      if (!res.ok) {
        setRequirements([]);
        return;
      }
      const mdText = await res.text();
      const parsed = parseSelectedReqsMarkdown(mdText);

      // 2. Group by document name
      const byDoc = {};
      for (const [key, val] of Object.entries(parsed)) {
        const sepIdx = key.indexOf('::');
        const docName = key.substring(0, sepIdx);
        if (!byDoc[docName]) byDoc[docName] = [];
        byDoc[docName].push(val);
      }

      // 3. For each document, load the full requirement JSON
      const fullReqs = [];
      for (const [docName, reqs] of Object.entries(byDoc)) {
        const jsonFile = `out/requirements-analysis/${docName}.requirements.json`;
        try {
          const jsonRes = await apiFetch(
            `/api/workspace/${encodeURIComponent(projectName)}/files/${jsonFile}`,
          );
          if (jsonRes.ok) {
            const jsonData = JSON.parse(await jsonRes.text());
            const allReqs = jsonData.requirements || [];
            // Match by ID
            for (const sel of reqs) {
              const full = allReqs.find((r) => r.id === sel.id);
              if (full) {
                fullReqs.push(full);
              } else {
                // Fallback: use what we have from the markdown
                fullReqs.push({
                  id: sel.id,
                  ears_normalized: sel.original_text,
                  action: '',
                  constraint: '',
                  priority: '',
                  verification: '',
                  references_standard: '',
                });
              }
            }
          }
        } catch (err) {
          console.error(`Failed to load requirements JSON for ${docName}:`, err);
        }
      }

      setRequirements(fullReqs);
    } catch (err) {
      console.error('Failed to load requirements:', err);
      setRequirements([]);
    } finally {
      setLoadingReqs(false);
    }
  }

  /**
   * Load documents from the "previous-offers" folder in the workspace.
   */
  async function loadOfferDocuments() {
    setLoadingDocs(true);
    setOfferDocsError(null);
    try {
      // Load filesystem tree and find previous-offers folder
      const response = await apiAxios.post('/api/claude/filesystem', { projectName });
      const tree = response.data.tree || [];

      const docs = [];
      findDocsInFolder(tree, 'previous-offers', docs);

      if (docs.length === 0) {
        setOfferDocsError('Please upload some documents to the previous-offers directory');
      }
      setOfferDocs(docs.map((d) => ({ ...d, selected: true })));
    } catch (err) {
      console.error('Failed to load offer documents:', err);
      setOfferDocsError('Please upload some documents to the previous-offers directory');
      setOfferDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  /**
   * Recursively find files inside a folder named `targetFolder` in the tree.
   * Tree nodes from the backend have: { id (relative path), label (name), type, children? }
   */
  function findDocsInFolder(nodes, targetFolder, results) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (node.label === targetFolder && node.children) {
          collectFiles(node.children, results);
        } else if (node.children) {
          findDocsInFolder(node.children, targetFolder, results);
        }
      }
    }
  }

  function collectFiles(nodes, results) {
    for (const node of nodes) {
      if (node.type === 'folder' && node.children) {
        collectFiles(node.children, results);
      } else if (node.type !== 'folder') {
        const ext = (node.label || '').toLowerCase();
        if (ext.endsWith('.pdf') || ext.endsWith('.docx') || ext.endsWith('.doc')) {
          results.push({
            name: node.label,
            path: node.id,
          });
        }
      }
    }
  }

  const toggleDocSelection = useCallback((idx) => {
    setOfferDocs((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, selected: !d.selected } : d)),
    );
  }, []);

  /**
   * Toggle a document as the template (radio behavior — only one at a time).
   * Only .docx files can be templates. Triggers heading extraction.
   */
  const toggleTemplate = useCallback(async (docPath) => {
    if (templateDocPath === docPath) {
      // Deselect template
      setTemplateDocPath(null);
      setTemplateHeadings([]);
      return;
    }
    setTemplateDocPath(docPath);
    setTemplateHeadings([]);
    setExtractingHeadings(true);

    try {
      const mcpUrl = new URL('/mcp/requirements-matcher', window.location.origin);
      const transport = new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers: { Authorization: 'test123' } },
      });
      const client = new Client(
        { name: 'heading-extractor', version: '1.0.0' },
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
        if (Array.isArray(headings)) {
          setTemplateHeadings(headings.map((h) => ({ ...h, selected: true })));
        }
      }

      try { await client.close(); } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to extract headings:', err);
      setTemplateHeadings([]);
    } finally {
      setExtractingHeadings(false);
    }
  }, [templateDocPath, projectName]);

  const toggleHeadingSelection = useCallback((idx) => {
    setTemplateHeadings((prev) =>
      prev.map((h, i) => (i === idx ? { ...h, selected: !h.selected } : h)),
    );
  }, []);

  const selectedDocs = offerDocs.filter((d) => d.selected);
  const hasTemplate = !!templateDocPath;
  const selectedHeadings = templateHeadings.filter((h) => h.selected);

  // Build effective guidance structure from template headings or manual editor
  const effectiveGuidanceStructure = hasTemplate
    ? selectedHeadings.map((h) => `${h.number} ${h.title}`).join('\n')
    : guidanceStructure;

  const canGenerate =
    requirements.length > 0 &&
    selectedDocs.length > 0 &&
    effectiveGuidanceStructure.trim() &&
    (!hasTemplate || selectedHeadings.length > 0);

  // Drag-to-resize handler for Requirements tab split
  const handleSplitDragStart = useCallback((e) => {
    e.preventDefault();
    splitDragging.current = true;
    const onMove = (ev) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = Math.max(25, Math.min(85, ((ev.clientX - rect.left) / rect.width) * 100));
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

  /**
   * Call the MCP tool find_solutions_for and stream progress.
   */
  async function handleGenerate() {
    if (!canGenerate) return;

    setActiveTab(2); // Switch to Generated content tab
    setGenerating(true);
    setProgress(null);
    setGeneratedContent('');
    setGenerationError(null);

    try {
      const mcpUrl = new URL('/mcp/requirements-matcher', window.location.origin);
      const transport = new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers: { Authorization: 'test123' } },
      });
      const mcpClient = new Client(
        { name: 'offer-generator', version: '1.0.0' },
        { capabilities: {} },
      );
      mcpClientRef.current = mcpClient;

      await mcpClient.connect(transport);

      // Build requirement objects for the tool
      const reqArgs = requirements.map((r) => ({
        id: r.id,
        ears_normalized: r.ears_normalized || '',
        action: r.action || '',
        constraint: r.constraint || '',
        priority: r.priority || '',
        verification: r.verification || '',
        references_standard: r.references_standard || '',
      }));

      // Document paths relative to workspace (include project name)
      const docPaths = selectedDocs.map((d) => `${projectName}/${d.path}`);

      const result = await mcpClient.callTool(
        {
          name: 'find_solutions_for',
          arguments: {
            requirements: reqArgs,
            offer_documents: docPaths,
            guidance_structure: effectiveGuidanceStructure,
            source: 'documents',
            output_language: outputLanguage,
          },
        },
        undefined,
        {
          timeout: 60 * 60 * 1000, // 1 hour
          resetTimeoutOnProgress: true,
          onprogress: (p) => {
            setProgress(p);
          },
        },
      );

      // Extract the text result — the MCP factory JSON.stringify's the tool return value,
      // so a plain string comes back as a JSON-encoded string that needs parsing.
      const textContent = result.content?.find((c) => c.type === 'text');
      if (textContent) {
        let content = textContent.text;
        try { content = JSON.parse(content); } catch { /* already plain text */ }
        setGeneratedContent(content);
      } else {
        setGeneratedContent('No content was generated.');
      }
    } catch (err) {
      console.error('Generation failed:', err);
      setGenerationError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
      if (mcpClientRef.current) {
        try { await mcpClientRef.current.close(); } catch { /* ignore */ }
        mcpClientRef.current = null;
      }
    }
  }

  /**
   * Save generated content as Markdown to out/created-snippets/<filename>.md
   */
  async function handleSaveMarkdown() {
    const name = saveDialog.filename.trim();
    if (!name) return;
    const filename = name.endsWith('.md') ? name : `${name}.md`;
    const filepath = `out/created-snippets/${filename}`;

    setSaving(true);
    try {
      await apiAxios.post(`/api/workspace/${projectName}/files/create-folder`, {
        folderPath: 'out/created-snippets',
      });
    } catch { /* folder may already exist */ }
    try {
      await apiAxios.put(
        `/api/workspace/${projectName}/files/save/${filepath}`,
        { content: generatedContent },
      );
      setSaveDialog({ open: false, filename: '' });
    } catch (err) {
      console.error('Save failed:', err);
      setGenerationError(`Save failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Export generated content as DOCX to out/exported-snippets/<filename>.docx
   */
  async function handleExportDocx() {
    const name = exportDialog.filename.trim();
    if (!name) return;
    const filename = name.endsWith('.docx') ? name : `${name}.docx`;
    const filepath = `out/exported-snippets/${filename}`;

    setSaving(true);
    try {
      await apiAxios.post(`/api/workspace/${projectName}/files/create-folder`, {
        folderPath: 'out/exported-snippets',
      });
    } catch { /* folder may already exist */ }
    try {
      if (hasTemplate) {
        // Template-based export: selectively replace sections in the template DOCX
        await apiAxios.post(
          `/api/workspace/${projectName}/files/export-docx-template/${filepath}`,
          {
            content: generatedContent,
            templatePath: templateDocPath,
            selectedSections: selectedHeadings.map((h) => ({ number: h.number, title: h.title })),
          },
        );
      } else {
        // Default export via LibreOffice
        await apiAxios.post(
          `/api/workspace/${projectName}/files/export-docx/${filepath}`,
          { content: generatedContent },
        );
      }
      setExportDialog({ open: false, filename: '' });
    } catch (err) {
      console.error('Export failed:', err);
      setGenerationError(`Export failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const pct = progress?.total ? Math.round((progress.progress / progress.total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onClose={generating ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '85vh',
          maxHeight: '85vh',
          borderTop: '4px solid #1976d2',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" component="span">Generate Offer Paragraphs</Typography>
          <IconButton onClick={onClose} disabled={generating} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1, mb: '20px', bgcolor: '#e3f2fd', borderRadius: 1, px: '20px', py: '20px' }}>
          <BsMagic style={{ fontSize: 21, color: '#1976d2', flexShrink: 0, marginTop: 2 }} />
          <Typography variant="body2" color="text.secondary">
            Craft a compelling offer response by matching your selected requirements against previous winning proposals.
            The AI will identify the most relevant paragraphs from your offer library and weave them into a coherent document that follows your output structure.
            Fine-tune the guidance outline on the next tab, then sit back and let the magic happen.
          </Typography>
        </Box>
      </DialogTitle>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
        >
          <Tab label="Input Content" />
          <Tab label="Output Structure" />
          <Tab label="Generated Content" />
        </Tabs>
      </Box>

      <DialogContent sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}>
        {/* ── Tab 0: Requirements ── */}
        {activeTab === 0 && (
          <Box ref={splitContainerRef} sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Left: Requirements list */}
            <Box sx={{ width: `${splitPct}%`, overflow: 'auto', p: 2, flexShrink: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Selected Requirements ({requirements.length})
              </Typography>
              {loadingReqs ? (
                <Typography variant="body2" color="text.secondary">Loading requirements...</Typography>
              ) : requirements.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No requirements selected. Select requirements in the Requirements Viewer first.
                </Typography>
              ) : (
                requirements.map((req) => (
                  <Box
                    key={req.id}
                    sx={{
                      mb: 1,
                      p: 1,
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      fontSize: '0.85rem',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {req.id}
                      </Typography>
                      {req.priority && (
                        <Chip
                          label={req.priority}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {req.ears_normalized || req.original_text || '(no text)'}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>

            {/* Resize handle */}
            <Box
              onMouseDown={handleSplitDragStart}
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

            {/* Right: Offer documents */}
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', p: 2, borderLeft: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Offer Documents
              </Typography>
              {/* Column headers */}
              {!loadingDocs && !offerDocsError && offerDocs.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, mb: 0.5 }}>
                  <Box sx={{ width: 28, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Source</Typography>
                  </Box>
                  <Box sx={{ width: 28, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Template</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }} />
                </Box>
              )}
              {loadingDocs ? (
                <Typography variant="body2" color="text.secondary">Loading...</Typography>
              ) : offerDocsError ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  {offerDocsError}
                </Typography>
              ) : (
                offerDocs.map((doc, idx) => {
                  const isDocx = doc.name.toLowerCase().endsWith('.docx');
                  const isTemplate = templateDocPath === doc.path;
                  return (
                    <Box
                      key={doc.path}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        py: 0.5,
                        borderRadius: 1,
                        px: 0.5,
                        bgcolor: isTemplate ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: isTemplate ? 'action.selected' : 'action.hover' },
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={doc.selected}
                        onClick={() => toggleDocSelection(idx)}
                        sx={{ p: 0 }}
                      />
                      <Tooltip title={isDocx ? (isTemplate ? 'Remove as template' : 'Use as template') : 'Only .docx files can be used as template'}>
                        <span>
                          <Radio
                            size="small"
                            checked={isTemplate}
                            disabled={!isDocx || extractingHeadings}
                            onClick={() => isDocx && toggleTemplate(doc.path)}
                            sx={{ p: 0 }}
                          />
                        </span>
                      </Tooltip>
                      <i className={`codicon ${docIcon(doc.name)}`} style={{ fontSize: 14 }} />
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', flex: 1, cursor: 'pointer' }} onClick={() => toggleDocSelection(idx)}>
                        {doc.name}
                      </Typography>
                      {isTemplate && extractingHeadings && (
                        <CircularProgress size={14} />
                      )}
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        )}

        {/* ── Tab 1: Output Structure ── */}
        {activeTab === 1 && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {hasTemplate ? (
              /* Template mode: heading checklist */
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Select which sections of the template to fill with generated content.
                  Unchecked sections will be preserved from the template document.
                </Typography>
                {extractingHeadings ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2" color="text.secondary">Extracting headings from template...</Typography>
                  </Box>
                ) : templateHeadings.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No headings found in the template document.
                  </Typography>
                ) : (
                  templateHeadings.map((heading, idx) => (
                    <Box
                      key={`${heading.number}-${idx}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.75,
                        px: 1,
                        borderRadius: 1,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                        bgcolor: heading.selected ? 'rgba(25, 118, 210, 0.04)' : 'transparent',
                      }}
                      onClick={() => toggleHeadingSelection(idx)}
                    >
                      <Checkbox size="small" checked={heading.selected} sx={{ p: 0 }} />
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {heading.number}
                      </Typography>
                      <Typography variant="body1">
                        {heading.title}
                      </Typography>
                    </Box>
                  ))
                )}
              </Box>
            ) : (
              /* No template: Monaco editor for manual guidance structure */
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <Editor
                  height="100%"
                  language="markdown"
                  theme="light"
                  value={guidanceStructure}
                  onChange={(value) => setGuidanceStructure(value || '')}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </Box>
            )}
          </Box>
        )}

        {/* ── Tab 2: Generated Content ── */}
        {activeTab === 2 && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Progress bar area */}
            {generating && (
              <Box sx={{ px: 3, py: 2 }}>
                <LinearProgress
                  variant={progress?.total ? 'determinate' : 'indeterminate'}
                  value={pct}
                  sx={{ height: 8, borderRadius: 4, mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {progress?.message || 'Initializing...'}{progress?.total ? ` — ${pct}%` : ''}
                </Typography>
              </Box>
            )}

            {/* Error */}
            {generationError && (
              <Box sx={{ px: 3, py: 1 }}>
                <Typography variant="body2" color="error">
                  {generationError}
                </Typography>
              </Box>
            )}

            {/* Generated content editor */}
            {!generating && !generationError && !generatedContent && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Click "Generate Response" to start generating content.
                </Typography>
              </Box>
            )}

            {(generatedContent || generating) && (
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <Editor
                  height="100%"
                  language="markdown"
                  theme="light"
                  value={generatedContent}
                  onChange={(value) => setGeneratedContent(value ?? '')}
                  options={{
                    readOnly: generating,
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    fontSize: 13,
                    lineNumbers: 'off',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </Box>
            )}

            {/* Save / Export buttons */}
            {generatedContent && !generating && (
              <Box sx={{ display: 'flex', gap: 1, px: 3, py: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setSaveDialog({ open: true, filename: '' })}
                  disabled={saving}
                >
                  Save as Markdown
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setExportDialog({ open: true, filename: '' })}
                  disabled={saving}
                >
                  {hasTemplate ? 'Export as Word (template)' : 'Export as Word'}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={generating}>
          Close
        </Button>
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={outputLanguage}
            onChange={(e) => setOutputLanguage(e.target.value)}
            disabled={generating}
            sx={{ fontSize: '0.8rem', height: 36 }}
          >
            <MenuItem value="it">Italiano</MenuItem>
            <MenuItem value="en">English</MenuItem>
          </Select>
        </FormControl>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={!canGenerate || generating || !!offerDocsError}
        >
          {generating ? 'Generating...' : 'Generate Response'}
        </Button>
      </DialogActions>

      {/* ── Save as Markdown filename dialog ── */}
      <Dialog
        open={saveDialog.open}
        onClose={() => setSaveDialog({ open: false, filename: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Save as Markdown</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            File will be saved to <strong>out/created-snippets/</strong>
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Filename"
            placeholder="my-response.md"
            value={saveDialog.filename}
            onChange={(e) => setSaveDialog({ ...saveDialog, filename: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveMarkdown(); }}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialog({ open: false, filename: '' })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveMarkdown}
            disabled={!saveDialog.filename.trim() || saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Export as Word filename dialog ── */}
      <Dialog
        open={exportDialog.open}
        onClose={() => setExportDialog({ open: false, filename: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Export as Word</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            File will be exported to <strong>out/exported-snippets/</strong>
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Filename"
            placeholder="my-response.docx"
            value={exportDialog.filename}
            onChange={(e) => setExportDialog({ ...exportDialog, filename: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') handleExportDocx(); }}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialog({ open: false, filename: '' })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleExportDocx}
            disabled={!exportDialog.filename.trim() || saving}
          >
            {saving ? 'Exporting...' : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function docIcon(filename) {
  const ext = (filename || '').toLowerCase();
  if (ext.endsWith('.pdf')) return 'codicon-file-pdf';
  if (ext.endsWith('.docx') || ext.endsWith('.doc')) return 'codicon-file-text';
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) return 'codicon-file-excel'; // not used yet but future-proof
  return 'codicon-file';
}

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
