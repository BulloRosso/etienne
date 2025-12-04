import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Stack,
  Tooltip
} from '@mui/material';
import {
  FolderOpen as FileWatcherIcon,
  Sensors as MqttIcon,
  Code as ClaudeCodeIcon,
  Schedule as ScheduleIcon,
  Webhook as WebhookIcon,
  PhoneAndroid as PhoneIcon
} from '@mui/icons-material';

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
  'Claude Agent SDK': {
    icon: ClaudeCodeIcon,
    color: '#9c27b0',
    group: 'Claude Code'
  },
  'Webhook': {
    icon: PhoneIcon,
    color: '#ff9800',
    group: 'Claude Code'
  },
  'Scheduler': {
    icon: ScheduleIcon,
    color: '#00bcd4',
    group: 'Scheduling'
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

// Single event card component
const EventCard = ({ event }) => {
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
        backgroundColor: hasTriggeredRules ? 'success.50' : 'transparent',
        '&:hover': {
          backgroundColor: hasTriggeredRules ? 'success.100' : 'action.hover'
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
const EventSourceColumn = ({ sourceName, sourceConfig, events, isActive }) => {
  const Icon = sourceConfig.icon;

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
          borderColor: sourceConfig.color,
          backgroundColor: `${sourceConfig.color}10`
        }}
      >
        <ActivityIndicator active={isActive} />
        <Icon sx={{ color: sourceConfig.color, fontSize: 20 }} />
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
        {events.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              No events
            </Typography>
          </Box>
        ) : (
          events.map((event, idx) => (
            <EventCard key={event.id || idx} event={event} />
          ))
        )}
      </Box>
    </Paper>
  );
};

const LiveEventsTab = ({ liveEvents, eventStream }) => {
  // Track active sources (which sources had recent activity)
  const [activeSources, setActiveSources] = useState({});
  const prevEventsRef = useRef([]);

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

  // Get sources that have events or are known sources
  const visibleSources = React.useMemo(() => {
    const sources = new Set(Object.keys(EVENT_SOURCES));

    // Also add any sources from events that aren't in our predefined list
    liveEvents.forEach(event => {
      if (event.source) {
        sources.add(event.source);
      }
    });

    return Array.from(sources);
  }, [liveEvents]);

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
    <Box sx={{ height: 'calc(100vh - 280px)', display: 'flex', flexDirection: 'column' }}>
      {/* Connection status */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: eventStream ? '#4caf50' : '#f44336'
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {eventStream ? 'Connected to event stream' : 'Disconnected'}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
          {liveEvents.length} total events
        </Typography>
      </Box>

      {/* Columns container */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          gap: 2,
          overflow: 'auto',
          pb: 1
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

          return (
            <EventSourceColumn
              key={sourceName}
              sourceName={sourceName}
              sourceConfig={sourceConfig}
              events={events}
              isActive={isActive}
            />
          );
        })}
      </Box>
    </Box>
  );
};

export default LiveEventsTab;
