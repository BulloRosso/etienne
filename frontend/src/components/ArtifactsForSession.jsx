import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, IconButton, TextField, Menu, MenuItem,
  Checkbox, ListItemText, ToggleButtonGroup, ToggleButton, Tooltip,
  CircularProgress,
} from '@mui/material';
import { BsThreeDotsVertical } from 'react-icons/bs';
import {
  DescriptionOutlined, CodeOutlined, StorageOutlined, ImageOutlined,
  HtmlOutlined, InsertDriveFileOutlined,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import { filePreviewHandler } from '../services/FilePreviewHandler';

// ── Category filter definitions ──
const CATEGORIES = {
  data: {
    labelKey: 'artifactsForSession.filterData',
    extensions: ['.csv', '.json', '.jsonl', '.xml', '.yaml', '.yml', '.tsv', '.parquet'],
  },
  office: {
    labelKey: 'artifactsForSession.filterOffice',
    extensions: [
      '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
      '.odt', '.ods', '.odp', '.pdf', '.rtf', '.md',
    ],
  },
  code: {
    labelKey: 'artifactsForSession.filterCode',
    extensions: [
      '.py', '.ts', '.js', '.jsx', '.tsx', '.java', '.go', '.rs',
      '.cpp', '.c', '.h', '.sh', '.sql',
    ],
  },
};

// ── Helpers ──
function getExtension(filePath) {
  const name = filePath.split(/[/\\]/).pop() || '';
  const dotIdx = name.indexOf('.');
  return dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : '';
}

function getFilename(filePath) {
  return (filePath.split(/[/\\]/).pop()) || filePath;
}

function formatTimeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getFileIcon(ext) {
  if (['.html', '.htm'].includes(ext)) return <HtmlOutlined fontSize="small" />;
  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp'].includes(ext)) return <ImageOutlined fontSize="small" />;
  if (CATEGORIES.code.extensions.includes(ext)) return <CodeOutlined fontSize="small" />;
  if (CATEGORIES.data.extensions.includes(ext)) return <StorageOutlined fontSize="small" />;
  if (CATEGORIES.office.extensions.includes(ext)) return <DescriptionOutlined fontSize="small" />;
  return <InsertDriveFileOutlined fontSize="small" />;
}

function getCategoryForExt(ext) {
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (cat.extensions.includes(ext)) return key;
  }
  return null;
}

function parseArtifactsFile(text, projectName) {
  if (!text) return [];
  return text
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => {
      const content = line.slice(2).trim();
      const pipeIdx = content.indexOf('|');
      if (pipeIdx < 0) return null;
      const timestamp = content.slice(0, pipeIdx).trim();
      let path = content.slice(pipeIdx + 1).trim();
      if (!timestamp || !path) return null;
      // Normalize: strip absolute prefix if present (e.g. C:\...\workspace\project\file → file)
      path = path.replace(/\\/g, '/');
      const projectSuffix = `/${projectName}/`;
      const idx = path.indexOf(projectSuffix);
      if (idx >= 0) {
        path = path.slice(idx + projectSuffix.length);
      }
      return { timestamp, path };
    })
    .filter(Boolean);
}

