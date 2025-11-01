import React, { useState } from 'react';
import { Box, Paper, Typography, Button, Chip, CircularProgress } from '@mui/material';
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import LoopIcon from '@mui/icons-material/Loop';
import { IoHandRightOutline } from 'react-icons/io5';

// Tool icon mapping
const TOOL_ICONS = {
  'TodoWrite': ContentPasteOutlinedIcon,
  'Read': RemoveRedEyeOutlinedIcon,
  'Edit': EditOutlinedIcon,
  'WebSearch': SearchOutlinedIcon,
  'WebFetch': CloudDownloadOutlinedIcon,
  'Bash': TerminalIcon,
};

// TodoList Display Component - shows full todo list with icons
const TodoListDisplay = ({ todos }) => {
  if (!todos || !Array.isArray(todos) || todos.length === 0) {
    return (
      <Box sx={{ mb: 1, px: 2 }}>
        <Paper sx={{ p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: '#999', fontStyle: 'italic' }}>
            No tasks
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1, px: 2 }}>
      <Paper sx={{ p: 2, backgroundColor: '#fafafa', borderRadius: 1, border: '1px solid #e0e0e0' }}>
        {todos.map((todo, index) => {
          const isCompleted = todo.status === 'completed';
          const isInProgress = todo.status === 'in_progress';

          // Choose icon based on status
          let IconComponent;
          let iconColor = '#555';
          let iconSx = { fontSize: '20px' };

          if (isCompleted) {
            IconComponent = CheckBoxOutlinedIcon;
            iconColor = '#999';
          } else if (isInProgress) {
            IconComponent = LoopIcon;
            iconColor = '#2196f3';
            iconSx = { ...iconSx, animation: 'spin 2s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } };
          } else {
            IconComponent = CheckBoxOutlineBlankIcon;
            iconColor = '#555';
          }

          // Text styling based on status
          const textColor = isCompleted ? '#999' : '#333';
          const textDecoration = isCompleted ? 'line-through' : 'none';
          const opacity = isCompleted ? 0.7 : 1;
          const backgroundColor = isInProgress ? '#e3f2fd' : 'transparent';

          // Use activeForm for in_progress, content otherwise
          const displayText = isInProgress ? (todo.activeForm || todo.content) : todo.content;

          return (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 0.75,
                px: 1,
                borderRadius: 1,
                backgroundColor,
                opacity,
                transition: 'background-color 0.2s ease'
              }}
            >
              <IconComponent sx={{ ...iconSx, color: iconColor }} />
              <Typography
                variant="body2"
                sx={{
                  color: textColor,
                  textDecoration,
                  flex: 1,
                  fontSize: '0.9rem'
                }}
              >
                {displayText}
              </Typography>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
};

// Tool call component - compact version
export const ToolCallMessage = ({ toolName, args, status, result }) => {
  // Special handling for TodoWrite
  const formatTodoWriteArgs = (args) => {
    if (!args) return '';

    // Handle both tool_input (todos) and tool_response (newTodos/oldTodos)
    let todos = args.todos || args.newTodos || args.oldTodos;

    if (!todos || !Array.isArray(todos)) return '';

    // Prefer newTodos if available (from tool_response)
    if (args.newTodos) {
      todos = args.newTodos;
    }

    // Find last completed todo
    const completedTodos = todos.filter(t => t.status === 'completed');
    const lastCompleted = completedTodos.length > 0 ? completedTodos[completedTodos.length - 1] : null;

    // Find active (in_progress) todos
    const activeTodos = todos.filter(t => t.status === 'in_progress');

    const displayTodos = [];
    if (lastCompleted) displayTodos.push({ ...lastCompleted, isLast: true });
    displayTodos.push(...activeTodos);

    if (displayTodos.length === 0) return 'No active tasks';

    return displayTodos.map(t => {
      const icon = t.status === 'completed' ? '✓' : '⋯';
      return `${icon} ${t.activeForm || t.content}`;
    }).join(' | ');
  };

  // Format args into a readable string (first 60 chars)
  const formatArgs = (args) => {
    if (!args) return '';

    // Special handling for TodoWrite
    if (toolName === 'TodoWrite') {
      return formatTodoWriteArgs(args);
    }

    let text = '';

    // Try common field patterns
    if (args.url) {
      text = args.url;
    } else if (args.path) {
      text = args.path;
    } else if (args.command) {
      text = args.command;
    } else if (args.prompt) {
      text = args.prompt;
    } else {
      // Fallback to JSON string
      text = JSON.stringify(args);
    }

    // Truncate to 60 characters (not for TodoWrite)
    return text.length > 60 ? text.substring(0, 60) + '...' : text;
  };

  // Special rendering for TodoWrite - use full list display
  if (toolName === 'TodoWrite') {
    const todos = args?.todos || args?.newTodos || args?.oldTodos;
    return <TodoListDisplay todos={todos} />;
  }

  const argsPreview = formatArgs(args);
  const isRunning = status === 'running';

  // Get icon component or use text
  const IconComponent = TOOL_ICONS[toolName];

  return (
    <Box sx={{ mb: 1, px: 2 }}>
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        backgroundColor: isRunning ? '#fff3e0' : '#e8f5e9',
        borderRadius: 1,
        border: '1px solid',
        borderColor: isRunning ? '#ff9800' : '#4caf50'
      }}>
        {isRunning && <CircularProgress size={14} sx={{ color: '#ff9800' }} />}
        {!isRunning && <Typography sx={{ fontSize: '14px' }}>✓</Typography>}

        {IconComponent ? (
          <IconComponent sx={{ fontSize: '18px', color: '#555' }} />
        ) : (
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              color: '#555',
              fontWeight: 'bold'
            }}
          >
            {toolName}:
          </Typography>
        )}

        <Typography
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            color: '#555',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {argsPreview}
        </Typography>
      </Box>
    </Box>
  );
};

