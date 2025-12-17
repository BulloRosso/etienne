import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Box, Typography, Paper, IconButton, Collapse, Chip } from '@mui/material';
import { ExpandMore, ExpandLess, Label, ThumbUp, ThumbDown } from '@mui/icons-material';
import TokenConsumptionPane from './TokenConsumptionPane.tsx';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import StreamingTimeline from './StreamingTimeline';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { useProject } from '../contexts/ProjectContext';

export default function ChatMessage({ role, text, timestamp, usage, contextName, reasoningSteps = [], planApprovalState = {}, onPlanApprove, onPlanReject, isStreaming = false, spanId = null }) {
  const isUser = role === 'user';
  const [tokenPaneExpanded, setTokenPaneExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'up', 'down', or null
  const [feedbackSending, setFeedbackSending] = useState(false);
  const { currentProject } = useProject();
  const contentRef = useRef(null);
  const streamStartTimeRef = useRef(null);

  // Handle feedback submission
  const handleFeedback = async (type) => {
    if (!spanId || feedbackSending) return;

    setFeedbackSending(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spanId, feedback: type }),
      });

      if (response.ok) {
        setFeedback(type);
      } else {
        console.error('Failed to submit feedback:', await response.text());
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setFeedbackSending(false);
    }
  };

  // Track elapsed time during streaming
  useEffect(() => {
    if (isStreaming) {
      // Start tracking time
      if (!streamStartTimeRef.current) {
        streamStartTimeRef.current = Date.now();
      }

      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - streamStartTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      // Reset when streaming stops
      streamStartTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isStreaming]);

  // Format elapsed time as "Xs" or "Xm Ys"
  const formatElapsedTime = (seconds) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Parse markdown for all messages
  const renderedContent = useMemo(() => {
    const rawHtml = marked.parse(text, { breaks: true, gfm: true });
    return DOMPurify.sanitize(rawHtml);
  }, [text]);

  // Make file paths in the content clickable
  useEffect(() => {
    if (isUser || !contentRef.current || !currentProject) return;

    // File path patterns to detect (common extensions)
    const fileExtensions = /\.(js|jsx|ts|tsx|py|java|cpp|c|h|hpp|css|scss|html|xml|json|md|txt|yml|yaml|sh|bat|sql|go|rs|php|rb|swift|kt|cs|r|m|mm|f|f90|pl|lua|vim|toml|ini|cfg|conf|log|csv|png|jpg|jpeg|gif|svg|pdf|docx|xlsx|pptx|zip|tar|gz|ipynb|mermaid)$/i;

    // Find all text nodes in the rendered content
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToProcess = [];
    let node;
    while ((node = walker.nextNode())) {
      nodesToProcess.push(node);
    }

    nodesToProcess.forEach((textNode) => {
      const text = textNode.textContent;
      // Match file paths (basic pattern: something/something.ext or ./something.ext)
      const pathRegex = /(?:\.\/|(?:[a-zA-Z0-9_-]+\/)+)?[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g;
      const matches = [...text.matchAll(pathRegex)];

      if (matches.length > 0) {
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        matches.forEach((match) => {
          const filePath = match[0];

          // Check if it looks like a file path with a valid extension
          if (fileExtensions.test(filePath)) {
            // Add text before the match
            if (match.index > lastIndex) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex, match.index))
              );
            }

            // Create clickable link
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = filePath;
            link.style.color = '#1976d2';
            link.style.textDecoration = 'none';
            link.style.cursor = 'pointer';

            link.onclick = (e) => {
              e.preventDefault();

              // Determine the action based on file extension
              const ext = filePath.split('.').pop().toLowerCase();
              let action = 'html-preview'; // default

              if (['json'].includes(ext)) {
                action = 'json-preview';
              } else if (['md', 'markdown'].includes(ext)) {
                action = 'markdown-preview';
              } else if (['mermaid'].includes(ext)) {
                action = 'mermaid-preview';
              } else if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
                action = 'image-preview';
              } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
                action = 'excel-preview';
              } else if (['html', 'htm'].includes(ext)) {
                action = 'html-preview';
              }

              // Emit file preview request
              claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
                action,
                filePath,
                projectName: currentProject
              });
            };

            fragment.appendChild(link);
            lastIndex = match.index + filePath.length;
          }
        });

        // Add remaining text
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }

        // Replace the text node with the fragment
        if (fragment.childNodes.length > 0) {
          textNode.parentNode.replaceChild(fragment, textNode);
        }
      }
    });
  }, [renderedContent, isUser, currentProject]);

  // User messages - render with bubble
  if (isUser) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'flex-start',
        mb: 2,
        px: 2
      }}>
        <Box sx={{ maxWidth: '70%' }}>
          <Paper
            elevation={2}
            sx={{
              p: 2,
              backgroundColor: '#fff',
              borderRadius: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <Box
              sx={{
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
                '& a': { color: '#1976d2', textDecoration: 'none' },
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
                  backgroundColor: '#fff'
                }
              }}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
            {contextName && (
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip
                  icon={<Label sx={{ fontSize: '14px' }} />}
                  label={contextName}
                  size="small"
                  sx={{
                    height: '20px',
                    fontSize: '0.7rem',
                    backgroundColor: '#e3f2fd',
                    color: '#1565c0',
                    '& .MuiChip-icon': { fontSize: '14px', color: '#1565c0' }
                  }}
                />
              </Box>
            )}
          </Paper>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 0.5,
              ml: '10px',
              color: '#999',
              fontSize: '11px',
              textAlign: 'left'
            }}
          >
            {timestamp}
          </Typography>
        </Box>
      </Box>
    );
  }

  // Assistant messages - render WITHOUT bubble, with 40px left margin
  // Check if we have reasoning steps with text chunks for timeline format
  const textChunks = reasoningSteps.filter(step => step.type === 'text_chunk');
  const useTimelineFormat = reasoningSteps.length > 0 && textChunks.length > 0;

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'flex-start',
      mb: 2,
      px: 2
    }}>
      <Box sx={{ width: '100%' }}>
        {/* Timeline format: use StreamingTimeline for unified rendering */}
        {useTimelineFormat && (
          <StreamingTimeline
            items={reasoningSteps}
            planApprovalState={planApprovalState}
            onPlanApprove={onPlanApprove}
            onPlanReject={onPlanReject}
          />
        )}

        {/* Non-timeline format: just show text normally */}
        {!useTimelineFormat && text && (
          <Box
            ref={contentRef}
            sx={{
              fontFamily: 'Roboto',
              fontSize: '14px',
              wordBreak: 'break-word',
              mb: 2,
              pl: '40px',
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
              '& a': { color: '#1976d2', textDecoration: 'none' },
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
                backgroundColor: '#fff'
              }
            }}
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        )}

        {/* Token consumption pane - moved to bottom */}
        {usage && (
          <Box sx={{ mt: 2, mb: 1, pl: '40px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              {/* Left side: Costs label + expand button */}
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
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

              {/* Right side: Feedback buttons (only if spanId available and not streaming) */}
              {spanId && !isStreaming && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback('up')}
                    disabled={feedbackSending}
                    sx={{
                      p: 0.5,
                      color: feedback === 'up' ? '#4caf50' : '#999',
                      '&:hover': { color: feedback === 'up' ? '#4caf50' : '#666' }
                    }}
                    title="Good response"
                  >
                    <ThumbUp sx={{ fontSize: '16px' }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback('down')}
                    disabled={feedbackSending}
                    sx={{
                      p: 0.5,
                      color: feedback === 'down' ? '#f44336' : '#999',
                      '&:hover': { color: feedback === 'down' ? '#f44336' : '#666' }
                    }}
                    title="Poor response"
                  >
                    <ThumbDown sx={{ fontSize: '16px' }} />
                  </IconButton>
                </Box>
              )}
            </Box>
            <Collapse in={tokenPaneExpanded}>
              <TokenConsumptionPane usage={usage} />
            </Collapse>
          </Box>
        )}

        {/* Timestamp - show elapsed time during streaming, actual time after */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.5,
            pl: '40px',
            color: isStreaming ? '#2196f3' : '#999',
            fontSize: '11px',
            textAlign: 'left',
            fontWeight: isStreaming ? 500 : 400
          }}
        >
          {isStreaming ? `Elapsed: ${formatElapsedTime(elapsedSeconds)}` : timestamp}
        </Typography>
      </Box>
    </Box>
  );
}
