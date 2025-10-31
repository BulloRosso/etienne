import React, { useState, useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography, Paper } from '@mui/material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ToolCallMessage } from './StructuredMessage';

/**
 * ResearchDocument Component
 *
 * Displays deep research progress and results.
 * - While research is in progress: Shows progress indicator and event stream
 * - When research is complete: Renders the markdown output
 *
 * @param {string} input - Input file path (research brief)
 * @param {string} output - Output file path (.research file)
 * @param {string} projectName - Current project name
 */
export default function ResearchDocument({ input, output, projectName }) {
  const [fileExists, setFileExists] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const eventSourceRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Debug logging
  useEffect(() => {
    console.log('ResearchDocument mounted:', { input, output, projectName });
  }, []);

  // Extract filename without path for display
  const getFilenameOnly = (path) => {
    if (!path) return 'Research';
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  const inputFilename = getFilenameOnly(input) || getFilenameOnly(output);

  // Format elapsed time
  const formatElapsedTime = (seconds) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  // Check if output file exists
  const checkFileExists = async () => {
    try {
      const response = await fetch(
        `/api/deep-research/${encodeURIComponent(projectName)}/file-exists/${output}`
      );
      const data = await response.json();
      return data.exists;
    } catch (err) {
      console.error('Error checking file existence:', err);
      return false;
    }
  };

  // Fetch markdown content and check if it has substantial content
  const fetchMarkdownContent = async () => {
    try {
      const response = await fetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${output}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }

      const markdownText = await response.text();

      // Check if file has actual content (more than just whitespace)
      if (!markdownText || markdownText.trim().length === 0) {
        console.log('File exists but is empty, continuing to show progress...');
        return false; // File is empty, don't switch to display mode
      }

      console.log('File has content, switching to markdown display mode');

      // Parse markdown to HTML
      const rawHtml = await marked.parse(markdownText);

      // Sanitize HTML to prevent XSS
      const cleanHtml = DOMPurify.sanitize(rawHtml);

      setHtmlContent(cleanHtml);
      setLoading(false);
      return true; // File has content
    } catch (err) {
      console.error('Error loading markdown file:', err);
      setError(err.message);
      setLoading(false);
      return false;
    }
  };

  // Poll for file existence AND content every 3 seconds
  useEffect(() => {
    const poll = async () => {
      const exists = await checkFileExists();
      if (exists) {
        // File exists, now check if it has content
        const hasContent = await fetchMarkdownContent();
        if (hasContent) {
          // File has content, stop polling and show it
          setFileExists(true);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
        // If no content yet, keep polling (fileExists stays false)
      }
    };

    // Initial check
    poll();

    // Set up polling if file doesn't exist
    if (!fileExists) {
      pollIntervalRef.current = setInterval(poll, 3000);
    }

    // Cleanup
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [projectName, output, fileExists]);

  // Connect to research event stream
  useEffect(() => {
    if (fileExists) return; // Don't connect if file already exists
    if (!projectName || !output) return; // Need these to connect

    console.log('Connecting to research event stream:', projectName);
    const eventSource = new EventSource(
      `/api/deep-research/${encodeURIComponent(projectName)}/stream`
    );

    // Helper to check if event is for this research session (by output file)
    const isForThisResearch = (data) => {
      return data.outputFile === output;
    };

    // Lifecycle events
    eventSource.addEventListener('Research.created', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.created event received:', data);
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.created',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.started', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.started event received:', data);
      if (isForThisResearch(data)) {
        setStartTime(Date.now());
        setEvents(prev => [{
          type: 'Research.started',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.in_progress', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.in_progress event received:', data);
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.in_progress',
          ...data
        }, ...prev]); // Add to front
      }
    });

    // Web search events
    eventSource.addEventListener('Research.web_search.in_progress', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.web_search.in_progress event received:', data);
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.web_search.in_progress',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.web_search.searching', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.web_search.searching event received:', data);
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.web_search.searching',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.web_search.completed', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.web_search.completed event received:', data);
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.web_search.completed',
          ...data
        }, ...prev]); // Add to front
      }
    });

    // Output item events
    eventSource.addEventListener('Research.output_item.added', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.output_item.added event received');
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.output_item.added',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.output_item.done', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.output_item.done event received');
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.output_item.done',
          ...data
        }, ...prev]); // Add to front
      }
    });

    // Content part events
    eventSource.addEventListener('Research.content_part.added', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.content_part.added event received');
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.content_part.added',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.content_part.done', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.content_part.done event received');
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.content_part.done',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.output_text.delta', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.output_text.delta event received');
      // Match by output file instead of input file
      if (isForThisResearch(data)) {
        setEvents(prev => {
          const first = prev[0];
          // Accumulate deltas at the front
          if (first && first.type === 'Research.output_text.delta') {
            return [
              { ...first, delta: (first.delta || '') + data.delta },
              ...prev.slice(1)
            ];
          }
          return [{ type: 'Research.output_text.delta', ...data }, ...prev]; // Add to front
        });
      }
    });

    eventSource.addEventListener('Research.output_text.done', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.output_text.done event received');
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.output_text.done',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.addEventListener('Research.completed', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.completed event received:', data);
      if (isForThisResearch(data)) {
        setEvents(prev => [{
          type: 'Research.completed',
          ...data
        }, ...prev]); // Add to front
        // Trigger file check
        checkFileExists().then(exists => {
          if (exists) {
            setFileExists(true);
            fetchMarkdownContent();
          }
        });
      }
    });

    eventSource.addEventListener('Research.error', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research.error event received:', data);
      if (isForThisResearch(data)) {
        setError(data.error);
        setEvents(prev => [{
          type: 'Research.error',
          ...data
        }, ...prev]); // Add to front
      }
    });

    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      eventSource.close();
    };

    eventSourceRef.current = eventSource;

    // Cleanup
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [projectName, output, fileExists]); // Fixed: use 'output' instead of 'input' in dependency array

  // Timer effect for elapsed time
  useEffect(() => {
    if (startTime && !fileExists) {
      // Update every second
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000); // seconds
        setElapsedTime(elapsed);
      }, 1000);

      return () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      };
    }
  }, [startTime, fileExists]);

  // Render research in progress view
  if (!fileExists) {
    return (
      <Box
        sx={{
          height: '100%',
          overflow: 'auto',
          p: 3,
          backgroundColor: '#f5f5f5'
        }}
      >
        {/* Progress Header */}
        <Paper
          elevation={2}
          sx={{
            p: 3,
            mb: 3,
            textAlign: 'center',
            backgroundColor: '#fff'
          }}
        >
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Research for {inputFilename} in Progress
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Analyzing sources and generating comprehensive report...
          </Typography>
        </Paper>

        {/* Event Stream */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            Research Progress
            {startTime && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 2, fontWeight: 'normal' }}>
                (running for {formatElapsedTime(elapsedTime)})
              </Typography>
            )}
          </Typography>

          {events.length === 0 && (
            <Paper elevation={1} sx={{ p: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">
                Waiting for research to begin...
              </Typography>
            </Paper>
          )}

          {events.map((event, index) => (
            <Paper
              key={index}
              elevation={1}
              sx={{
                mb: 2,
                p: 2,
                backgroundColor: event.type === 'Research.error' ? '#ffebee' : '#fff'
              }}
            >
              {event.type === 'Research.created' && (
                <Box>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    🔬 Research Initialized
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Session: {event.sessionId}
                  </Typography>
                </Box>
              )}

              {event.type === 'Research.started' && (
                <Box>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    ▶️ Research Started
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Session: {event.sessionId}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Output: {event.outputFile}
                  </Typography>
                </Box>
              )}

              {event.type === 'Research.in_progress' && (
                <Box>
                  <Typography variant="subtitle2" color="info.main" gutterBottom>
                    ⚡ Research In Progress
                  </Typography>
                </Box>
              )}

              {event.type === 'Research.web_search.in_progress' && (
                <Box>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    🔍 Initiating Web Search...
                  </Typography>
                  {event.query && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                      Query: {event.query.length > 60 ? event.query.substring(0, 60) + '...' : event.query}
                    </Typography>
                  )}
                </Box>
              )}

              {event.type === 'Research.web_search.searching' && (
                <Box>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    🌐 Searching the Web...
                  </Typography>
                  {event.query && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                      Query: {event.query.length > 60 ? event.query.substring(0, 60) + '...' : event.query}
                    </Typography>
                  )}
                </Box>
              )}

              {event.type === 'Research.web_search.completed' && (
                <Box>
                  <Typography variant="subtitle2" color="success.main" gutterBottom>
                    ✓ Web Search Completed
                  </Typography>
                  {event.query && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                      Query: {event.query.length > 60 ? event.query.substring(0, 60) + '...' : event.query}
                    </Typography>
                  )}
                </Box>
              )}

              {event.type === 'Research.output_item.added' && (
                <Box>
                  <Typography variant="subtitle2" color="info.main" gutterBottom>
                    🧠 Processing Output Item ({event.item_type || 'unknown'})
                  </Typography>
                  {event.content_preview && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                      {event.content_preview.length > 60 ? event.content_preview.substring(0, 60) + '...' : event.content_preview}
                    </Typography>
                  )}
                </Box>
              )}

              {event.type === 'Research.output_item.done' && (
                <Box>
                  <Typography variant="subtitle2" color="success.main" gutterBottom>
                    ✓ Output Item Completed ({event.item_type || 'unknown'})
                  </Typography>
                  {event.content_preview && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                      {event.content_preview.length > 60 ? event.content_preview.substring(0, 60) + '...' : event.content_preview}
                    </Typography>
                  )}
                </Box>
              )}

              {event.type === 'Research.content_part.added' && (
                <Box>
                  <Typography variant="subtitle2" color="info.main" gutterBottom>
                    📝 Generating Content Part...
                  </Typography>
                </Box>
              )}

              {event.type === 'Research.content_part.done' && (
                <Box>
                  <Typography variant="subtitle2" color="success.main" gutterBottom>
                    ✓ Content Part Completed
                  </Typography>
                </Box>
              )}

              {event.type === 'Research.output_text.delta' && (
                <Box>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    Generating Content
                  </Typography>
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      backgroundColor: '#f9f9f9',
                      borderRadius: 1,
                      maxHeight: '200px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {event.delta}
                  </Box>
                </Box>
              )}

              {event.type === 'Research.output_text.done' && (
                <Box>
                  <Typography variant="subtitle2" color="success.main">
                    ✓ Content Section Completed
                  </Typography>
                </Box>
              )}

              {event.type === 'Research.completed' && (
                <Box>
                  <Typography variant="subtitle2" color="success.main" gutterBottom>
                    ✓ Research Completed
                  </Typography>
                  {event.citations && event.citations.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {event.citations.length} citation(s) found
                    </Typography>
                  )}
                </Box>
              )}

              {event.type === 'Research.error' && (
                <Box>
                  <Typography variant="subtitle2" color="error" gutterBottom>
                    Error
                  </Typography>
                  <Typography variant="body2" color="error">
                    {event.error}
                  </Typography>
                </Box>
              )}
            </Paper>
          ))}

          {error && (
            <Paper elevation={2} sx={{ p: 2, backgroundColor: '#ffebee', mt: 2 }}>
              <Typography color="error" variant="subtitle2" gutterBottom>
                Research Failed
              </Typography>
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>
    );
  }

  // Render completed research (markdown view)
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="100%"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2} color="error.main">
        Error loading research results: {error}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        p: 3,
        '& h1': {
          fontSize: '2em',
          fontWeight: 'bold',
          marginTop: '0.67em',
          marginBottom: '0.67em',
          borderBottom: '1px solid #eaecef',
          paddingBottom: '0.3em'
        },
        '& h2': {
          fontSize: '1.5em',
          fontWeight: 'bold',
          marginTop: '0.83em',
          marginBottom: '0.83em',
          borderBottom: '1px solid #eaecef',
          paddingBottom: '0.3em'
        },
        '& h3': {
          fontSize: '1.17em',
          fontWeight: 'bold',
          marginTop: '1em',
          marginBottom: '1em'
        },
        '& p': {
          marginTop: '1em',
          marginBottom: '1em',
          lineHeight: '1.6'
        },
        '& ul, & ol': {
          marginTop: '1em',
          marginBottom: '1em',
          paddingLeft: '2em'
        },
        '& code': {
          backgroundColor: '#f6f8fa',
          borderRadius: '3px',
          padding: '0.2em 0.4em',
          fontFamily: 'monospace',
          fontSize: '0.9em'
        },
        '& pre': {
          backgroundColor: '#f6f8fa',
          borderRadius: '6px',
          padding: '16px',
          overflow: 'auto',
          marginTop: '1em',
          marginBottom: '1em'
        },
        '& blockquote': {
          borderLeft: '4px solid #dfe2e5',
          paddingLeft: '1em',
          marginLeft: 0,
          color: '#6a737d',
          marginTop: '1em',
          marginBottom: '1em'
        },
        '& table': {
          borderCollapse: 'collapse',
          width: '100%',
          marginTop: '1em',
          marginBottom: '1em'
        },
        '& table th, & table td': {
          border: '1px solid #dfe2e5',
          padding: '6px 13px'
        },
        '& table th': {
          fontWeight: 'bold',
          backgroundColor: '#f6f8fa'
        },
        '& a': {
          color: '#0366d6',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline'
          }
        }
      }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
