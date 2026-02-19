import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Stack,
  Tooltip,
  Link,
  Menu,
  MenuItem,
  Checkbox,
  ListItemIcon,
  ListItemText,
  useTheme
} from '@mui/material';
import {
  FolderOpen as FileWatcherIcon,
  Sensors as MqttIcon,
  Schedule as ScheduleIcon,
  Webhook as WebhookIcon,
  Email as EmailIcon,
  PlayCircle as PlayingIcon,
  CheckCircle as CompletedIcon,
  Error as ErrorIcon,
  LinkOff as DisconnectedIcon,
  AccountTree as WorkflowIcon,
  NotInterested as IgnoredIcon,
  Code as ScriptIcon
} from '@mui/icons-material';
import { BiMessageEdit } from 'react-icons/bi';

// Event source configuration
const EVENT_SOURCES = {
  'File Watcher': {
    icon: FileWatcherIcon,
    color: '#4caf50',
    group: 'Filesystem'
  },
  'MQTT Client': {
    icon: MqttIcon,
    color: '#2196f3',
    group: 'MQTT'
  },
  'Webhook': {
    icon: WebhookIcon,
    color: '#ff9800',
    group: 'Webhook'
  },
  'Scheduler': {
    icon: ScheduleIcon,
    color: '#00bcd4',
    group: 'Scheduling'
  },
  'IMAP Connector': {
    icon: EmailIcon,
    color: '#e91e63',
    group: 'Email'
  }
};

// Activity indicator component with animation
const ActivityIndicator = ({ active }) => {
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        backgroundColor: active ? '#f44336' : '#e0e0e0',
        transition: 'background-color 0.3s ease',
        boxShadow: active ? '0 0 8px #f44336' : 'none',
        animation: active ? 'pulse 0.5s ease-in-out' : 'none',
        '@keyframes pulse': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' }
        }
      }}
    />
  );
};

// Connection status indicator
const ConnectionIndicator = ({ connected }) => {
  return (
    <Tooltip title={connected ? 'Connected' : 'Disconnected'} placement="top">
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: connected ? '#4caf50' : '#9e9e9e',
          transition: 'background-color 0.3s ease',
          boxShadow: connected ? '0 0 4px #4caf50' : 'none'
        }}
      />
    </Tooltip>
  );
};

// Single event card component
const EventCard = ({ event, isDark }) => {
  const timestamp = new Date(event.timestamp);
  const timeStr = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Extract display data based on event type
  const getDisplayData = () => {
    if (event.group === 'Filesystem' && event.payload?.path) {
      // Extract filename from path
      const pathParts = event.payload.path.split(/[/\\]/);
      const filename = pathParts[pathParts.length - 1];
      return filename.length > 20 ? filename.substring(0, 17) + '...' : filename;
    }
    if (event.group === 'MQTT' && event.topic) {
      const topicParts = event.topic.split('/');
      return topicParts[topicParts.length - 1];
    }
    if (event.payload) {
      const payloadStr = JSON.stringify(event.payload);
      return payloadStr.length > 20 ? payloadStr.substring(0, 17) + '...' : payloadStr;
    }
    return '';
  };

  const hasTriggeredRules = event.triggeredRules && event.triggeredRules.length > 0;

  return (
    <Box
      sx={{
        py: 1,
        px: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: hasTriggeredRules
          ? (isDark ? 'rgba(76, 175, 80, 0.15)' : '#e8f5e9')
          : 'transparent',
        '&:hover': {
          backgroundColor: hasTriggeredRules
            ? (isDark ? 'rgba(76, 175, 80, 0.25)' : '#c8e6c9')
            : 'action.hover'
        }
      }}
    >
      <Tooltip
        title={
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{event.name}</Typography>
            <Typography variant="caption" display="block">Group: {event.group}</Typography>
            {event.topic && <Typography variant="caption" display="block">Topic: {event.topic}</Typography>}
            {event.payload?.path && <Typography variant="caption" display="block">Path: {event.payload.path}</Typography>}
            {hasTriggeredRules && (
              <Typography variant="caption" display="block" sx={{ color: 'success.main', mt: 0.5 }}>
                ✓ Triggered {event.triggeredRules.length} rule(s)
              </Typography>
            )}
          </Box>
        }
        placement="left"
        arrow
      >
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: hasTriggeredRules ? 'success.dark' : 'text.primary',
                fontSize: '0.75rem',
                lineHeight: 1.2
              }}
            >
              {event.name}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '60%'
              }}
            >
              {getDisplayData()}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.disabled',
                fontSize: '0.65rem',
                fontFamily: 'monospace'
              }}
            >
              {timeStr}
            </Typography>
          </Box>
        </Box>
      </Tooltip>
    </Box>
  );
};

