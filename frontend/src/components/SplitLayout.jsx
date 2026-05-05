import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useUxMode } from '../contexts/UxModeContext.jsx';
import { ClaudeEvents } from '../eventBus';
import { useClaudeEvent } from '../useClaudeEvent';

export default function SplitLayout({ left, right }) {
  const { mode: themeMode } = useThemeMode();
  const { isMinimalistic } = useUxMode();
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('splitRatio');
    return saved ? parseFloat(saved) : 50;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const savedRatioRef = useRef(splitRatio);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isMaximized) {
      localStorage.setItem('splitRatio', splitRatio.toString());
    }
  }, [splitRatio, isMaximized]);

  const handleMaximizeToggle = useCallback(() => {
    setIsMaximized(prev => {
      if (!prev) {
        savedRatioRef.current = splitRatio;
      } else {
        setSplitRatio(savedRatioRef.current);
      }
      return !prev;
    });
  }, [splitRatio]);

  useClaudeEvent(ClaudeEvents.PREVIEW_MAXIMIZE_TOGGLE, handleMaximizeToggle, [handleMaximizeToggle]);

  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMaximized(false);
        setSplitRatio(savedRatioRef.current);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMaximized]);

  const handleMouseDown = () => {
    if (isMaximized) return;
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const newRatio = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    if (newRatio >= 20 && newRatio <= 80) {
      setSplitRatio(newRatio);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <Box ref={containerRef} sx={{ display: 'flex', height: '100%', width: '100%' }}>
      <Box sx={{ width: isMaximized ? '0%' : `${splitRatio}%`, height: '100%', overflow: 'hidden', transition: 'width 0.25s ease' }}>
        {left}
      </Box>

      <Box
        onMouseDown={handleMouseDown}
        sx={{
          width: isMaximized ? '0px' : (isMinimalistic ? '6px' : '12px'),
          height: '100%',
          cursor: isMaximized ? 'default' : 'col-resize',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#fff',
          opacity: isMaximized ? 0 : 1,
          pointerEvents: isMaximized ? 'none' : 'auto',
          transition: 'width 0.25s ease, opacity 0.25s ease',
          '&:hover': {
            backgroundColor: themeMode === 'dark' ? '#444' : '#efefef'
          },
          '&:active': {
            backgroundColor: themeMode === 'dark' ? '#444' : '#efefef'
          }
        }}
      >
        {!isMinimalistic && (
        <Box sx={{
          height: '48px',
          flexShrink: 0,
          backgroundColor: themeMode === 'dark' ? '#383838' : '#fff',
          borderBottom: themeMode === 'dark' ? '1px solid #555' : '1px solid #e0e0e0',
        }} />
        )}
        <Box sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Box sx={{
            width: '2px',
            height: '30px',
            borderLeft: themeMode === 'dark' ? '2px dotted #555' : '2px dotted #ccc',
          }} />
        </Box>
      </Box>

      <Box sx={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        {right}
      </Box>
    </Box>
  );
}
