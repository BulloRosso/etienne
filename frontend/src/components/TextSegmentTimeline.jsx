import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useProject } from '../contexts/ProjectContext';
import { applyCitationChips } from '../utils/citationChips';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import {
  attachRoleplayBannerImages,
  escapeRoleplayTags,
  restoreRoleplayHtml,
  roleplayStyles,
} from '../utils/roleplayRender';

/**
 * Text segment displayed in timeline format (for interleaved text between tool calls)
 */
export default function TextSegmentTimeline({ text, showBullet = true }) {
  const { mode: themeMode } = useThemeMode();
  const { currentProject } = useProject();
  const contentRef = useRef(null);
  // Parse markdown. Roleplay-engine emits `<roleplay-start ... image=.../>`
  // and `<roleplay-end .../>` tags that DOMPurify would strip — pre-escape
  // them to sentinels before marked, then restore as styled banner divs
  // (with an inline <img> placeholder for the start banner) after
  // sanitization. The image blob is loaded lazily in a useEffect below.
  // Same treatment for `<preview:path>` tags so GFM autolink doesn't turn
  // them into `<a href="preview:...">` links — they're meant to be invisible
  // signals that fire a FILE_PREVIEW_REQUEST event from the useEffect below.
  const renderedContent = useMemo(() => {
    if (text == null) return '';
    const PREVIEW_OPEN = 'PREVIEWxOPENx';
    const PREVIEW_CLOSE = 'xCLOSExPREVIEW';
    let escaped = String(text).replace(
      /<preview:([^>\s]+?)>/g,
      `${PREVIEW_OPEN}$1${PREVIEW_CLOSE}`,
    );
    escaped = escapeRoleplayTags(escaped);
    const rawHtml = marked.parse(escaped, { breaks: true, gfm: true });
    const sanitized = DOMPurify.sanitize(rawHtml);
    const restored = sanitized.replace(
      new RegExp(`${PREVIEW_OPEN}([\\s\\S]+?)${PREVIEW_CLOSE}`, 'g'),
      '&lt;preview:$1&gt;',
    );
    return restoreRoleplayHtml(restored);
  }, [text]);

  // Replace [[wiki:slug]] and [[doc:path]] tokens with clickable icon-only
  // chips. Same logic as ChatMessage.jsx but applied here because timeline
  // text chunks render through this component, not the parent's contentRef.
  useEffect(() => {
    applyCitationChips(contentRef.current, currentProject);
  }, [renderedContent, currentProject]);

  // Strip `<preview:path>` tokens from rendered text and fire
  // FILE_PREVIEW_REQUEST per unique path. Mirrors ChatMessage.jsx behaviour
  // so streaming-interleaved text segments (the path used after MCP tool
  // calls) get the same hide-and-open-in-preview-pane treatment as the
  // assistant's final message — without this, the agent's
  // `<preview:out/simulators/...>` tag was rendering as an autolinked
  // hyperlink instead of opening LiveHTMLPreview.
  useEffect(() => {
    if (!contentRef.current || !currentProject) return;
    const previewRegex = /<preview:([^>\s]+?)>/g;
    const root = contentRef.current;
    const fired = new Set();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach((node) => {
      const t = node.textContent;
      if (!t || !t.includes('<preview:')) return;
      let m;
      while ((m = previewRegex.exec(t)) !== null) {
        if (!fired.has(m[1])) fired.add(m[1]);
      }
      node.textContent = t.replace(previewRegex, '');
    });

    if (fired.size === 0) {
      const html = root.innerHTML;
      const matches = [...html.matchAll(previewRegex)];
      matches.forEach((m) => fired.add(m[1]));
    }

    const paths = [...fired];
    if (paths.length === 0) return;
    const filePath = paths[0];
    const ext = filePath.split('.').pop().toLowerCase();
    let action = 'auto-preview';
    if (ext === 'json') action = 'json-preview';
    else if (ext === 'md' || ext === 'markdown') action = 'markdown-preview';
    else if (ext === 'html' || ext === 'htm') action = 'html-preview';
    else if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) action = 'image-preview';
    else if (['xlsx', 'xls', 'csv'].includes(ext)) action = 'excel-preview';
    else if (ext === 'pdf') action = 'pdf-preview';
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      action,
      filePath,
      projectName: currentProject,
    });
  }, [renderedContent, currentProject]);

  // Resolve roleplay banner image placeholders to blob URLs (auth-aware).
  useEffect(() => {
    return attachRoleplayBannerImages(contentRef.current, currentProject);
  }, [renderedContent, currentProject]);

  return (
    <Box sx={{ mb: 2, position: 'relative' }}>
      {/* Timeline connector line - always show */}
      <Box
        sx={{
          position: 'absolute',
          left: '0px',
          top: showBullet ? '24px' : '0px',
          bottom: '-16px',
          width: '1px',
          backgroundColor: themeMode === 'dark' ? '#ccc' : '#e0e0e0'
        }}
      />

      {/* Timeline point */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        {showBullet && (
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              minHeight: '6px',
              maxHeight: '6px',
              minWidth: '6px',
              maxWidth: '6px',
              borderRadius: '50%',
              backgroundColor: themeMode === 'dark' ? '#fff' : '#000',
              zIndex: 1,
              flexShrink: 0,
              flexGrow: 0,
              ml: '-3px',
              mt: '8px',
              aspectRatio: '1 / 1'
            }}
          />
        )}

        {/* Text content */}
        <Box
          ref={contentRef}
          sx={{
            flex: 1,
            ml: showBullet ? 0 : '10px',
            fontFamily: 'Roboto',
            fontSize: '14px',
            wordBreak: 'break-word',
            color: themeMode === 'dark' ? '#cccccc' : 'inherit',
            '& p': { margin: '0 0 0.5em 0' },
            '& p:last-child': { marginBottom: 0 },
            '& ul, & ol': { marginLeft: 0, paddingLeft: '1.2em', marginTop: '0.5em', marginBottom: '0.5em' },
            '& li': { marginTop: '0.25em', marginBottom: 0 },
            '& h1, & h2, & h3': { marginTop: '0.5em', marginBottom: '0.5em' },
            '& code': {
              backgroundColor: 'rgba(0,0,0,0.05)',
              padding: '0.1em 0.3em',
              borderRadius: '3px',
              fontFamily: 'monospace',
              fontSize: '0.9em'
            },
            '& pre': {
              backgroundColor: 'rgba(0,0,0,0.05)',
              padding: '0.75em',
              borderRadius: '4px',
              overflow: 'auto',
              marginTop: '0.5em',
              marginBottom: '0.5em'
            },
            '& pre code': {
              backgroundColor: 'transparent',
              padding: 0
            },
            '& strong': { fontWeight: 'bold' },
            '& em': { fontStyle: 'italic' },
            '& a': { color: '#1976d2', textDecoration: 'underline' },
            '& table': {
              borderCollapse: 'collapse',
              border: '1px solid #ccc',
              marginTop: '0.5em',
              marginBottom: '0.5em',
              width: '100%'
            },
            '& th, & td': {
              border: '1px solid #ccc',
              padding: '6px',
              textAlign: 'left'
            },
            '& th': {
              backgroundColor: 'rgba(0,0,0,0.03)'
            },
            '& td': {
              backgroundColor: themeMode === 'dark' ? 'transparent' : '#fff'
            },
            ...roleplayStyles(themeMode),
          }}
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      </Box>
    </Box>
  );
}