// Event source column component
const EventSourceColumn = ({ sourceName, sourceConfig, events, isActive, isConnected = true, showConnectionStatus = false, isDark = false }) => {
  const Icon = sourceConfig.icon;
  const isDisabled = showConnectionStatus && !isConnected;

  return (
    <Paper
      variant="outlined"
      sx={{
        flex: '1 1 0',
        minWidth: 180,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        opacity: isDisabled ? 0.5 : 1,
        transition: 'opacity 0.3s ease',
        position: 'relative'
      }}
    >
      {/* Column Header */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '2px solid',
          borderColor: isDisabled ? '#9e9e9e' : sourceConfig.color,
          backgroundColor: isDisabled ? '#f5f5f5' : `${sourceConfig.color}10`
        }}
      >
        <ActivityIndicator active={isActive && !isDisabled} />
        {sourceConfig.isReactIcon ? (
          <Icon style={{ color: isDisabled ? '#9e9e9e' : sourceConfig.color, fontSize: 20 }} />
        ) : (
          <Icon sx={{ color: isDisabled ? '#9e9e9e' : sourceConfig.color, fontSize: 20 }} />
        )}
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            color: isDisabled ? 'text.disabled' : 'text.primary'
          }}
        >
          {sourceName}
        </Typography>
              </Box>

      {/* Events Stack */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: 3
          }
        }}
      >
        {isDisabled ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <DisconnectedIcon sx={{ fontSize: 24, color: 'text.disabled', mb: 0.5 }} />
            <Typography variant="caption" color="text.disabled" display="block">
              Not connected
            </Typography>
          </Box>
        ) : events.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              No events
            </Typography>
          </Box>
        ) : (
          events.map((event, idx) => (
            <EventCard key={event.id || idx} event={event} isDark={isDark} />
          ))
        )}
      </Box>
    </Paper>
  );
};

