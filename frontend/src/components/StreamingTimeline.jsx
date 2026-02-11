import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import ToolCallTimeline from './ToolCallTimeline';
import TextSegmentTimeline from './TextSegmentTimeline';
import TodoWriteTimeline from './TodoWriteTimeline';

/**
 * Unified timeline component that renders a sequence of text chunks, tool calls, and TodoWrite
 * in chronological order. Works identically during streaming and after completion.
 *
 * @param {Array} items - Array of reasoning steps (text_chunk and tool_call types)
 */
export default function StreamingTimeline({
  items = []
}) {
  // Process items into timeline format
  const timelineItems = useMemo(() => {
    // Separate by type
    const textChunks = items.filter(item => item.type === 'text_chunk');
    const toolSteps = items.filter(item => item.type === 'tool_call');

    // Filter out ExitPlanMode and AskUserQuestion - both handled via modal dialogs, not timeline
    const otherTools = toolSteps.filter(item =>
      item.toolName !== 'ExitPlanMode' && item.toolName !== 'AskUserQuestion'
    );

    // Merge consecutive text chunks into continuous text segments
    // Text chunks between tool calls are merged together regardless of timestamp
    // This ensures proper rendering both during streaming and after session restore
    const textSegments = [];

    if (textChunks.length > 0) {
      // Sort text chunks by timestamp first
      const sortedTextChunks = [...textChunks].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Find timestamps where tool calls occur to split text segments
      const toolTimestamps = otherTools.map(t => t.timestamp || 0).sort((a, b) => a - b);

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

    // Merge text segments and tool calls, sorted by timestamp
    const allItems = [
      ...textSegments.map(seg => ({ ...seg, sortTime: seg.timestamp })),
      ...otherTools.map(tool => ({
        type: 'tool',
        content: tool,
        sortTime: tool.timestamp || 0,
        key: `tool-${tool.id || tool.timestamp}`
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
