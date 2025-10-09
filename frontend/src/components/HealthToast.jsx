import React, { useEffect, useState } from 'react';
import { Box, Paper, IconButton, Tooltip } from '@mui/material';
import { TbCloudDataConnection } from 'react-icons/tb';
import { IoClose } from 'react-icons/io5';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function HealthToast() {
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const checkHealth = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('/api/claude/health', {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Unknown error occurred');
      } else {
        const data = await response.json();
        if (!data.healthy) {
          setError(data.error || 'System health check failed');
        } else {
          setError(null);
        }
      }
    } catch (err) {
      setError('**Backend does not respond**\n\nThe backend is not responding. Please ensure the backend is running on port 6060.');
    }
  };

  useEffect(() => {
    // Check on startup
    checkHealth();

    // Check every 10 seconds
    const intervalId = setInterval(checkHealth, 10000);

    return () => clearInterval(intervalId);
  }, []);

  if (!error) return null;

  // Convert markdown to HTML
  const htmlContent = marked(error);
  const sanitizedHtml = DOMPurify.sanitize(htmlContent);

  // If toast is not open, show just the icon button
  if (!isOpen) {
    return (
      <Tooltip title="System Health Error - Click to view details">
        <IconButton
          onClick={() => setIsOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            backgroundColor: '#c62828',
            color: 'white',
            zIndex: 1000,
            '&:hover': {
              backgroundColor: '#b71c1c'
            }
          }}
        >
          <TbCloudDataConnection size={24} />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ffebee',
        borderTop: '3px solid #c62828',
        padding: 2,
        paddingRight: 5,
        zIndex: 1000,
        maxHeight: '300px',
        overflow: 'auto'
      }}
    >
      <IconButton
        onClick={() => setIsOpen(false)}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          color: '#c62828'
        }}
      >
        <IoClose size={20} />
      </IconButton>
      <Box
        sx={{
          '& h1': { fontSize: '1.2rem', marginTop: 0 },
          '& h2': { fontSize: '1.1rem', marginTop: 0 },
          '& h3': { fontSize: '1rem', marginTop: 0 },
          '& p': { margin: '0.5rem 0' },
          '& pre': {
            backgroundColor: '#f5f5f5',
            padding: '8px',
            borderRadius: '4px',
            overflow: 'auto'
          },
          '& code': {
            backgroundColor: '#f5f5f5',
            padding: '2px 4px',
            borderRadius: '3px',
            fontFamily: 'monospace'
          },
          '& strong': { color: '#c62828' }
        }}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </Paper>
  );
}
