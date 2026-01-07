import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import ToolCallTimeline from './ToolCallTimeline';
import TextSegmentTimeline from './TextSegmentTimeline';
import TodoWriteTimeline from './TodoWriteTimeline';
import PlanApprovalTimeline from './PlanApprovalTimeline';

/**
 * Unified timeline component that renders a sequence of text chunks, tool calls, and TodoWrite
 * in chronological order. Works identically during streaming and after completion.
 *
 * @param {Array} items - Array of reasoning steps (text_chunk and tool_call types)
 * @param {Function} onPlanApprove - Callback when user approves a plan (ExitPlanMode)
 * @param {Function} onPlanReject - Callback when user rejects a plan
 * @param {Object} planApprovalState - State of plan approvals { [toolId]: 'approved' | 'rejected' }
 */
export default function StreamingTimeline({
  items = [],
  onPlanApprove,
  onPlanReject,
  planApprovalState = {}
}) {
  // Process items into timeline format
  const { timelineItems, exitPlanModeItems } = useMemo(() => {
    // Separate by type
    const textChunks = items.filter(item => item.type === 'text_chunk');
    const toolSteps = items.filter(item => item.type === 'tool_call');

    // Separate ExitPlanMode from other tools (will be rendered at the end)
    // Also filter out AskUserQuestion - it's handled via modal dialog, not timeline
    const exitPlanModeTools = toolSteps.filter(item => item.toolName === 'ExitPlanMode');
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

    // Merge text segments and tool calls (excluding ExitPlanMode), sorted by timestamp
    const allItems = [
      ...textSegments.map(seg => ({ ...seg, sortTime: seg.timestamp })),
      ...otherTools.map(tool => ({
        type: 'tool',
        content: tool,
        sortTime: tool.timestamp || 0,
        key: `tool-${tool.id || tool.timestamp}`
      }))
    ].sort((a, b) => a.sortTime - b.sortTime);

    // ExitPlanMode items to render at the end
    const exitItems = exitPlanModeTools.map(tool => ({
      type: 'tool',
      content: tool,
      sortTime: tool.timestamp || 0,
      key: `tool-${tool.id || tool.timestamp}`
    }));

    return { timelineItems: allItems, exitPlanModeItems: exitItems };
  }, [items]);

  if (timelineItems.length === 0 && exitPlanModeItems.length === 0) {
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

      {/* ExitPlanMode always rendered at the very end */}
      {exitPlanModeItems.map((item) => {
        const toolId = item.content.id || item.key;
        const approvalState = planApprovalState[toolId];
        return (
          <PlanApprovalTimeline
            key={item.key}
            args={item.content.args}
            showBullet={true}
            onApprove={() => onPlanApprove && onPlanApprove(toolId)}
            onReject={() => onPlanReject && onPlanReject(toolId)}
            isApproved={approvalState === 'approved'}
            isRejected={approvalState === 'rejected'}
          />
        );
      })}
    </Box>
  );
}
