import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ToolCallTimeline from './ToolCallTimeline';
import TextSegmentTimeline from './TextSegmentTimeline';
import TodoWriteTimeline from './TodoWriteTimeline';
import McpAppRenderer from './McpAppRenderer';
import useMcpAppMeta from '../hooks/useMcpAppMeta';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

/**
 * Unified timeline component that renders a sequence of text chunks, tool calls, and TodoWrite
 * in chronological order. Works identically during streaming and after completion.
 *
 * @param {Array} items - Array of reasoning steps (text_chunk and tool_call types)
 */
export default function StreamingTimeline({
  items = []
}) {
  const mcpAppMeta = useMcpAppMeta();
  const { mode: themeMode } = useThemeMode();

  // Process items into timeline format
  const timelineItems = useMemo(() => {
    // Separate by type
    const textChunks = items.filter(item => item.type === 'text_chunk');
    const toolSteps = items.filter(item => item.type === 'tool_call');

    // Filter out ExitPlanMode and AskUserQuestion - both handled via modal dialogs, not timeline
    const otherTools = toolSteps.filter(item =>
      item.toolName !== 'ExitPlanMode' && item.toolName !== 'AskUserQuestion'
    );

    // Only keep the last TodoWrite - each call contains the full todo list,
    // so earlier ones are superseded and should be removed from the timeline
    const lastTodoWriteId = (() => {
      const todoWrites = otherTools.filter(item => item.toolName === 'TodoWrite');
      if (todoWrites.length <= 1) return null;
      const sorted = [...todoWrites].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return sorted[sorted.length - 1].id;
    })();
    const filteredTools = lastTodoWriteId
      ? otherTools.filter(item => item.toolName !== 'TodoWrite' || item.id === lastTodoWriteId)
      : otherTools;

    // Merge consecutive text chunks into continuous text segments
    // Text chunks between tool calls are merged together regardless of timestamp
    // This ensures proper rendering both during streaming and after session restore
    const textSegments = [];

    if (textChunks.length > 0) {
      // Sort text chunks by timestamp first
      const sortedTextChunks = [...textChunks].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Find timestamps where tool calls occur to split text segments
      const toolTimestamps = filteredTools.map(t => t.timestamp || 0).sort((a, b) => a - b);

      let currentSegment = {
        type: 'text',
        content: '',
        timestamp: sortedTextChunks[0].timestamp,
        lastTimestamp: sortedTextChunks[0].timestamp,
        key: `text-${sortedTextChunks[0].timestamp}`
      };

      sortedTextChunks.forEach(chunk => {
        // Check if there's a tool call between the last chunk and this one
        const hasToolBetween = toolTimestamps.some(
          toolTime => toolTime > currentSegment.lastTimestamp && toolTime < chunk.timestamp
        );

        if (hasToolBetween && currentSegment.content) {
          // Save current segment and start a new one
          textSegments.push(currentSegment);
          currentSegment = {
            type: 'text',
            content: chunk.content,
            timestamp: chunk.timestamp,
            lastTimestamp: chunk.timestamp,
            key: `text-${chunk.timestamp}`
          };
        } else {
          // Append to current segment
          if (!currentSegment.content) {
            currentSegment.timestamp = chunk.timestamp;
            currentSegment.key = `text-${chunk.timestamp}`;
            currentSegment.content = chunk.content;
          } else {
            // Concatenate chunks directly without separators
            // The chunks are already properly split during streaming and contain
            // their own whitespace/newlines - adding separators breaks markdown tables
            currentSegment.content += chunk.content;
          }
          currentSegment.lastTimestamp = chunk.timestamp;
        }
      });

      // Don't forget the last segment
      if (currentSegment.content) {
        textSegments.push(currentSegment);
      }
    }

    // Collect thinking items
    const thinkingItems = items.filter(item => item.type === 'thinking');

    // Merge text segments, tool calls, and thinking items, sorted by timestamp
    const allItems = [
      ...textSegments.map(seg => ({ ...seg, sortTime: seg.timestamp })),
      ...filteredTools.map(tool => ({
        type: 'tool',
        content: tool,
        sortTime: tool.timestamp || 0,
        key: `tool-${tool.id || tool.timestamp}`
      })),
      ...thinkingItems.map(item => ({
        type: 'thinking',
        content: item.content,
        sortTime: item.timestamp || 0,
        key: `thinking-${item.id || item.timestamp}`
      }))
    ].sort((a, b) => a.sortTime - b.sortTime);

    return allItems;
  }, [items]);

  if (timelineItems.length === 0) {
    return null;
  }

  return (
    <Box sx={{ width: '100%', pl: '40px' }}>
      {/* Regular timeline items */}
      {timelineItems.map((item, idx) => {
        // Determine if we should show a bullet point
        // - Always show bullet for tool calls (each tool gets its own bullet)
        // - For text segments, only show bullet on type transitions (text after tool)
        const prevItem = idx > 0 ? timelineItems[idx - 1] : null;
        const showBullet = item.type === 'tool' || !prevItem || prevItem.type !== item.type;

        if (item.type === 'text') {
          return (
            <TextSegmentTimeline
              key={item.key}
              text={item.content}
              showBullet={showBullet}
            />
          );
        } else if (item.type === 'thinking') {
          return (
            <ThinkingTimeline
              key={item.key}
              content={item.content}
              showBullet={showBullet}
            />
          );
        } else if (item.content.toolName === 'TodoWrite') {
          // Render TodoWrite with dedicated timeline component
          return (
            <TodoWriteTimeline
              key={item.key}
              args={item.content.args}
              showBullet={showBullet}
            />
          );
        } else {
          // Check if this tool has an MCP App UI
          const appMeta = mcpAppMeta.get(item.content.toolName);
          if (appMeta && item.content.result) {
            return (
              <Box key={item.key} sx={{ mb: 2, position: 'relative' }}>
                {/* Timeline connector line spanning tool + MCP App */}
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
                <ToolCallTimeline
                  toolName={item.content.toolName}
                  args={item.content.args}
                  result={item.content.result}
                  description={item.content.description}
                  showBullet={showBullet}
                  hideConnectorLine
                />
                <Box sx={{ ml: showBullet ? '28px' : '38px', mt: 1, overflow: 'hidden' }}>
                  <McpAppRenderer
                    mcpGroup={appMeta.group}
                    toolName={item.content.toolName}
                    resourceUri={appMeta.resourceUri}
                    toolInput={item.content.args}
                    toolResult={item.content.result}
                  />
                </Box>
              </Box>
            );
          }

          return (
            <ToolCallTimeline
              key={item.key}
              toolName={item.content.toolName}
              args={item.content.args}
              result={item.content.result}
              description={item.content.description}
              showBullet={showBullet}
            />
          );
        }
      })}

    </Box>
  );
}

