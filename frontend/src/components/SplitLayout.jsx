import React, { useState, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

export default function SplitLayout({ left, right }) {
  const { mode: themeMode } = useThemeMode();
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('splitRatio');
    return saved ? parseFloat(saved) : 50;
  });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('splitRatio', splitRatio.toString());
  }, [splitRatio]);

  const handleMouseDown = () => {
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
      <Box sx={{ width: `${splitRatio}%`, height: '100%', overflow: 'hidden' }}>
        {left}
      </Box>

      <Box
        onMouseDown={handleMouseDown}
        sx={{
          width: '12px',
          height: '100%',
          cursor: 'col-resize',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#fff',
          '&:hover': {
            backgroundColor: themeMode === 'dark' ? '#444' : '#efefef'
          },
          '&:active': {
            backgroundColor: themeMode === 'dark' ? '#444' : '#efefef'
          }
        }}
      >
        <Box sx={{
          height: '48px',
          flexShrink: 0,
          backgroundColor: themeMode === 'dark' ? '#383838' : '#fff',
          borderBottom: themeMode === 'dark' ? '1px solid #555' : '1px solid #e0e0e0',
        }} />
        <Box sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Box sx={{
            width: '2px',
            height: '30px',
            backgroundColor: '#ccc',
            borderRadius: '1px'
          }} />
        </Box>
      </Box>

      <Box sx={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        {right}
      </Box>
    </Box>
  );
}