// Permission request component with callback
export const PermissionRequestMessage = ({ id, message, onResponse }) => {
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState(false);

  const handleResponse = async (approved) => {
    setResponding(true);
    await onResponse(id, approved);
    setResponded(true);
    setResponding(false);
  };

  if (responded) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#e8f5e9', borderLeft: '4px solid #4caf50' }}>
        <Typography variant="subtitle2" sx={{ color: '#2e7d32', fontWeight: 'bold' }}>
          ✓ Permission Granted
        </Typography>
        <Typography variant="body2" sx={{ color: '#555', mt: 1 }}>
          {message}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#fff3e0', borderLeft: '4px solid #ff9800' }}>
      <Typography variant="subtitle2" sx={{ color: '#e65100', fontWeight: 'bold', mb: 1 }}>
        ⚠️ Permission Required
      </Typography>
      <Typography variant="body2" sx={{ color: '#555', mb: 2 }}>
        {message}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          onClick={() => handleResponse(true)}
          disabled={responding}
          variant="contained"
          color="success"
          size="small"
        >
          Approve
        </Button>
        <Button
          onClick={() => handleResponse(false)}
          disabled={responding}
          variant="contained"
          color="error"
          size="small"
        >
          Deny
        </Button>
      </Box>
    </Paper>
  );
};

// Error message component
export const ErrorMessageComponent = ({ message, details }) => (
  <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#ffebee', borderLeft: '4px solid #f44336' }}>
    <Typography variant="subtitle2" sx={{ color: '#c62828', fontWeight: 'bold', mb: 1 }}>
      ❌ Error
    </Typography>
    <Typography variant="body2" sx={{ color: '#555', mb: details ? 1 : 0 }}>
      {message}
    </Typography>
    {details && (
      <Paper sx={{ p: 1, backgroundColor: '#ffcdd2', fontFamily: 'monospace', fontSize: '0.75rem', mt: 1, maxHeight: '150px', overflow: 'auto' }}>
        {details}
      </Paper>
    )}
  </Paper>
);

