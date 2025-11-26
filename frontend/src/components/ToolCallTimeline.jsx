import React, { useState } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import FolderIcon from '@mui/icons-material/Folder';
import CodeIcon from '@mui/icons-material/Code';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

// Tool icon mapping
const TOOL_ICONS = {
  'TodoWrite': ContentPasteOutlinedIcon,
  'Read': RemoveRedEyeOutlinedIcon,
  'Edit': EditOutlinedIcon,
  'Write': EditOutlinedIcon,
  'WebSearch': SearchOutlinedIcon,
  'WebFetch': CloudDownloadOutlinedIcon,
  'Bash': TerminalIcon,
  'Glob': FolderIcon,
  'Grep': SearchOutlinedIcon,
  'NotebookEdit': CodeIcon,
};

/**
 * Formats tool arguments into a readable description
 */
const formatToolDescription = (toolName, args) => {
  if (!args) return '';

  // For Bash, use the description parameter if available
  if (toolName === 'Bash' && args.description) {
    return args.description;
  }

  switch (toolName) {
    case 'Bash':
      return args.command || '';
    case 'Read':
    case 'Write':
    case 'Edit':
      return args.file_path || args.path || '';
    case 'WebSearch':
      return args.query || '';
    case 'WebFetch':
      return args.url || '';
    case 'Glob':
      return args.pattern || '';
    case 'Grep':
      return args.pattern || '';
    case 'TodoWrite':
      return 'Update task list';
    default:
      return JSON.stringify(args).substring(0, 100);
  }
};

/**
 * Formats tool input/output for display
 */
const formatToolIO = (data) => {
  if (!data) return '';

  if (typeof data === 'string') {
    return data;
  }

  return JSON.stringify(data, null, 2);
};

/**
 * Gets the first N lines of text
 */
const getFirstLines = (text, numLines = 3) => {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= numLines) {
    return text;
  }
  return lines.slice(0, numLines).join('\n');
};

/**
 * Tool call displayed in timeline format with IN/OUT sections
 */
export default function ToolCallTimeline({ toolName, args, result, description, showBullet = true }) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [inExpanded, setInExpanded] = useState(false);
  const [outExpanded, setOutExpanded] = useState(false);

  const IconComponent = TOOL_ICONS[toolName];
  const toolDescription = description || formatToolDescription(toolName, args);

  const formattedInput = formatToolIO(args);
  const formattedOutput = formatToolIO(result);

  const inputLines = formattedInput.split('\n');
  const outputLines = formattedOutput.split('\n');

  const hasMoreInput = inputLines.length > 3;
  const hasMoreOutput = outputLines.length > 3;

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

      {/* Tool header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {/* Timeline point */}
        {showBullet && (
          <Box
            sx={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#4caf50',
              zIndex: 1,
              flexShrink: 0,
              mt: 0.5,
              ml: '-3px'
            }}
          />
        )}

        {/* Tool icon */}
        {IconComponent && (
          <IconComponent sx={{ fontSize: '18px', color: '#666', flexShrink: 0 }} />
        )}

        {/* Tool name */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 'bold',
            color: '#333',
            fontFamily: 'monospace',
            flexShrink: 0,
            ml: !showBullet && !IconComponent ? '3px' : 0
          }}
        >
          {toolName}
        </Typography>

        {/* Description */}
        {toolDescription && (
          <Typography
            variant="body2"
            sx={{
              color: '#666',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {toolDescription}
          </Typography>
        )}

        {/* Expand/Collapse details button */}
        <IconButton
          size="small"
          onClick={() => setDetailsExpanded(!detailsExpanded)}
          sx={{ p: 0.25 }}
        >
          {detailsExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* IN/OUT section - collapsible */}
      {detailsExpanded && (
        <Box
          sx={{
            ml: '28px',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            overflow: 'hidden'
          }}
        >
        {/* IN section */}
        {args && (
          <Box sx={{ borderBottom: result ? '1px solid #e0e0e0' : 'none' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 0.5,
                pl: 1,
                pr: 0.5,
                backgroundColor: '#f5f5f5'
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 'bold',
                  color: '#666',
                  fontSize: '0.7rem'
                }}
              >
                IN
              </Typography>
              {hasMoreInput && (
                <IconButton
                  size="small"
                  onClick={() => setInExpanded(!inExpanded)}
                  sx={{ p: 0.25 }}
                >
                  {inExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              )}
            </Box>
            <Box
              sx={{
                p: 1,
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: '#fafafa',
                maxHeight: inExpanded ? 'none' : '80px',
                overflow: inExpanded ? 'auto' : 'hidden'
              }}
            >
              {inExpanded ? formattedInput : getFirstLines(formattedInput, 3)}
            </Box>
          </Box>
        )}

        {/* OUT section */}
        {result && (
          <Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 0.5,
                pl: 1,
                pr: 0.5,
                backgroundColor: '#f5f5f5'
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 'bold',
                  color: '#666',
                  fontSize: '0.7rem'
                }}
              >
                OUT
              </Typography>
              {hasMoreOutput && (
                <IconButton
                  size="small"
                  onClick={() => setOutExpanded(!outExpanded)}
                  sx={{ p: 0.25 }}
                >
                  {outExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              )}
            </Box>
            <Box
              sx={{
                p: 1,
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: '#fafafa',
                maxHeight: outExpanded ? 'none' : '80px',
                overflow: outExpanded ? 'auto' : 'hidden'
              }}
            >
              {outExpanded ? formattedOutput : getFirstLines(formattedOutput, 3)}
            </Box>
          </Box>
        )}
        </Box>
      )}
    </Box>
  );
}
