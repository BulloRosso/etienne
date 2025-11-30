import React, { memo } from 'react';
import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { ExpandMore, ExpandLess, MoreVert, DragIndicator } from '@mui/icons-material';
import * as FaIcons from 'react-icons/fa';
import * as MdIcons from 'react-icons/md';
import * as IoIcons from 'react-icons/io5';
import * as BiIcons from 'react-icons/bi';
import * as AiIcons from 'react-icons/ai';

// Icon resolver - tries to find icon from various react-icons libraries
const getIcon = (iconName) => {
  if (!iconName) return null;

  // Try different icon libraries
  const libraries = [FaIcons, MdIcons, IoIcons, BiIcons, AiIcons];
  for (const lib of libraries) {
    if (lib[iconName]) {
      return lib[iconName];
    }
  }
  return null;
};

const ScrapbookNode = memo(({ data, selected }) => {
  const {
    label,
    description,
    type,
    iconName,
    priority,
    attentionWeight,
    isExpanded,
    hasChildren,
    borderWidth,
    borderColor,
    backgroundColor,
    borderRadius,
    isActive,
    onToggleExpand,
    onNodeClick,
    onContextMenu,
  } = data;

  const IconComponent = getIcon(iconName);
  const shortDescription = description ? description.substring(0, 30) + (description.length > 30 ? '...' : '') : '';

  return (
    <>
      <Handle type="target" position={Position.Left} id="left" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Right} id="right" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Top} id="top" style={{ background: '#555' }} />

      <Box
        onClick={onNodeClick}
        sx={{
          minWidth: 200,
          maxWidth: 260,
          backgroundColor: backgroundColor || '#ffffff',
          border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none',
          borderRadius: `${borderRadius}px`,
          boxShadow: isActive
            ? '0 0 8px gold, 0 4px 12px rgba(0,0,0,0.25)'
            : '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          position: 'relative',
          pb: IconComponent ? 3 : 1,
          '&:hover': {
            boxShadow: '0 6px 16px rgba(0,0,0,0.2), 0 3px 6px rgba(0,0,0,0.15)',
          },
        }}
      >
        {/* Row 1: Drag Handle, Title, Expand Button */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 1,
            pb: 0.5,
          }}
        >
          <DragIndicator
            className="drag-handle"
            sx={{ fontSize: 16, color: 'text.secondary', cursor: 'grab', mr: 0.5 }}
          />
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              fontWeight: (type === 'ProjectTheme' || type === 'Category') ? 600 : 400,
              fontFamily: 'Roboto',
              fontSize: '14px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: borderColor,
            }}
          >
            {label}
          </Typography>
          {hasChildren && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              sx={{ p: 0.25 }}
            >
              {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          )}
        </Box>

        {/* Row 2: Description, Context Menu */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1,
            pb: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              flex: 1,
              color: 'text.secondary',
              fontFamily: 'Roboto',
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {shortDescription || '\u00A0'}
          </Typography>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e);
            }}
            sx={{ p: 0.25 }}
          >
            <MoreVert fontSize="small" />
          </IconButton>
        </Box>

        {/* Row 3: Icon Badge (overlapping bottom border) */}
        {IconComponent && (
          <Tooltip title={iconName || 'Click to set icon'}>
            <Box
              sx={{
                position: 'absolute',
                bottom: -16,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: '#fff',
                border: `2px solid ${borderColor || '#ccc'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <IconComponent size={20} style={{ color: borderColor || '#666' }} />
            </Box>
          </Tooltip>
        )}

        {/* Empty icon placeholder */}
        {!IconComponent && (
          <Box
            sx={{
              position: 'absolute',
              bottom: -12,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#f5f5f5',
              border: '1px dashed #ccc',
              cursor: 'pointer',
            }}
          />
        )}
      </Box>

      <Handle type="source" position={Position.Left} id="left" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#555' }} />
    </>
  );
});

ScrapbookNode.displayName = 'ScrapbookNode';

export default ScrapbookNode;