// Subagent activity component
export const SubagentActivityMessage = ({ name, status, content }) => (
  <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#e3f2fd', borderLeft: '4px solid #2196f3' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: content ? 1 : 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#0d47a1' }}>
        ⚡ Subagent: {name}
      </Typography>
      <Chip
        label={status}
        size="small"
        color={status === 'active' ? 'primary' : 'success'}
        sx={{ fontSize: '0.7rem', height: '20px' }}
      />
    </Box>
    {content && (
      <Typography variant="body2" sx={{ color: '#555', fontFamily: 'Roboto', mt: 1 }}>
        {content}
      </Typography>
    )}
  </Paper>
);

// Thinking block component
export const ThinkingMessage = ({ content }) => (
  <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#fce4ec', borderLeft: '4px solid #e91e63' }}>
    <Typography variant="subtitle2" sx={{ color: '#880e4f', fontWeight: 'bold', mb: 1 }}>
      💭 Thinking
    </Typography>
    <Typography variant="body2" sx={{ color: '#555', fontStyle: 'italic' }}>
      {content}
    </Typography>
  </Paper>
);

// Guardrails warning component (supports both input and output)
export const GuardrailsWarningMessage = ({ plugins, count, detections, violations, type = 'input' }) => {
  const isOutputGuardrail = type === 'output';
  const itemsList = isOutputGuardrail
    ? (violations || []).join(', ')
    : (plugins || []).join(', ');

  const title = isOutputGuardrail ? 'Output Guardrails Triggered' : 'Input Guardrails Triggered';
  const message = isOutputGuardrail
    ? 'Sensitive information was detected and redacted from the model output before being displayed to you.'
    : 'Sensitive information was detected and redacted from your message before being sent to the AI model.';

  const bgColor = isOutputGuardrail ? '#fff3e0' : '#ffebee';
  const borderColor = isOutputGuardrail ? '#f57c00' : '#c62828';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        m: 2,
        backgroundColor: bgColor,
        borderLeft: `4px solid ${borderColor}`,
        border: `1px solid ${borderColor}`
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <IoHandRightOutline size={24} style={{ color: borderColor }} />
        <Typography variant="subtitle2" sx={{ color: borderColor, fontWeight: 'bold' }}>
          {title}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: '#555', mb: 1 }}>
        {message}
      </Typography>
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" sx={{ color: '#666', fontWeight: 'bold' }}>
          Detected: {itemsList}
        </Typography>
        <Typography variant="caption" sx={{ color: '#666', display: 'block', mt: 0.5 }}>
          {count} {count === 1 ? 'item' : 'items'} redacted
        </Typography>
      </Box>
    </Paper>
  );
};

