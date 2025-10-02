import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  CircularProgress,
  Typography
} from '@mui/material';
import axios from 'axios';

export default function Interceptors({ projectName }) {
  const [mode, setMode] = useState('events'); // 'events' or 'hooks'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const esRef = useRef(null);

  useEffect(() => {
    loadItems();
    setupSSE();

    return () => {
      if (esRef.current) {
        esRef.current.close();
      }
    };
  }, [projectName, mode]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const endpoint = mode === 'events'
        ? `/api/interceptors/events/${projectName}`
        : `/api/interceptors/hooks/${projectName}`;
      const response = await axios.get(endpoint);
      const data = mode === 'events' ? response.data.events : response.data.hooks;
      setItems(data || []);
    } catch (err) {
      console.error('Failed to load interceptors:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const setupSSE = () => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(`/api/interceptors/stream/${projectName}`);
    esRef.current = es;

    es.addEventListener('interceptor', (e) => {
      const event = JSON.parse(e.data);
      // Only add items that match the current mode
      if ((mode === 'events' && event.type === 'event') ||
          (mode === 'hooks' && event.type === 'hook')) {
        setItems((prev) => [event.data, ...prev]);
      }
    });

    es.onerror = () => {
      console.error('SSE connection error');
    };
  };

  const handleModeChange = (event, newMode) => {
    if (newMode !== null) {
      setMode(newMode);
      setFilters({});
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  // Format timestamp as relative time
  const formatRelativeTime = (timestamp) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} ago`;
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    if (diffHours < 12) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

    return then.toLocaleString();
  };

  // Get all unique field names from items, excluding certain columns
  const getFields = () => {
    if (items.length === 0) return [];
    const excludedFields = ['cwd', 'session_id', 'transcript_path', 'hook_event_name'];
    const allKeys = new Set();
    items.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!excludedFields.includes(key)) {
          allKeys.add(key);
        }
      });
    });
    return Array.from(allKeys).sort();
  };

  // Filter items based on filter values
  const getFilteredItems = () => {
    return items.filter(item => {
      return Object.entries(filters).every(([field, filterValue]) => {
        if (!filterValue) return true;
        const itemValue = item[field];
        if (itemValue === null || itemValue === undefined) return false;
        const itemStr = typeof itemValue === 'object'
          ? JSON.stringify(itemValue).toLowerCase()
          : String(itemValue).toLowerCase();
        return itemStr.includes(filterValue.toLowerCase());
      });
    });
  };

  const fields = getFields();
  const filteredItems = getFilteredItems();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '96%', p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          color="primary"
        >
          <ToggleButton value="events">Events</ToggleButton>
          <ToggleButton value="hooks">Hooks</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {items.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <Typography variant="body2" color="text.secondary">
            No {mode} yet. Waiting for Claude Code activity...
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ flex: 1 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {fields.map(field => (
                  <TableCell key={field} sx={{ verticalAlign: 'top' }}>
                    <TextField
                      size="small"
                      placeholder="Filter"
                      value={filters[field] || ''}
                      onChange={(e) => handleFilterChange(field, e.target.value)}
                      sx={{ width: '100%', mb: 1 }}
                      variant="standard"
                    />
                    <strong>{field}</strong>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item, index) => (
                <TableRow key={index} sx={{ backgroundColor: index % 2 === 0 ? 'white' : '#EBF5FF' }}>
                  {fields.map(field => (
                    <TableCell key={field} sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' }}>
                      {field === 'timestamp' && item[field]
                        ? <span style={{ fontSize: '0.85rem' }}>{formatRelativeTime(item[field])}</span>
                        : typeof item[field] === 'object'
                        ? <code style={{ fontSize: '0.75rem' }}>{JSON.stringify(item[field])}</code>
                        : <span style={{ fontSize: '0.85rem' }}>{String(item[field] || '')}</span>
                      }
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