/**
 * Inline thinking/reasoning display for timeline
 */
function ThinkingTimeline({ content, showBullet = true }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();

  return (
    <Box sx={{ mb: 2, position: 'relative' }}>
      {/* Timeline connector line */}
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
              backgroundColor: '#1976d2',
              zIndex: 1,
              flexShrink: 0,
              flexGrow: 0,
              ml: '-3px',
              mt: '8px',
              aspectRatio: '1 / 1'
            }}
          />
        )}
        <Box
          sx={{
            flex: 1,
            ml: showBullet ? 0 : '10px',
          }}
        >
          <Typography variant="caption" sx={{ color: '#1976d2', fontWeight: 600, display: 'block', mb: 0.5 }}>
            {t('streamingTimeline.thinking')}
          </Typography>
          <Box
            sx={{
              color: themeMode === 'dark' ? '#aaa' : '#555',
              fontSize: '13px',
              fontFamily: 'Roboto',
              wordBreak: 'break-word',
              '& p': { margin: '0 0 0.5em 0' },
              '& p:last-child': { marginBottom: 0 },
              '& ul, & ol': { marginLeft: 0, paddingLeft: '1.2em', marginTop: '0.5em', marginBottom: '0.5em' },
              '& li': { marginTop: '0.25em', marginBottom: 0 },
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
              '& pre code': { backgroundColor: 'transparent', padding: 0 },
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(content, { breaks: true, gfm: true })) }}
          />
        </Box>
      </Box>
    </Box>
  );
}
