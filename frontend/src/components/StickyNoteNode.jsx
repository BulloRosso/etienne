import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { NodeResizer } from '@xyflow/react';
import { Box, IconButton, Dialog, DialogTitle, DialogContent, ToggleButtonGroup, ToggleButton, Typography } from '@mui/material';
import { Close, VerticalAlignTop, VerticalAlignBottom } from '@mui/icons-material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Light color options for sticky notes
const STICKY_COLORS = {
  gray: '#efefef',
  gold: '#fff3cd',
  purple: '#e8daef',
  red: '#fadbd8',
  green: '#d5f5e3',
};

const StickyNoteNode = ({ data, selected }) => {
  const {
    content,
    onContentChange,
    onDelete,
    color,
    onColorChange,
    textAlign,
    onTextAlignChange,
  } = data;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content || '');
  const [isHovered, setIsHovered] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const textareaRef = useRef(null);
  const clickTimeoutRef = useRef(null);

  const backgroundColor = STICKY_COLORS[color] || STICKY_COLORS.gray;

  useEffect(() => {
    setEditContent(content || '');
  }, [content]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  // Render markdown content safely
  const renderedContent = useMemo(() => {
    if (!content) return '';
    const rawHtml = marked(content, { breaks: true });
    return DOMPurify.sanitize(rawHtml);
  }, [content]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (editContent !== content) {
      onContentChange(editContent);
    }
  }, [editContent, content, onContentChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(content || '');
    }
    // Allow Enter for newlines, Ctrl+Enter to save and exit
    if (e.key === 'Enter' && e.ctrlKey) {
      handleBlur();
    }
  }, [content, handleBlur]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete();
  }, [onDelete]);

  const handleClick = useCallback((e) => {
    // Use timeout to distinguish single click from double click
    if (isEditing) return;

    if (clickTimeoutRef.current) {
      // Double click detected - clear timeout and let handleDoubleClick handle it
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return;
    }

    // Set timeout for single click action
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      setColorPickerOpen(true);
    }, 250); // 250ms delay to detect double click
  }, [isEditing]);

  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    // Clear any pending single click
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setIsEditing(true);
  }, []);

  const handleColorSelect = useCallback((colorKey) => {
    onColorChange(colorKey);
    setColorPickerOpen(false);
  }, [onColorChange]);

  return (
    <>
      <NodeResizer
        minWidth={150}
        minHeight={100}
        isVisible={selected || isHovered}
        lineClassName="sticky-note-resize-line"
        handleClassName="sticky-note-resize-handle"
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
        }}
        lineStyle={{
          borderWidth: 1,
        }}
      />
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
        sx={{
          width: '100%',
          height: '100%',
          backgroundColor: backgroundColor,
          borderRadius: 0,
          padding: '14px',
          paddingTop: '24px',
          fontSize: '12px',
          fontFamily: 'Roboto, sans-serif',
          position: 'relative',
          overflow: 'auto',
          boxShadow: selected
            ? '0 2px 8px rgba(0,0,0,0.2)'
            : '0 1px 4px rgba(0,0,0,0.1)',
          cursor: isEditing ? 'text' : 'pointer',
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* Close button - only visible on hover */}
        {isHovered && (
          <IconButton
            size="small"
            onClick={handleDelete}
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              padding: '2px',
              opacity: 0.6,
              '&:hover': {
                opacity: 1,
                backgroundColor: 'rgba(0,0,0,0.1)',
              },
            }}
          >
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        )}

        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontSize: '10px',
              fontFamily: 'Roboto, sans-serif',
              resize: 'none',
              padding: 0,
              margin: 0,
            }}
            placeholder="Type your note here... (Ctrl+Enter to save, Esc to cancel)"
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: textAlign === 'bottom' ? 'flex-end' : 'flex-start',
              fontSize: '12px',
              '& p': { margin: 0, marginBottom: '0.5em', fontSize: '12px' },
              '& p:last-child': { marginBottom: 0 },
              '& ul, & ol': { margin: 0, paddingLeft: '1.2em', fontSize: '12px' },
              '& code': {
                backgroundColor: 'rgba(0,0,0,0.1)',
                padding: '1px 3px',
                borderRadius: '2px',
                fontSize: '10px',
              },
              '& pre': {
                backgroundColor: 'rgba(0,0,0,0.1)',
                padding: '4px',
                borderRadius: '2px',
                overflow: 'auto',
                fontSize: '10px',
              },
              '& h1, & h2, & h3, & h4, & h5, & h6': {
                marginTop: 0,
                marginBottom: '0.3em',
                fontSize: '13px',
                fontWeight: 600,
              },
              '& a': { color: '#1976d2' },
            }}
          >
            {content ? (
              <div dangerouslySetInnerHTML={{ __html: renderedContent }} />
            ) : (
              <Box sx={{ color: '#999', fontStyle: 'italic' }}>
                Double-click to edit...
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Settings Dialog */}
      <Dialog
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle sx={{ pb: 1, fontSize: '14px' }}>Sticky Note Settings</DialogTitle>
        <DialogContent>
          <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
            Color
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, p: 1, mb: 2 }}>
            {Object.entries(STICKY_COLORS).map(([key, colorValue]) => (
              <Box
                key={key}
                onClick={() => handleColorSelect(key)}
                sx={{
                  width: 40,
                  height: 40,
                  backgroundColor: colorValue,
                  border: color === key ? '3px solid #333' : '1px solid #ccc',
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    transform: 'scale(1.1)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  },
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                title={key.charAt(0).toUpperCase() + key.slice(1)}
              />
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
            Text Alignment
          </Typography>
          <ToggleButtonGroup
            value={textAlign || 'top'}
            exclusive
            onChange={(e, newAlign) => {
              if (newAlign !== null) {
                onTextAlignChange(newAlign);
              }
            }}
            size="small"
          >
            <ToggleButton value="top">
              <VerticalAlignTop sx={{ mr: 0.5, fontSize: 18 }} />
              Top
            </ToggleButton>
            <ToggleButton value="bottom">
              <VerticalAlignBottom sx={{ mr: 0.5, fontSize: 18 }} />
              Bottom
            </ToggleButton>
          </ToggleButtonGroup>
        </DialogContent>
      </Dialog>
    </>
  );
};

StickyNoteNode.displayName = 'StickyNoteNode';

export default StickyNoteNode;
