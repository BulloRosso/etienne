import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch, authSSEUrl } from '../services/api';

/**
 * VideoViewer - Displays video content for .youtube, .mp4, and .videos files
 *
 * - .youtube: filename (basename without extension) is the YouTube video ID
 * - .mp4: filename is the path to a local mp4 file in the project workspace
 * - .videos: file content is a list of .youtube/.mp4 references, one per line,
 *            displayed in a responsive 2-column grid
 */
export default function VideoViewer({ filename, projectName }) {
  const { mode: themeMode } = useThemeMode();
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.endsWith('.videos')) {
    return <VideosPlaylist filename={filename} projectName={projectName} themeMode={themeMode} />;
  }

  if (lowerFilename.endsWith('.youtube')) {
    const basename = filename.split('/').pop().split('\\').pop();
    const videoId = basename.replace(/\.youtube$/i, '');
    return (
      <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
        <YouTubeEmbed videoId={videoId} />
      </Box>
    );
  }

  if (lowerFilename.endsWith('.mp4')) {
    return (
      <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
        <Mp4Player filename={filename} projectName={projectName} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography color="error">Unsupported video format: {filename}</Typography>
    </Box>
  );
}

function YouTubeEmbed({ videoId }) {
  return (
    <Box sx={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
        title={`YouTube video ${videoId}`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </Box>
  );
}

function Mp4Player({ filename, projectName }) {
  const src = authSSEUrl(`/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`);
  return (
    <Box sx={{ width: '100%' }}>
      <video
        controls
        preload="metadata"
        style={{ width: '100%', maxHeight: '80vh' }}
        src={src}
      />
    </Box>
  );
}

function VideosPlaylist({ filename, projectName, themeMode }) {
  const [lines, setLines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!filename || !projectName) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiFetch(
          `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`
        );
        if (!response.ok) throw new Error(`Failed to load: ${response.statusText}`);
        const text = await response.text();
        const entries = text.split('\n').map(l => l.trim()).filter(Boolean);
        setLines(entries);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [filename, projectName]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Error: {error}</Typography>
      </Box>
    );
  }

  if (!lines || lines.length === 0) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">No videos found in playlist.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2,
        }}
      >
        {lines.map((line, idx) => {
          const lower = line.toLowerCase();
          if (lower.endsWith('.youtube')) {
            const basename = line.split('/').pop().split('\\').pop();
            const videoId = basename.replace(/\.youtube$/i, '');
            return (
              <Box key={idx} sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: themeMode === 'dark' ? '#2a2a2a' : '#f5f5f5' }}>
                <YouTubeEmbed videoId={videoId} />
                <Typography variant="caption" sx={{ display: 'block', p: 1, color: 'text.secondary' }}>
                  {videoId}
                </Typography>
              </Box>
            );
          }
          if (lower.endsWith('.mp4')) {
            return (
              <Box key={idx} sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: themeMode === 'dark' ? '#2a2a2a' : '#f5f5f5' }}>
                <Mp4Player filename={line} projectName={projectName} />
                <Typography variant="caption" sx={{ display: 'block', p: 1, color: 'text.secondary' }}>
                  {line}
                </Typography>
              </Box>
            );
          }
          return (
            <Box key={idx} sx={{ p: 2, bgcolor: themeMode === 'dark' ? '#2a2a2a' : '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Unknown format: {line}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
