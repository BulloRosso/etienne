import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { NodeResizer } from '@xyflow/react';
import { Box, IconButton, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { Close, Settings, Check, Clear } from '@mui/icons-material';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';

// Light color options for sticky notes
const STICKY_COLORS = {
  gray: '#efefef',
  gold: '#fff3cd',
  purple: '#e8daef',
  red: '#fadbd8',
  green: '#d5f5e3',
};

const StickyNoteNode = ({ data, selected }) => {
  const { t } = useTranslation();
  const {
    content,
    onContentChange,
    onDelete,
    color,
    onColorChange,
    textAlign,
    onTextAlignChange,
    isEditing,
    onStopEdit,
  } = data;

  const [editContent, setEditContent] = useState(content || '');
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const textareaRef = useRef(null);

  const backgroundColor = STICKY_COLORS[color] || STICKY_COLORS.gray;

  // Sync edit content when external content changes (and not editing)
  useEffect(() => {
    if (!isEditing) {
      setEditContent(content || '');
    }
  }, [content, isEditing]);

  // Focus textarea when entering edit mode
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

  // Save and exit edit mode
  const handleSave = useCallback((e) => {
    if (e) e.stopPropagation();
    if (editContent !== content && onContentChange) {
      onContentChange(editContent);
    }
    if (onStopEdit) {
      onStopEdit();
    }
  }, [editContent, content, onContentChange, onStopEdit]);

  // Cancel and exit edit mode
  const handleCancel = useCallback((e) => {
    if (e) e.stopPropagation();
    setEditContent(content || '');
    if (onStopEdit) {
      onStopEdit();
    }
  }, [content, onStopEdit]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  }, [handleCancel]);

  // Delete handler
  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete();
  }, [onDelete]);

  // Settings handler
  const handleSettings = useCallback((e) => {
    e.stopPropagation();
    setColorPickerOpen(true);
  }, []);

  // Color select handler
  const handleColorSelect = useCallback((colorKey) => {
    onColorChange(colorKey);
    setColorPickerOpen(false);
  }, [onColorChange]);

  return (
    <>
      {/* Only show resizer when in edit mode */}
      {isEditing && (
        <NodeResizer
          minWidth={150}
          minHeight={100}
          isVisible={true}
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
      )}

      <Box
        className={isEditing ? '' : 'nodrag'}
        onKeyDown={handleKeyDown}
        sx={{
          width: '100%',
          height: '100%',
          backgroundColor: backgroundColor,
          borderRadius: 0,
          fontSize: '12px',
          fontFamily: 'Roboto, sans-serif',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: selected
            ? '0 2px 8px rgba(0,0,0,0.2)'
            : '0 1px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          cursor: isEditing ? 'default' : 'pointer',
        }}
      >
        {/* Header bar - always present for drag handle, visible only in edit mode */}
        <Box
          className="sticky-drag-handle"
          sx={{
            height: isEditing ? '24px' : 0,
            minHeight: isEditing ? '24px' : 0,
            overflow: 'hidden',
            backgroundColor: 'rgba(0,0,0,0.08)',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: isEditing ? '1px solid rgba(0,0,0,0.1)' : 'none',
            px: 0.5,
            '&:active': {
              cursor: 'grabbing',
            },
          }}
        >
          {isEditing && (
            <>
              <IconButton
                size="small"
                className="nodrag"
                onPointerUp={(e) => {
                  e.stopPropagation();
                  handleSettings(e);
                }}
                sx={{
                  padding: '4px',
                  opacity: 0.7,
                  '&:hover': {
                    opacity: 1,
                    backgroundColor: 'rgba(0,0,0,0.1)',
                  },
                }}
              >
                <Settings sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton
                size="small"
                className="nodrag"
                onPointerUp={(e) => {
                  e.stopPropagation();
                  handleDelete(e);
                }}
                sx={{
                  padding: '4px',
                  opacity: 0.7,
                  '&:hover': {
                    opacity: 1,
                    backgroundColor: 'rgba(0,0,0,0.1)',
                  },
                }}
              >
                <Close sx={{ fontSize: 16 }} />
              </IconButton>
            </>
          )}
        </Box>

        {/* Content area */}
        <Box className="nodrag nopan" sx={{ flex: 1, padding: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isEditing ? (
            <textarea
              ref={textareaRef}
              className="nowheel nodrag nopan"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: '16px',
                fontFamily: 'Roboto, sans-serif',
                resize: 'none',
                padding: 0,
                margin: 0,
                cursor: 'text',
              }}
              placeholder={t('stickyNote.placeholder')}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: textAlign === 'bottom' ? 'flex-end' : 'flex-start',
                fontSize: '18px',
                '& p': { margin: 0, marginBottom: '0.5em', fontSize: '18px' },
                '& p:last-child': { marginBottom: 0 },
                '& ul, & ol': { margin: 0, paddingLeft: '1.2em', fontSize: '18px' },
                '& code': {
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  padding: '1px 3px',
                  borderRadius: '2px',
                  fontSize: '15px',
                },
                '& pre': {
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  padding: '4px',
                  borderRadius: '2px',
                  overflow: 'auto',
                  fontSize: '15px',
                },
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                  marginTop: 0,
                  marginBottom: '0.3em',
                  fontSize: '20px',
                  fontWeight: 600,
                },
                '& a': { color: '#1976d2' },
              }}
            >
              {content ? (
                <div dangerouslySetInnerHTML={{ __html: renderedContent }} />
              ) : (
                <Box sx={{ color: '#999', fontStyle: 'italic' }}>
                  {t('stickyNote.clickToEdit')}
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Footer bar - only visible in edit mode */}
        {isEditing && (
          <Box
            className="nodrag"
            sx={{
              height: '24px',
              minHeight: '24px',
              backgroundColor: 'rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              borderTop: '1px solid rgba(0,0,0,0.1)',
              px: 0.5,
              gap: 0.5,
            }}
          >
            <IconButton
              size="small"
              className="nodrag"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleCancel(e);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              title={t('stickyNote.cancelEsc')}
              sx={{
                padding: '4px',
                opacity: 0.7,
                '&:hover': {
                  opacity: 1,
                  backgroundColor: 'rgba(0,0,0,0.1)',
                },
              }}
            >
              <Clear sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton
              size="small"
              className="nodrag"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSave(e);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              title={t('common.save')}
              sx={{
                padding: '4px',
                opacity: 0.7,
                '&:hover': {
                  opacity: 1,
                  backgroundColor: 'rgba(0,0,0,0.1)',
                },
              }}
            >
              <Check sx={{ fontSize: 16 }} />
            </IconButton>
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
        <DialogTitle sx={{ pb: 1, fontSize: '14px' }}>{t('stickyNote.colorTitle')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1.5, p: 1 }}>
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
        </DialogContent>
      </Dialog>
    </>
  );
};

StickyNoteNode.displayName = 'StickyNoteNode';

export default StickyNoteNode;