// Prompt execution card component
const PromptExecutionCard = ({ execution, isDark }) => {
  const timestamp = new Date(execution.timestamp);
  const timeStr = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const getStatusIcon = () => {
    switch (execution.status) {
      case 'started':
        return <PlayingIcon sx={{ color: '#2196f3', fontSize: 16, animation: 'spin 1s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />;
      case 'completed':
        return <CompletedIcon sx={{ color: '#4caf50', fontSize: 16 }} />;
      case 'error':
        return <ErrorIcon sx={{ color: '#f44336', fontSize: 16 }} />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    if (isDark) {
      switch (execution.status) {
        case 'started': return 'rgba(33, 150, 243, 0.15)';
        case 'completed': return 'rgba(76, 175, 80, 0.15)';
        case 'error': return 'rgba(244, 67, 54, 0.15)';
        default: return 'transparent';
      }
    }
    switch (execution.status) {
      case 'started': return '#e3f2fd';
      case 'completed': return '#e8f5e9';
      case 'error': return '#ffebee';
      default: return 'transparent';
    }
  };

  return (
    <Box
      sx={{
        py: 1,
        px: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: getStatusColor(),
      }}
    >
      <Tooltip
        title={
          <Box sx={{ maxWidth: 300 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{execution.promptTitle || 'Prompt'}</Typography>
            <Typography variant="caption" display="block">Rule: {execution.ruleName}</Typography>
            <Typography variant="caption" display="block">Status: {execution.status}</Typography>
            {execution.error && (
              <Typography variant="caption" display="block" sx={{ color: 'error.main' }}>
                Error: {execution.error}
              </Typography>
            )}
            {execution.response && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {execution.response.substring(0, 200)}...
              </Typography>
            )}
          </Box>
        }
        placement="left"
        arrow
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {getStatusIcon()}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {execution.promptTitle || 'Executing prompt...'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.7rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '60%'
              }}
            >
              {execution.ruleName}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.disabled',
                fontSize: '0.65rem',
                fontFamily: 'monospace'
              }}
            >
              {timeStr}
            </Typography>
          </Box>
        </Box>
      </Tooltip>
    </Box>
  );
};

// Prompt executions column component
const PromptExecutionsColumn = ({ executions, isDark }) => {
  const hasActiveExecution = executions.some(e => e.status === 'started');

  return (
    <Paper
      variant="outlined"
      sx={{
        flex: '1 1 0',
        minWidth: 180,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Column Header */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '2px solid',
          borderColor: '#9c27b0',
          backgroundColor: '#9c27b010'
        }}
      >
        <ActivityIndicator active={hasActiveExecution} />
        <BiMessageEdit style={{ color: '#9c27b0', fontSize: 20 }} />
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          Prompt Executions
        </Typography>
      </Box>

      {/* Executions Stack */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: 3
          }
        }}
      >
        {executions.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              No executions
            </Typography>
          </Box>
        ) : (
          executions.map((execution, idx) => (
            <PromptExecutionCard key={`${execution.ruleId}-${execution.eventId}-${idx}`} execution={execution} isDark={isDark} />
          ))
        )}
      </Box>
    </Paper>
  );
};

// Workflow execution card component
const WorkflowExecutionCard = ({ execution, isDark }) => {
  const timestamp = new Date(execution.timestamp);
  const timeStr = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const getStatusIcon = () => {
    switch (execution.status) {
      case 'started':
        return <PlayingIcon sx={{ color: '#2196f3', fontSize: 16, animation: 'spin 1s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />;
      case 'completed':
        return <CompletedIcon sx={{ color: '#4caf50', fontSize: 16 }} />;
      case 'ignored':
        return <IgnoredIcon sx={{ color: '#ff9800', fontSize: 16 }} />;
      case 'error':
        return <ErrorIcon sx={{ color: '#f44336', fontSize: 16 }} />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    if (isDark) {
      switch (execution.status) {
        case 'started': return 'rgba(33, 150, 243, 0.15)';
        case 'completed': return 'rgba(76, 175, 80, 0.15)';
        case 'ignored': return 'rgba(255, 152, 0, 0.15)';
        case 'error': return 'rgba(244, 67, 54, 0.15)';
        default: return 'transparent';
      }
    }
    switch (execution.status) {
      case 'started': return '#e3f2fd';
      case 'completed': return '#e8f5e9';
      case 'ignored': return '#fff3e0';
      case 'error': return '#ffebee';
      default: return 'transparent';
    }
  };

  return (
    <Box
      sx={{
        py: 1,
        px: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: getStatusColor(),
      }}
    >
      <Tooltip
        title={
          <Box sx={{ maxWidth: 300 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {execution.workflowId}
            </Typography>
            <Typography variant="caption" display="block">
              Event: {execution.workflowEvent}
            </Typography>
            <Typography variant="caption" display="block">Rule: {execution.ruleName}</Typography>
            <Typography variant="caption" display="block">Status: {execution.status}</Typography>
            {execution.previousState && execution.currentState && (
              <Typography variant="caption" display="block" sx={{ color: 'success.main', mt: 0.5 }}>
                {execution.previousState} → {execution.currentState}
              </Typography>
            )}
            {execution.error && (
              <Typography variant="caption" display="block" sx={{ color: 'error.main' }}>
                Error: {execution.error}
              </Typography>
            )}
          </Box>
        }
        placement="left"
        arrow
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {getStatusIcon()}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {execution.workflowId}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.7rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '60%'
              }}
            >
              {execution.status === 'completed' && execution.previousState
                ? `${execution.previousState} → ${execution.currentState}`
                : execution.status === 'ignored'
                  ? `Ignored in ${execution.currentState}`
                  : execution.ruleName}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.disabled',
                fontSize: '0.65rem',
                fontFamily: 'monospace'
              }}
            >
              {timeStr}
            </Typography>
          </Box>
        </Box>
      </Tooltip>
    </Box>
  );
};

// Workflow executions column component
const WorkflowExecutionsColumn = ({ executions, isDark }) => {
  const hasActiveExecution = executions.some(e => e.status === 'started');

  return (
    <Paper
      variant="outlined"
      sx={{
        flex: '1 1 0',
        minWidth: 180,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Column Header */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '2px solid',
          borderColor: '#ff9800',
          backgroundColor: '#ff980010'
        }}
      >
        <ActivityIndicator active={hasActiveExecution} />
        <WorkflowIcon sx={{ color: '#ff9800', fontSize: 20 }} />
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          Workflow Events
        </Typography>
      </Box>

      {/* Executions Stack */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: 3
          }
        }}
      >
        {executions.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              No workflow events
            </Typography>
          </Box>
        ) : (
          executions.map((execution, idx) => (
            <WorkflowExecutionCard key={`${execution.ruleId}-${execution.eventId}-${idx}`} execution={execution} isDark={isDark} />
          ))
        )}
      </Box>
    </Paper>
  );
};

