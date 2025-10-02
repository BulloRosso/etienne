import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper, IconButton, Collapse } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import TokenConsumptionPane from './TokenConsumptionPane.tsx';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function ChatMessage({ role, text, timestamp, usage }) {
  const isUser = role === 'user';
  const [tokenPaneExpanded, setTokenPaneExpanded] = useState(false);

  // Parse markdown for assistant messages
  const renderedContent = useMemo(() => {
    if (isUser) {
      // User messages: plain text
      return text;
    } else {
      // Assistant messages: parse markdown
      const rawHtml = marked.parse(text, { breaks: true, gfm: true });
      return DOMPurify.sanitize(rawHtml);
    }
  }, [text, isUser]);

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: isUser ? 'flex-start' : 'flex-end',
      mb: 2,
      px: 2
    }}>
      <Box sx={{ maxWidth: '70%' }}>
        <Paper
          elevation={2}
          sx={{
            p: 2,
            pb: isUser || !isUser && !usage ? 2 : 0,
            backgroundColor: isUser ? '#fff' : '#f5f5f5',
            borderRadius: 2,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {isUser ? (
            <Typography
              sx={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'Roboto',
                fontSize: '14px',
                wordBreak: 'break-word'
              }}
            >
              {text}
            </Typography>
          ) : (
            <Box
              sx={{
                fontFamily: 'Roboto',
                fontSize: '14px',
                wordBreak: 'break-word',
                '& p': { margin: '0 0 0.5em 0' },
                '& p:last-child': { marginBottom: 0 },
                '& ul, & ol': { marginLeft: 0, paddingLeft: '1.2em', marginTop: '20px', marginBottom: '20px' },
                '& li': { marginTop: '10px', marginBottom: 0 },
                '& h1, & h2, & h3': { marginTop: '0.75em', marginBottom: '0.5em' },
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
                '& a': { color: '#1976d2', textDecoration: 'underline' }
              }}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          )}
          {usage && !isUser && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#999', fontSize: '11px', mr: 0.5 }}>
                  Costs
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setTokenPaneExpanded(!tokenPaneExpanded)}
                  sx={{ p: 0.5 }}
                >
                  {tokenPaneExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={tokenPaneExpanded}>
                <TokenConsumptionPane usage={usage} />
              </Collapse>
            </Box>
          )}
        </Paper>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.5,
            ml: isUser ? '10px': '0',
            mr: isUser ? '0': '10px',
            color: '#999',
            fontSize: '11px',
            textAlign: isUser ? 'left' : 'right'
          }}
        >
          {timestamp}
        </Typography>
      </Box>
    </Box>
  );
}
