import React, { useState, useEffect, useRef } from 'react';
import {
  Box, CircularProgress, IconButton, Tooltip, Button
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import ImageIcon from '@mui/icons-material/Image';
import { PiFilePdf, PiFileDoc } from 'react-icons/pi';
import Editor from '@monaco-editor/react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import ImageGalleryModal from './ImageGalleryModal.jsx';
import ExportFilenameModal from './ExportFilenameModal.jsx';

export default function MarkdownViewer({ filename, projectName, className = '' }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const [htmlContent, setHtmlContent] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [imagesAvailable, setImagesAvailable] = useState(false);
  const [imagesDir, setImagesDir] = useState('');
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState(null);
  const [exporting, setExporting] = useState(false);
  const editorRef = useRef(null);

  const isDirty = rawContent !== savedContent;

  // Compute parent directory of the markdown file
  const parentDir = filename.includes('/')
    ? filename.substring(0, filename.lastIndexOf('/'))
    : '';

  // Function to fetch markdown file content
  const fetchMarkdownContent = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }

      const markdownText = await response.text();

      // Store raw content for editor
      setRawContent(markdownText);
      setSavedContent(markdownText);

      // Parse markdown to HTML
      const rawHtml = await marked.parse(markdownText);
      const cleanHtml = DOMPurify.sanitize(rawHtml);
      setHtmlContent(cleanHtml);
      setLoading(false);
    } catch (err) {
      console.error('Error loading markdown file:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMarkdownContent();
  }, [filename, projectName, refreshKey]);

  // Check if images directory exists (try parent dir first, then project root)
  useEffect(() => {
    const checkImages = async () => {
      try {
        // Try parent directory of the markdown file first
        if (parentDir) {
          const res = await apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/list-images/${parentDir}`);
          const data = await res.json();
          if (data.exists) {
            setImagesAvailable(true);
            setImagesDir(parentDir);
            return;
          }
        }
        // Fall back to project root
        const res = await apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/list-images/`);
        const data = await res.json();
        setImagesAvailable(data.exists);
        setImagesDir('');
      } catch {
        setImagesAvailable(false);
      }
    };
    checkImages();
  }, [filename, projectName]);

  // Handler for manual reload
  const handleReload = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Save handler
  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${filename}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: rawContent }),
        }
      );

      if (!response.ok) {
        throw new Error(t('markdownViewer.errorSaving'));
      }

      setSavedContent(rawContent);

      // Re-render HTML preview and switch back to view mode
      const rawHtml = await marked.parse(rawContent);
      setHtmlContent(DOMPurify.sanitize(rawHtml));
      setSaving(false);
      setEditMode(false);
    } catch (err) {
      console.error('Error saving markdown file:', err);
      setError(err.message);
      setSaving(false);
    }
  };

  // Image insertion handler
  const handleInsertImage = (imagePath) => {
    const editor = editorRef.current;
    if (!editor) return;

    const altText = imagePath.split('/').pop().replace(/\.[^.]+$/, '');
    const imageUrl = `/api/workspace/${encodeURIComponent(projectName)}/files/${imagePath}`;
    const insertText = `![${altText}](${imageUrl})`;

    const position = editor.getPosition();
    editor.executeEdits('insert-image', [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text: insertText,
    }]);
    setRawContent(editor.getValue());
    setImageGalleryOpen(false);
  };

  // Listen for file changes via claudeHook events
  useEffect(() => {
    const handleClaudeHook = (event) => {
      if (event.type === 'claudeHook' && event.detail) {
        const { hook, file } = event.detail;

        if (hook === 'PostHook' && file) {
          // Suppress auto-refresh when in edit mode to avoid overwriting user edits
          if (editMode) return;

          const normalizedFile = file.replace(/\\/g, '/');
          const normalizedFilename = filename.replace(/\\/g, '/');
          const exactMatch = normalizedFile === normalizedFilename;
          const endsWithMatch = normalizedFile.endsWith('/' + normalizedFilename);

          if (exactMatch || endsWithMatch) {
            setRefreshKey(prev => prev + 1);
          }
        }
      }
    };

    window.addEventListener('claudeHook', handleClaudeHook);

    return () => {
      window.removeEventListener('claudeHook', handleClaudeHook);
    };
  }, [filename, editMode]);

  // Extract first heading from markdown for default export filename
  const getDefaultFilename = () => {
    const match = rawContent.match(/^#+\s+(.+)/m);
    if (match) {
      return match[1].trim().replace(/[<>:"/\\|?*]/g, '').substring(0, 100);
    }
    const baseName = filename.split('/').pop().replace(/\.md$/i, '');
    return baseName || 'document';
  };

  // Export handler — calls backend and triggers browser download
  const handleExport = async (exportFilename) => {
    setExporting(true);
    try {
      const endpoint = exportFormat === 'pdf'
        ? `/api/workspace/${encodeURIComponent(projectName)}/files/download-pdf`
        : `/api/workspace/${encodeURIComponent(projectName)}/files/download-docx`;

      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rawContent, filename: exportFilename }),
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportFilename}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportModalOpen(false);
    } catch (err) {
      console.error('Export error:', err);
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <Box
        className={className}
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="100%"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        className={className}
        p={2}
        color="error.main"
      >
        {t('markdownViewer.errorLoading')} {error}
      </Box>
    );
  }

  return (
    <Box className={className} height="100%" width="100%" position="relative" display="flex" flexDirection="column">
      {editMode ? (
        <>
          {/* Monaco Editor */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Editor
              height="100%"
              language="markdown"
              theme="light"
              value={rawContent}
              onChange={(value) => setRawContent(value || '')}
              onMount={(editor) => { editorRef.current = editor; }}
              options={{
                readOnly: false,
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </Box>

          {/* Bottom bar */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              px: 2,
              py: '22px',
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box>
              {imagesAvailable && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ImageIcon />}
                  onClick={() => setImageGalleryOpen(true)}
                >
                  {t('markdownViewer.insertImage')}
                </Button>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => { setRawContent(savedContent); setEditMode(false); }}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={!isDirty || saving}
              >
                {saving ? t('markdownViewer.saving') : t('markdownViewer.save')}
              </Button>
            </Box>
          </Box>

          {/* Image Gallery Modal */}
          <ImageGalleryModal
            open={imageGalleryOpen}
            onClose={() => setImageGalleryOpen(false)}
            onInsert={handleInsertImage}
            projectName={projectName}
            directoryPath={imagesDir}
          />
        </>
      ) : (
        <>
        {/* Rendered markdown view */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            pt: 0,
            px: 3,
            pb: 3,
            color: isDark ? '#c9d1d9' : 'inherit',
            '& > *:first-child': {
              marginTop: 0
            },
            '& h1': {
              fontSize: '2em',
              fontWeight: 'bold',
              marginTop: '0.67em',
              marginBottom: '0.67em',
              borderBottom: `1px solid ${isDark ? '#30363d' : '#eaecef'}`,
              paddingBottom: '0.3em'
            },
            '& h2': {
              fontSize: '1.5em',
              fontWeight: 'bold',
              marginTop: '0.83em',
              marginBottom: '0.83em',
              borderBottom: `1px solid ${isDark ? '#30363d' : '#eaecef'}`,
              paddingBottom: '0.3em'
            },
            '& h3': {
              fontSize: '1.17em',
              fontWeight: 'bold',
              marginTop: '1em',
              marginBottom: '1em'
            },
            '& h4': {
              fontSize: '1em',
              fontWeight: 'bold',
              marginTop: '1.33em',
              marginBottom: '1.33em'
            },
            '& h5': {
              fontSize: '0.83em',
              fontWeight: 'bold',
              marginTop: '1.67em',
              marginBottom: '1.67em'
            },
            '& h6': {
              fontSize: '0.67em',
              fontWeight: 'bold',
              marginTop: '2.33em',
              marginBottom: '2.33em'
            },
            '& p': {
              marginTop: '1em',
              marginBottom: '1em',
              lineHeight: '1.6'
            },
            '& ul, & ol': {
              marginTop: '1em',
              marginBottom: '1em',
              paddingLeft: '2em'
            },
            '& li': {
              marginTop: '0.25em',
              marginBottom: '0.25em'
            },
            '& code': {
              backgroundColor: isDark ? '#161b22' : '#f6f8fa',
              borderRadius: '3px',
              padding: '0.2em 0.4em',
              fontFamily: 'monospace',
              fontSize: '0.9em',
              color: isDark ? '#c9d1d9' : 'inherit'
            },
            '& pre': {
              backgroundColor: isDark ? '#161b22' : '#f6f8fa',
              borderRadius: '6px',
              padding: '16px',
              overflow: 'auto',
              marginTop: '1em',
              marginBottom: '1em'
            },
            '& pre code': {
              backgroundColor: 'transparent',
              padding: 0,
              fontSize: '0.85em',
              lineHeight: '1.45'
            },
            '& blockquote': {
              borderLeft: `4px solid ${isDark ? '#3b434b' : '#dfe2e5'}`,
              paddingLeft: '1em',
              marginLeft: 0,
              color: isDark ? '#8b949e' : '#6a737d',
              marginTop: '1em',
              marginBottom: '1em'
            },
            '& table': {
              borderCollapse: 'collapse',
              width: '100%',
              marginTop: '1em',
              marginBottom: '1em'
            },
            '& table th, & table td': {
              border: `1px solid ${isDark ? '#30363d' : '#dfe2e5'}`,
              padding: '6px 13px'
            },
            '& table th': {
              fontWeight: 'bold',
              backgroundColor: isDark ? '#161b22' : '#f6f8fa'
            },
            '& a': {
              color: isDark ? '#58a6ff' : '#0366d6',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline'
              }
            },
            '& img': {
              maxWidth: '100%',
              height: 'auto'
            },
            '& hr': {
              border: 'none',
              borderTop: `1px solid ${isDark ? '#30363d' : '#eaecef'}`,
              marginTop: '1.5em',
              marginBottom: '1.5em'
            }
          }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />

        {/* Footer controls */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 2,
            mb: '20px',
          }}
        >
          <Button
            variant="outlined"
            size="small"
            onClick={() => setEditMode(true)}
          >
            {t('markdownViewer.editMode')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('markdownViewer.exportPdf', 'Export as PDF')}>
              <IconButton
                size="small"
                onClick={() => { setExportFormat('pdf'); setExportModalOpen(true); }}
              >
                <PiFilePdf size={20} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('markdownViewer.exportDocx', 'Export as Word')}>
              <IconButton
                size="small"
                onClick={() => { setExportFormat('docx'); setExportModalOpen(true); }}
              >
                <PiFileDoc size={20} />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={t('markdownViewer.reloadFile')}>
            <IconButton
              onClick={handleReload}
              disabled={loading}
              size="small"
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <ExportFilenameModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          onConfirm={handleExport}
          defaultFilename={getDefaultFilename()}
          format={exportFormat}
          exporting={exporting}
        />
        </>
      )}
    </Box>
  );
}