// Memory extracted component
export const MemoryExtractedMessage = ({ facts, count }) => {
  const displayFacts = facts && facts.length > 0 ? facts.slice(0, 3) : [];
  const hasMore = facts && facts.length > 3;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        m: 2,
        backgroundColor: '#e3f2fd',
        borderLeft: '4px solid #2196f3',
        border: '1px solid #2196f3'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ color: '#1565c0', fontWeight: 'bold' }}>
          💡 Memory Extracted
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: '#555', mb: 1 }}>
        Extracted {count} {count === 1 ? 'fact' : 'facts'} from the conversation for future reference.
      </Typography>
      {displayFacts.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          {displayFacts.map((fact, idx) => (
            <Typography key={idx} variant="caption" sx={{ color: '#666', display: 'block', mt: 0.5 }}>
              • {fact}
            </Typography>
          ))}
          {hasMore && (
            <Typography variant="caption" sx={{ color: '#666', display: 'block', mt: 0.5, fontStyle: 'italic' }}>
              ... and {facts.length - 3} more
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
};

// Research started component
export const ResearchStartedMessage = ({ inputFile, outputFile, sessionId }) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2,
      m: 2,
      backgroundColor: '#e8f5e9',
      borderLeft: '4px solid #4caf50',
      border: '1px solid #4caf50'
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
      <Typography variant="subtitle2" sx={{ color: '#2e7d32', fontWeight: 'bold' }}>
        🔬 Deep Research Started
      </Typography>
    </Box>
    <Typography variant="body2" sx={{ color: '#555', mb: 1 }}>
      Starting comprehensive research analysis...
    </Typography>
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
        Input: {inputFile}
      </Typography>
      <Typography variant="caption" sx={{ color: '#666', display: 'block', mt: 0.5 }}>
        Output: {outputFile}
      </Typography>
    </Box>
  </Paper>
);

// Research completed component
export const ResearchCompletedMessage = ({ outputFile, citations }) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2,
      m: 2,
      backgroundColor: '#e8f5e9',
      borderLeft: '4px solid #4caf50',
      border: '1px solid #4caf50'
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
      <Typography variant="subtitle2" sx={{ color: '#2e7d32', fontWeight: 'bold' }}>
        ✅ Research Completed
      </Typography>
    </Box>
    <Typography variant="body2" sx={{ color: '#555', mb: 1 }}>
      Deep research analysis finished successfully.
    </Typography>
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
        Results: {outputFile}
      </Typography>
      {citations && citations.length > 0 && (
        <Typography variant="caption" sx={{ color: '#666', display: 'block', mt: 0.5 }}>
          {citations.length} citation{citations.length !== 1 ? 's' : ''} included
        </Typography>
      )}
    </Box>
  </Paper>
);

// Research error component
export const ResearchErrorMessage = ({ outputFile, error }) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2,
      m: 2,
      backgroundColor: '#ffebee',
      borderLeft: '4px solid #f44336',
      border: '1px solid #f44336'
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
      <Typography variant="subtitle2" sx={{ color: '#c62828', fontWeight: 'bold' }}>
        ❌ Research Failed
      </Typography>
    </Box>
    <Typography variant="body2" sx={{ color: '#555', mb: 1 }}>
      {error || 'An error occurred during research.'}
    </Typography>
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
        Output file: {outputFile}
      </Typography>
    </Box>
  </Paper>
);

// Structured message router
export const StructuredMessage = ({ message, onPermissionResponse }) => {
  if (!message || !message.type) return null;

  switch (message.type) {
    case 'tool_call':
      return (
        <ToolCallMessage
          toolName={message.toolName}
          args={message.args}
          status={message.status}
          result={message.result}
        />
      );

    case 'permission_request':
      return (
        <PermissionRequestMessage
          id={message.permissionId}
          message={message.message}
          onResponse={onPermissionResponse}
        />
      );

    case 'subagent_start':
    case 'subagent_end':
      return (
        <SubagentActivityMessage
          name={message.name}
          status={message.status}
          content={message.content}
        />
      );

    case 'thinking':
      return <ThinkingMessage content={message.content} />;

    case 'error':
      return <ErrorMessageComponent message={message.message} details={message.details} />;

    case 'guardrails_warning':
      return (
        <GuardrailsWarningMessage
          plugins={message.plugins}
          count={message.count}
          detections={message.detections}
          type="input"
        />
      );

    case 'output_guardrails_warning':
      return (
        <GuardrailsWarningMessage
          violations={message.violations}
          count={message.count}
          type="output"
        />
      );

    case 'memory_extracted':
      return (
        <MemoryExtractedMessage
          facts={message.facts}
          count={message.count}
        />
      );

    case 'research_started':
      return (
        <ResearchStartedMessage
          inputFile={message.inputFile}
          outputFile={message.outputFile}
          sessionId={message.sessionId}
        />
      );

    case 'research_completed':
      return (
        <ResearchCompletedMessage
          outputFile={message.outputFile}
          citations={message.citations}
        />
      );

    case 'research_error':
      return (
        <ResearchErrorMessage
          outputFile={message.outputFile}
          error={message.error}
        />
      );

    default:
      return null;
  }
};