// Script execution card component
const ScriptExecutionCard = ({ execution, isDark }) => {
  const timestamp = new Date(execution.timestamp);
  const timeStr = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const getStatusIcon = () => {
    switch (execution.status) {
      case 'started':
        return <PlayingIcon sx={{ color: '#2196f3', fontSize: 16, animation: 'spin 1s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />;
      case 'completed':
        return <CompletedIcon sx={{ color: '#4caf50', fontSize: 16 }} />;
      case 'error':
        return <ErrorIcon sx={{ color: '#f44336', fontSize: 16 }} />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    if (isDark) {
      switch (execution.status) {
        case 'started': return 'rgba(33, 150, 243, 0.15)';
        case 'completed': return 'rgba(76, 175, 80, 0.15)';
        case 'error': return 'rgba(244, 67, 54, 0.15)';
        default: return 'transparent';
      }
    }
    switch (execution.status) {
      case 'started': return '#e3f2fd';
      case 'completed': return '#e8f5e9';
      case 'error': return '#ffebee';
      default: return 'transparent';
    }
  };

  const durationStr = execution.durationMs != null ? `${(execution.durationMs / 1000).toFixed(1)}s` : '';

  return (
    <Box
      sx={{
        py: 1,
        px: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: getStatusColor(),
      }}
    >
      <Tooltip
        title={
          <Box sx={{ maxWidth: 300 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{execution.scriptFile}</Typography>
            <Typography variant="caption" display="block">Workflow: {execution.workflowId}</Typography>
            <Typography variant="caption" display="block">State: {execution.state}</Typography>
            <Typography variant="caption" display="block">Status: {execution.status}</Typography>
            {durationStr && (
              <Typography variant="caption" display="block">Duration: {durationStr}</Typography>
            )}
            {execution.exitCode != null && execution.exitCode !== 0 && (
              <Typography variant="caption" display="block">Exit code: {execution.exitCode}</Typography>
            )}
            {execution.stderr && (
              <Typography variant="caption" display="block" sx={{ color: 'error.main', mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {execution.stderr.substring(0, 200)}
              </Typography>
            )}
            {execution.stdout && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {execution.stdout.substring(0, 200)}
              </Typography>
            )}
          </Box>
        }
        placement="left"
        arrow
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {getStatusIcon()}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {execution.scriptFile || 'Running script...'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.7rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '50%'
              }}
            >
              {execution.workflowId}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.disabled',
                fontSize: '0.65rem',
                fontFamily: 'monospace'
              }}
            >
              {durationStr ? `${durationStr} · ${timeStr}` : timeStr}
            </Typography>
          </Box>
        </Box>
      </Tooltip>
    </Box>
  );
};

// Script executions column component
const ScriptExecutionsColumn = ({ executions, isDark }) => {
  const hasActiveExecution = executions.some(e => e.status === 'started');

  return (
    <Paper
      variant="outlined"
      sx={{
        flex: '1 1 0',
        minWidth: 180,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Column Header */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '2px solid',
          borderColor: '#00897b',
          backgroundColor: '#00897b10'
        }}
      >
        <ActivityIndicator active={hasActiveExecution} />
        <ScriptIcon sx={{ color: '#00897b', fontSize: 20 }} />
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          Script Executions
        </Typography>
      </Box>

      {/* Executions Stack */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: 3
          }
        }}
      >
        {executions.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              No script executions
            </Typography>
          </Box>
        ) : (
          executions.map((execution, idx) => (
            <ScriptExecutionCard key={`${execution.workflowId}-${execution.scriptFile}-${idx}`} execution={execution} isDark={isDark} />
          ))
        )}
      </Box>
    </Paper>
  );
};

