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
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { useProject } from '../contexts/ProjectContext';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

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
 * Strips the workspace/project path prefix from a file path to get relative path
 * Returns null if the path is not within the workspace (e.g., ~/.claude/plans/)
 * Examples:
 * - C:\Data\GitHub\claude-multitenant\workspace\project-name\src\file.txt -> src/file.txt
 * - /workspace/project-name/src/file.txt -> src/file.txt
 * - C:\Users\ralph\.claude\plans\file.md -> null (not in workspace)
 */
const stripWorkspacePath = (filePath) => {
  if (!filePath) return null;

  // Normalize path separators for consistent matching
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Match workspace/<project-name>/ prefix (Unix or normalized Windows)
  const workspacePattern = /^.*\/workspace\/[^/]+\//;
  const match = normalizedPath.match(workspacePattern);
  if (match) {
    return normalizedPath.substring(match[0].length);
  }

  // Path is not in workspace - return null to indicate non-clickable
  return null;
};

/**
 * Gets a display-friendly version of a file path (for non-workspace files)
 */
const getDisplayPath = (filePath) => {
  if (!filePath) return '';

  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  // Return last 2-3 path segments for context
  if (parts.length > 1) {
    return parts.slice(-Math.min(3, parts.length)).join('/');
  }

  return filePath;
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
      // Return the full path for file tools - we'll strip it when rendering
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
    case 'Task':
      return args.description || '';
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
export default function ToolCallTimeline({ toolName, args, result, description, showBullet = true, hideConnectorLine = false }) {
  const { t } = useTranslation();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [inExpanded, setInExpanded] = useState(false);
  const [outExpanded, setOutExpanded] = useState(false);
  const { currentProject } = useProject();
  const { mode: themeMode } = useThemeMode();

  const IconComponent = TOOL_ICONS[toolName];
  const toolDescription = description || formatToolDescription(toolName, args);

  const formattedInput = formatToolIO(args);
  const formattedOutput = formatToolIO(result);

  // Check if this is a file system tool with a file path
  const isFileSystemTool = ['Read', 'Write', 'Edit'].includes(toolName);
  const filePath = isFileSystemTool ? (args?.file_path || args?.path) : null;

  // Get workspace-relative path (null if not in workspace)
  const workspaceRelativePath = filePath ? stripWorkspacePath(filePath) : null;
  // Get display path (always returns something for display)
  const displayPath = filePath ? (workspaceRelativePath || getDisplayPath(filePath)) : null;
  // File is clickable only if it's in the workspace
  const isClickable = !!workspaceRelativePath;

  const inputLines = formattedInput.split('\n');
  const outputLines = formattedOutput.split('\n');

  const hasMoreInput = inputLines.length > 3;
  const hasMoreOutput = outputLines.length > 3;

  // Handle file preview click (only for workspace files)
  const handleFileClick = (e) => {
    e.preventDefault();
    if (!workspaceRelativePath || !currentProject) return;

    // Determine the action based on file extension
    const ext = workspaceRelativePath.split('.').pop().toLowerCase();
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

    // Emit file preview request with workspace-relative path
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      action,
      filePath: workspaceRelativePath,
      projectName: currentProject
    });
  };

  return (
    <Box sx={{ mb: 2, position: 'relative' }}>
      {/* Timeline connector line - hidden when parent provides its own */}
      {!hideConnectorLine && (
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
      )}

      {/* Tool header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ml: showBullet ? 0 : '10px' }}>
        {/* Timeline point */}
        {showBullet && (
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: themeMode === 'dark' ? '#fff' : '#4caf50',
              zIndex: 1,
              flexShrink: 0,
              flexGrow: 0,
              ml: '-3px',
              aspectRatio: '1 / 1'
            }}
          />
        )}

        {/* Tool icon */}
        {IconComponent && (
          <IconComponent sx={{ fontSize: '18px', color: themeMode === 'dark' ? '#ccc' : '#666', flexShrink: 0 }} />
        )}

        {/* Tool name */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 'bold',
            color: themeMode === 'dark' ? '#fff' : '#333',
            fontFamily: 'monospace',
            flexShrink: 0
          }}
        >
          {toolName}
        </Typography>

        {/* Description */}
        {toolDescription && (
          isFileSystemTool && displayPath ? (
            isClickable ? (
              <Typography
                component="a"
                href="#"
                onClick={handleFileClick}
                variant="body2"
                sx={{
                  color: '#1976d2',
                  textDecoration: 'underline',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  '&:hover': {
                    color: '#1565c0'
                  }
                }}
              >
                {displayPath}
              </Typography>
            ) : (
              <Typography
                variant="body2"
                sx={{
                  color: themeMode === 'dark' ? '#ccc' : '#666',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {displayPath}
              </Typography>
            )
          ) : (
            <Typography
              variant="body2"
              sx={{
                color: themeMode === 'dark' ? '#ccc' : '#666',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {toolDescription}
            </Typography>
          )
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
            ml: showBullet ? '28px' : '38px',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            overflow: 'hidden'
          }}
        >
        {/* IN section */}
        {args && (
          <Box sx={{ borderBottom: result ? `1px solid ${themeMode === 'dark' ? '#555' : '#e0e0e0'}` : 'none' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 0.5,
                pl: 1,
                pr: 0.5,
                backgroundColor: themeMode === 'dark' ? '#383838' : '#f5f5f5'
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 'bold',
                  color: themeMode === 'dark' ? '#ccc' : '#666',
                  fontSize: '0.7rem'
                }}
              >
                {t('toolCallTimeline.in')}
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
                backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#fafafa',
                color: themeMode === 'dark' ? '#ccc' : 'inherit',
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
                backgroundColor: themeMode === 'dark' ? '#383838' : '#f5f5f5'
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 'bold',
                  color: themeMode === 'dark' ? '#ccc' : '#666',
                  fontSize: '0.7rem'
                }}
              >
                {t('toolCallTimeline.out')}
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
                backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#fafafa',
                color: themeMode === 'dark' ? '#ccc' : 'inherit',
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
