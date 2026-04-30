import React from 'react';
import { Dialog, DialogTitle, DialogContent, Box, Typography, IconButton } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

const Kbd = ({ children, themeMode }) => (
  <Box
    component="kbd"
    sx={{
      display: 'inline-block',
      px: 0.75,
      py: 0.25,
      mx: 0.25,
      fontSize: '0.8rem',
      fontFamily: 'monospace',
      lineHeight: 1.4,
      color: themeMode === 'dark' ? '#e0e0e0' : '#333',
      backgroundColor: themeMode === 'dark' ? '#444' : '#f5f5f5',
      border: '1px solid',
      borderColor: themeMode === 'dark' ? '#666' : '#ccc',
      borderRadius: '4px',
      boxShadow: themeMode === 'dark' ? '0 1px 0 #333' : '0 1px 0 #bbb',
      minWidth: '24px',
      textAlign: 'center',
    }}
  >
    {children}
  </Box>
);

function formatCombo(combo) {
  return combo.split('+').map(part => {
    switch (part.toLowerCase()) {
      case 'ctrl': return 'Ctrl';
      case 'shift': return 'Shift';
      case 'alt': return 'Alt';
      case '/': return '/';
      case '?': return '?';
      default: return part.toUpperCase();
    }
  });
}

export default function KeyboardShortcutsOverlay({ open, onClose, shortcuts }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();

  // Group shortcuts by category
  const grouped = {};
  for (const [combo, shortcut] of Object.entries(shortcuts)) {
    const category = shortcut.category || 'General';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ combo, ...shortcut });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#fff',
            borderRadius: 2,
          }
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
          {t('shortcuts.title', 'Keyboard shortcuts')}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <IoClose size={20} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {Object.entries(grouped).map(([category, items]) => (
          <Box key={category} sx={{ mb: 2 }}>
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', fontSize: '0.7rem', letterSpacing: 1 }}
            >
              {category}
            </Typography>
            {items.map(({ combo, description }) => (
              <Box
                key={combo}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 0.75,
                  borderBottom: '1px solid',
                  borderColor: themeMode === 'dark' ? '#444' : '#f0f0f0',
                }}
              >
                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                  {description}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 2 }}>
                  {formatCombo(combo).map((part, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <Typography variant="body2" sx={{ mx: 0.25, color: 'text.secondary', fontSize: '0.75rem' }}>
                          +
                        </Typography>
                      )}
                      <Kbd themeMode={themeMode}>{part}</Kbd>
                    </React.Fragment>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}
