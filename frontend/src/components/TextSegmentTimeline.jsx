import React from 'react';
import { Box, Typography } from '@mui/material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Text segment displayed in timeline format (for interleaved text between tool calls)
 */
export default function TextSegmentTimeline({ text, showBullet = true }) {
  // Parse markdown
  const rawHtml = marked.parse(text, { breaks: true, gfm: true });
  const renderedContent = DOMPurify.sanitize(rawHtml);

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
          backgroundColor: '#e0e0e0'
        }}
      />

      {/* Timeline point */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        {showBullet && (
          <Box
            sx={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#000',
              zIndex: 1,
              flexShrink: 0,
              ml: '-3px',
              transform: 'translateY(8px)'
            }}
          />
        )}

        {/* Text content */}
        <Box
          sx={{
            flex: 1,
            ml: showBullet ? 0 : '10px',
            fontFamily: 'Roboto',
            fontSize: '14px',
            wordBreak: 'break-word',
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
              marginBottom: '0.5em'
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
              backgroundColor: '#fff'
            }
          }}
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      </Box>
    </Box>
  );
}