// ── Component ──
export default function ArtifactsForSession({ filename, projectName }) {
  const { t } = useTranslation(["artifactsForSession"]);
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';

  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState('newest');
  const [filterText, setFilterText] = useState('');
  const [categoryFilters, setCategoryFilters] = useState({ data: true, office: true, code: true });
  const [menuAnchor, setMenuAnchor] = useState(null);

  // Fetch and parse the artifacts file
  const fetchArtifacts = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`
      );
      if (res.ok) {
        const text = await res.text();
        setArtifacts(parseArtifactsFile(text, projectName));
      } else {
        setArtifacts([]);
      }
    } catch {
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  }, [filename, projectName]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  // Auto-refresh when claudeHook fires (file changed during session)
  useEffect(() => {
    const handleClaudeHook = (event) => {
      if (event.type === 'claudeHook' && event.detail?.hook === 'PostHook') {
        const normalizedFile = (event.detail.file || '').replace(/\\/g, '/');
        if (normalizedFile.endsWith('.artifacts.md')) {
          fetchArtifacts();
        }
      }
    };
    window.addEventListener('claudeHook', handleClaudeHook);
    return () => window.removeEventListener('claudeHook', handleClaudeHook);
  }, [fetchArtifacts]);

  // Deduplicate by path (keep latest timestamp)
  const dedupedArtifacts = useMemo(() => {
    const map = new Map();
    for (const a of artifacts) {
      const existing = map.get(a.path);
      if (!existing || a.timestamp > existing.timestamp) {
        map.set(a.path, a);
      }
    }
    return [...map.values()];
  }, [artifacts]);

  // Apply filters and sort
  const filteredArtifacts = useMemo(() => {
    let items = dedupedArtifacts;

    // Category filter
    items = items.filter(a => {
      const ext = getExtension(a.path);
      const cat = getCategoryForExt(ext);
      if (cat === null) return true; // uncategorized files always shown
      return categoryFilters[cat];
    });

    // Text filter
    if (filterText.trim()) {
      const lower = filterText.trim().toLowerCase();
      items = items.filter(a => getFilename(a.path).toLowerCase().includes(lower));
    }

    // Sort
    if (sortMode === 'newest') {
      items = [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } else {
      items = [...items].sort((a, b) =>
        getFilename(a.path).toLowerCase().localeCompare(getFilename(b.path).toLowerCase())
      );
    }

    return items;
  }, [dedupedArtifacts, categoryFilters, filterText, sortMode]);

  const handleCardClick = (path) => {
    filePreviewHandler.handlePreview(path, projectName);
  };

  const toggleCategory = (key) => {
    setCategoryFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {/* Left: sort toggle */}
        <ToggleButtonGroup
          value={sortMode}
          exclusive
          onChange={(_, v) => v && setSortMode(v)}
          size="small"
        >
          <ToggleButton value="newest" sx={{ textTransform: 'none', px: 1.5, py: 0.5, fontSize: '0.8rem' }}>
            {t('artifactsForSession:sortNewest')}
          </ToggleButton>
          <ToggleButton value="alpha" sx={{ textTransform: 'none', px: 1.5, py: 0.5, fontSize: '0.8rem' }}>
            {t('artifactsForSession:sortAlpha')}
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        {/* Right: text filter + ellipsis menu */}
        <TextField
          size="small"
          placeholder={t('artifactsForSession:filterPlaceholder')}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          sx={{ width: 160, '& .MuiInputBase-input': { py: 0.75, fontSize: '0.85rem' } }}
        />
        <Tooltip title={t('artifactsForSession:filterCategories') || 'Filter categories'}>
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <BsThreeDotsVertical size={16} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <MenuItem key={key} onClick={() => toggleCategory(key)} dense>
              <Checkbox checked={categoryFilters[key]} size="small" sx={{ p: 0, mr: 1 }} />
              <ListItemText primary={t(cat.labelKey)} primaryTypographyProps={{ fontSize: '0.85rem' }} />
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* Card grid or empty state */}
      {filteredArtifacts.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, opacity: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {dedupedArtifacts.length === 0
              ? t('artifactsForSession:empty')
              : t('artifactsForSession:noMatches')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 1.5,
          overflow: 'auto',
          flex: 1,
        }}>
          {filteredArtifacts.map((artifact) => {
            const ext = getExtension(artifact.path);
            const name = getFilename(artifact.path);
            return (
              <Box
                key={artifact.path}
                onClick={() => handleCardClick(artifact.path)}
                sx={{
                  p: 1.5,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  border: '1px solid #ccc',
                  borderRadius: 1.5,
                  maxHeight: 80,
                  transition: 'background-color 0.15s',
                  '&:hover': {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                    {getFileIcon(ext)}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                    title={name}
                  >
                    {name}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {formatTimeAgo(artifact.timestamp)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
