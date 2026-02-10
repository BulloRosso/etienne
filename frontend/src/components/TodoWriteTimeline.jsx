import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import LoopIcon from '@mui/icons-material/Loop';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

/**
 * TodoWrite displayed in timeline format - shows the full todo list inline
 */
export default function TodoWriteTimeline({ args, showBullet = true }) {
  const { mode: themeMode } = useThemeMode();
  const todos = args?.todos || args?.newTodos || args?.oldTodos || [];

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
          backgroundColor: themeMode === 'dark' ? '#ccc' : '#e0e0e0'
        }}
      />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ml: showBullet ? 0 : '10px' }}>
        {/* Timeline point */}
        {showBullet && (
          <Box
            sx={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: themeMode === 'dark' ? '#fff' : '#2196f3',
              zIndex: 1,
              flexShrink: 0,
              mt: 0.5,
              ml: '-3px'
            }}
          />
        )}

        {/* Tool icon */}
        <ContentPasteOutlinedIcon sx={{ fontSize: '18px', color: themeMode === 'dark' ? '#ccc' : '#666', flexShrink: 0 }} />

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
          TodoWrite
        </Typography>

        {/* Description */}
        <Typography
          variant="body2"
          sx={{
            color: themeMode === 'dark' ? '#ccc' : '#666',
            flex: 1
          }}
        >
          Task list updated
        </Typography>
      </Box>

      {/* Todo list content */}
      <Box sx={{ ml: showBullet ? '10px' : '20px' }}>
        {todos.length === 0 ? (
          <Paper sx={{ p: 1.5, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ color: '#999', fontStyle: 'italic' }}>
              No tasks
            </Typography>
          </Paper>
        ) : (
          <Paper sx={{ p: 1.5, backgroundColor: '#fafafa', borderRadius: 1, border: '1px solid #e0e0e0' }}>
            {todos.map((todo, index) => {
              const isCompleted = todo.status === 'completed';
              const isInProgress = todo.status === 'in_progress';

              // Choose icon based on status
              let IconComponent;
              let iconColor = '#555';
              let iconSx = { fontSize: '18px' };

              if (isCompleted) {
                IconComponent = CheckBoxOutlinedIcon;
                iconColor = '#999';
              } else if (isInProgress) {
                IconComponent = LoopIcon;
                iconColor = '#2196f3';
                iconSx = {
                  ...iconSx,
                  animation: 'spin 2s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(360deg)' },
                    '100%': { transform: 'rotate(0deg)' }
                  }
                };
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
                    gap: 1,
                    py: 0.5,
                    px: 0.75,
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
                      fontSize: '0.85rem'
                    }}
                  >
                    {displayText}
                  </Typography>
                </Box>
              );
            })}
          </Paper>
        )}
      </Box>
    </Box>
  );
}