// All column keys: event sources + execution columns
const ALL_COLUMNS = [
  ...Object.keys(EVENT_SOURCES),
  'Prompt Executions',
  'Workflow Events',
  'Script Executions'
];

const STORAGE_KEY = 'liveEvents_hiddenColumns';

const loadHiddenColumns = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveHiddenColumns = (hidden) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
};

const LiveEventsTab = ({ liveEvents, eventStream, promptExecutions = [], workflowExecutions = [], scriptExecutions = [], serviceStatus = {} }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Track active sources (which sources had recent activity)
  const [activeSources, setActiveSources] = useState({});
  const prevEventsRef = useRef([]);

  // Column visibility
  const [hiddenColumns, setHiddenColumns] = useState(loadHiddenColumns);
  const [visibilityAnchor, setVisibilityAnchor] = useState(null);

  const toggleColumnVisibility = (columnKey) => {
    setHiddenColumns(prev => {
      const next = prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey];
      saveHiddenColumns(next);
      return next;
    });
  };

  // Extract MQTT connection status
  const mqttConnected = serviceStatus.mqtt?.connected || false;

  // Group events by source
  const eventsBySource = React.useMemo(() => {
    const grouped = {};

    // Initialize all known sources
    Object.keys(EVENT_SOURCES).forEach(source => {
      grouped[source] = [];
    });

    // Group events by their source
    liveEvents.forEach(event => {
      const source = event.source || 'Unknown';
      if (!grouped[source]) {
        grouped[source] = [];
      }
      grouped[source].push(event);
    });

    // Sort events within each source (most recent first)
    Object.keys(grouped).forEach(source => {
      grouped[source].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    });

    return grouped;
  }, [liveEvents]);

  // Detect new events and trigger activity indicator
  useEffect(() => {
    const prevEventIds = new Set(prevEventsRef.current.map(e => e.id));
    const newEvents = liveEvents.filter(e => !prevEventIds.has(e.id));

    if (newEvents.length > 0) {
      // Collect unique sources from new events
      const newActiveSources = {};
      newEvents.forEach(event => {
        const source = event.source || 'Unknown';
        newActiveSources[source] = true;
      });

      // Set active sources
      setActiveSources(prev => ({ ...prev, ...newActiveSources }));

      // Clear activity indicators after 2 seconds
      const timeout = setTimeout(() => {
        setActiveSources(prev => {
          const updated = { ...prev };
          Object.keys(newActiveSources).forEach(source => {
            delete updated[source];
          });
          return updated;
        });
      }, 2000);

      return () => clearTimeout(timeout);
    }

    prevEventsRef.current = liveEvents;
  }, [liveEvents]);

  // Get sources that have events or are known sources, filtered by visibility
  const visibleSources = React.useMemo(() => {
    const sources = new Set(Object.keys(EVENT_SOURCES));

    // Also add any sources from events that aren't in our predefined list
    liveEvents.forEach(event => {
      if (event.source) {
        sources.add(event.source);
      }
    });

    return Array.from(sources).filter(s => !hiddenColumns.includes(s));
  }, [liveEvents, hiddenColumns]);

  if (!eventStream) {
    return (
      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Connecting to event stream...
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Columns container */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          overflowY: 'hidden',
          minHeight: 0,
          '&::-webkit-scrollbar': {
            height: 8
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
            borderRadius: 4,
            '&:hover': {
              backgroundColor: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'
            }
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            borderRadius: 4
          }
        }}
      >
        {visibleSources.map(sourceName => {
          const sourceConfig = EVENT_SOURCES[sourceName] || {
            icon: WebhookIcon,
            color: '#757575',
            group: 'Unknown'
          };
          const events = eventsBySource[sourceName] || [];
          const isActive = !!activeSources[sourceName];

          // Determine if this source should show connection status
          const isMqttSource = sourceName === 'MQTT Client';

          return (
            <EventSourceColumn
              key={sourceName}
              sourceName={sourceName}
              sourceConfig={sourceConfig}
              events={events}
              isActive={isActive}
              showConnectionStatus={isMqttSource}
              isConnected={isMqttSource ? mqttConnected : true}
              isDark={isDark}
            />
          );
        })}

        {/* Prompt Executions Column */}
        {!hiddenColumns.includes('Prompt Executions') && (
          <PromptExecutionsColumn executions={promptExecutions} isDark={isDark} />
        )}

        {/* Workflow Executions Column */}
        {!hiddenColumns.includes('Workflow Events') && (
          <WorkflowExecutionsColumn executions={workflowExecutions} isDark={isDark} />
        )}

        {/* Script Executions Column */}
        {!hiddenColumns.includes('Script Executions') && (
          <ScriptExecutionsColumn executions={scriptExecutions} isDark={isDark} />
        )}
      </Box>

      {/* Connection status bar - at bottom */}
      <Box sx={{ pt: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {/* Event Stream Status */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: eventStream ? '#4caf50' : '#f44336'
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {eventStream ? 'Event stream connected' : 'Disconnected'}
          </Typography>
        </Box>

        {/* MQTT Status */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <MqttIcon sx={{ fontSize: 12, color: mqttConnected ? '#2196f3' : '#9e9e9e' }} />
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: mqttConnected ? '#4caf50' : '#9e9e9e'
            }}
          />
          <Typography variant="caption" color={mqttConnected ? 'text.secondary' : 'text.disabled'} sx={{ fontSize: '0.7rem' }}>
            MQTT {mqttConnected ? 'connected' : 'not connected'}
          </Typography>
        </Box>

        {/* Column visibility toggle */}
        <Box sx={{ flex: 1, textAlign: 'center' }}>
          <Link
            component="button"
            variant="caption"
            underline="hover"
            onClick={(e) => setVisibilityAnchor(e.currentTarget)}
            sx={{ fontSize: '0.7rem', cursor: 'pointer' }}
          >
            {hiddenColumns.length > 0 ? `Hide/Show Event Sources (${hiddenColumns.length} hidden)` : 'Hide/Show Event Sources'}
          </Link>
          <Menu
            anchorEl={visibilityAnchor}
            open={Boolean(visibilityAnchor)}
            onClose={() => setVisibilityAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            {ALL_COLUMNS.map(col => (
              <MenuItem key={col} dense onClick={() => toggleColumnVisibility(col)}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Checkbox
                    size="small"
                    checked={!hiddenColumns.includes(col)}
                    disableRipple
                    sx={{ p: 0 }}
                  />
                </ListItemIcon>
                <ListItemText primaryTypographyProps={{ variant: 'caption', fontSize: '0.8rem' }}>
                  {col}
                </ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </Box>

        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
          {liveEvents.length} total events
        </Typography>
      </Box>
    </Box>
  );
};

export default LiveEventsTab;
