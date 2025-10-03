import React, { useState, useEffect } from 'react';
import { Box, IconButton } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { MdInfoOutline } from 'react-icons/md';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function BackgroundInfo({ infoId, showBackgroundInfo }) {
  const [visible, setVisible] = useState(false);
  const [infoData, setInfoData] = useState(null);

  useEffect(() => {
    // Don't show if setting is disabled
    if (!showBackgroundInfo) {
      setVisible(false);
      return;
    }

    // Check if this toast has been closed before
    const closedToasts = JSON.parse(localStorage.getItem('closedBackgroundInfo') || '[]');
    if (closedToasts.includes(infoId)) {
      setVisible(false);
      return;
    }

    // Load the background info data
    fetch('/background-info/data.json')
      .then(res => res.json())
      .then(data => {
        const info = data.backgroundInfo.find(item => item.infoId === infoId);
        if (info) {
          setInfoData(info);
          setVisible(true);
        }
      })
      .catch(err => {
        console.error('Failed to load background info:', err);
      });
  }, [infoId, showBackgroundInfo]);

  const handleClose = () => {
    // Mark this toast as closed in localStorage
    const closedToasts = JSON.parse(localStorage.getItem('closedBackgroundInfo') || '[]');
    if (!closedToasts.includes(infoId)) {
      closedToasts.push(infoId);
      localStorage.setItem('closedBackgroundInfo', JSON.stringify(closedToasts));
    }
    setVisible(false);
  };

  if (!visible || !infoData) {
    return null;
  }

  // Render markdown content
  const htmlContent = DOMPurify.sanitize(marked.parse(infoData.content));

  // Get icon component
  const IconComponent = infoData.icon ? getIconComponent(infoData.icon) : MdInfoOutline;

  return (
    <Box
      sx={{
        backgroundColor: '#FFFBEA',
        border: '1px solid #D4AF37',
        borderRadius: 2,
        p: 2,
        mb: 2,
        display: 'flex',
        gap: 2,
        position: 'relative'
      }}
    >
      {/* Icon */}
      <Box sx={{ flexShrink: 0, pt: 0.5 }}>
        <IconComponent size={24} style={{ color: '#B8860B' }} />
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          color: '#B8860B',
          '& p': { margin: 0, marginBottom: 1 },
          '& p:last-child': { marginBottom: 0 },
          '& strong': { fontWeight: 600 },
          '& a': { color: '#8B6914', textDecoration: 'underline' },
          fontSize: '0.95rem',
          lineHeight: 1.6
        }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />

      {/* Close Button */}
      <Box sx={{ flexShrink: 0 }}>
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{
            color: '#B8860B',
            '&:hover': {
              backgroundColor: 'rgba(184, 134, 11, 0.1)'
            }
          }}
        >
          <IoClose size={20} />
        </IconButton>
      </Box>
    </Box>
  );
}

// Helper function to dynamically get icon component from react-icons
function getIconComponent(iconPath) {
  // iconPath format: "react-icons/md/MdSecurity"
  // For simplicity, we'll just use the default icon for now
  // In a production app, you'd want to import and map all possible icons
  return MdInfoOutline;
}
