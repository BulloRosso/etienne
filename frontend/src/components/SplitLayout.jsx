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
  // 'none' | 'left' (chat full) | 'right' (preview full)
  const [maximizedSide, setMaximizedSide] = useState('none');
  const isMaximized = maximizedSide !== 'none';
  const savedRatioRef = useRef(splitRatio);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isMaximized) {
      localStorage.setItem('splitRatio', splitRatio.toString());
    }
  }, [splitRatio, isMaximized]);

  const toggleSide = useCallback((side) => {
    setMaximizedSide(prev => {
      if (prev === side) {
        setSplitRatio(savedRatioRef.current);
        return 'none';
      }
      if (prev === 'none') {
        savedRatioRef.current = splitRatio;
      }
      return side;
    });
  }, [splitRatio]);

  const handlePreviewMaximizeToggle = useCallback(() => toggleSide('right'), [toggleSide]);
  const handleChatMaximizeToggle = useCallback(() => toggleSide('left'), [toggleSide]);

  useClaudeEvent(ClaudeEvents.PREVIEW_MAXIMIZE_TOGGLE, handlePreviewMaximizeToggle, [handlePreviewMaximizeToggle]);
  useClaudeEvent(ClaudeEvents.CHAT_MAXIMIZE_TOGGLE, handleChatMaximizeToggle, [handleChatMaximizeToggle]);

  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMaximizedSide('none');
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
    if (!isDragging) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // While dragging, neutralise pointer events on every iframe so the
    // splitter keeps receiving mousemove. Otherwise the iframe (e.g. an
    // MCP UI previewer) swallows the mouse the moment the cursor crosses
    // into it, and the drag stops following the cursor.
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const previousPointerEvents = iframes.map((f) => f.style.pointerEvents);
    iframes.forEach((f) => { f.style.pointerEvents = 'none'; });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      iframes.forEach((f, i) => { f.style.pointerEvents = previousPointerEvents[i] || ''; });
    };
  }, [isDragging]);

  return (
    <Box ref={containerRef} sx={{ display: 'flex', height: '100%', width: '100%' }}>
      <Box sx={{
        width: maximizedSide === 'right' ? '0%' : (maximizedSide === 'left' ? '100%' : `${splitRatio}%`),
        height: '100%',
        overflow: 'hidden',
        transition: 'width 0.25s ease',
      }}>
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

      <Box sx={{
        flex: maximizedSide === 'left' ? '0 0 0%' : 1,
        width: maximizedSide === 'left' ? '0%' : undefined,
        height: '100%',
        overflow: 'hidden',
        transition: 'flex-basis 0.25s ease, width 0.25s ease',
      }}>
        {right}
      </Box>
    </Box>
  );
}
