import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Box, Typography, Paper, IconButton, Collapse, Chip } from '@mui/material';
import { ExpandMore, ExpandLess, Label } from '@mui/icons-material';
import TokenConsumptionPane from './TokenConsumptionPane.tsx';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ToolCallTimeline from './ToolCallTimeline';
import TextSegmentTimeline from './TextSegmentTimeline';
import { TodoListDisplay } from './StructuredMessage';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { useProject } from '../contexts/ProjectContext';

export default function ChatMessage({ role, text, timestamp, usage, contextName, reasoningSteps = [] }) {
  const isUser = role === 'user';
  const [tokenPaneExpanded, setTokenPaneExpanded] = useState(false);
  const { currentProject } = useProject();
  const contentRef = useRef(null);

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
  // Merge text chunks and tool calls by timestamp

  // Separate TodoWrite from other items
  const todoWriteSteps = reasoningSteps.filter(step => step.toolName === 'TodoWrite');
  const textChunks = reasoningSteps.filter(step => step.type === 'text_chunk');
  const toolSteps = reasoningSteps.filter(step => step.type === 'tool_call');

  // Merge text chunks into continuous text segments based on temporal proximity
  // Group text chunks that are close together (within 100ms) into single text blocks
  const textSegments = [];
  let currentSegment = null;

  textChunks.forEach(chunk => {
    if (!currentSegment || (chunk.timestamp - currentSegment.lastTimestamp > 100)) {
      // Start new segment
      currentSegment = {
        type: 'text',
        content: chunk.content,
        timestamp: chunk.timestamp,
        lastTimestamp: chunk.timestamp
      };
      textSegments.push(currentSegment);
    } else {
      // Append to current segment
      currentSegment.content += chunk.content;
      currentSegment.lastTimestamp = chunk.timestamp;
    }
  });

  // Merge text segments and tool calls, sorted by timestamp
  const allItems = [
    ...textSegments.map(seg => ({ ...seg, type: 'text', sortTime: seg.timestamp })),
    ...toolSteps.map(tool => ({ ...tool, type: 'tool', sortTime: tool.timestamp || 0 }))
  ].sort((a, b) => a.sortTime - b.sortTime);

  // Debug: log the sorted timeline
  if (allItems.length > 0) {
    console.log('Timeline items sorted:', allItems.map(item => ({
      type: item.type,
      timestamp: item.sortTime,
      preview: item.type === 'text' ? item.content.substring(0, 30) : item.toolName
    })));
  }

  // Create timeline items
  const timelineItems = allItems.map((item, idx) => ({
    type: item.type,
    content: item.type === 'text' ? item.content : item,
    key: item.type === 'text' ? `text-${item.timestamp}-${idx}` : `tool-${item.id || idx}`
  }));

  // Use timeline format only when we have both text chunks AND tool calls
  // If we only have tool calls, we still want to show the original text
  const useTimelineFormat = timelineItems.length > 0 && textChunks.length > 0;

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'flex-start',
      mb: 2,
      px: 2
    }}>
      <Box sx={{ width: '100%', pl: '40px' }}>
        {/* Always visible TodoWrite section */}
        {todoWriteSteps.length > 0 && (
          <Box sx={{ mb: 2 }}>
            {todoWriteSteps.map((step, idx) => {
              const todos = step.args?.todos || step.args?.newTodos || step.args?.oldTodos;
              return (
                <TodoListDisplay key={step.id || idx} todos={todos} />
              );
            })}
          </Box>
        )}

        {/* Timeline format: interleaved text and tool calls */}
        {useTimelineFormat && timelineItems.map((item, idx) => {
          // Determine if we should show a bullet point (only on type transitions)
          const prevItem = idx > 0 ? timelineItems[idx - 1] : null;
          const showBullet = !prevItem || prevItem.type !== item.type;

          return item.type === 'text' ? (
            <TextSegmentTimeline key={item.key} text={item.content} showBullet={showBullet} />
          ) : (
            <ToolCallTimeline
              key={item.key}
              toolName={item.content.toolName}
              args={item.content.args}
              result={item.content.result}
              description={item.content.description}
              showBullet={showBullet}
            />
          );
        })}

        {/* Non-timeline format: just show text normally */}
        {!useTimelineFormat && text && (
          <Box
            ref={contentRef}
            sx={{
              fontFamily: 'Roboto',
              fontSize: '14px',
              wordBreak: 'break-word',
              mb: 2,
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
        )}

        {/* Token consumption pane - moved to bottom */}
        {usage && (
          <Box sx={{ mt: 2, mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', mb: 0.5 }}>
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

        {/* Timestamp */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.5,
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
