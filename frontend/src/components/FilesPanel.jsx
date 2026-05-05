import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Tab, Tabs, IconButton, Menu, MenuItem, Divider, Typography } from '@mui/material';
import { IoClose } from 'react-icons/io5';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { CiFileOn } from 'react-icons/ci';
import BackgroundInfo from './BackgroundInfo';
import UserOrders from './UserOrders';
import { VIEWER_COMPONENTS, buildExtensionMap, getViewerForFile } from './viewerRegistry.jsx';
import McpUIPreview from './McpUIPreview';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useUxMode } from '../contexts/UxModeContext.jsx';
import useTabStore from '../stores/useTabStore';
import useTabStateStore from '../stores/useTabStateStore';
import useTabStateSSE from '../hooks/useTabStateSSE';
import { useTranslation } from 'react-i18next';
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { useClaudeEvent } from '../useClaudeEvent';

export default function FilesPanel({ files, projectName, showBackgroundInfo, onCloseTab, onCloseAll, previewersConfig, autoFilePreviewExtensions, onUpdateViewerState }) {
  const { t } = useTranslation(["filesPanel","common"]);
  const { mode: themeMode } = useThemeMode();
  const { isMinimalistic } = useUxMode();
  const { getActiveTab, setActiveTab: storeSetActiveTab, getVisibleIndices, setVisibleIndices: storeSetVisibleIndices } = useTabStore();
  const indicators = useTabStateStore(s => s.indicators);
  const getTabState = useTabStateStore(s => s.getTabState);
  const clearTabState = useTabStateStore(s => s.clearTabState);
  const openFilePaths = useMemo(() => files.map(f => f.path), [files]);
  useTabStateSSE(projectName, openFilePaths);
  const [activeTab, setActiveTabLocal] = useState(() => getActiveTab(projectName));
  const [anchorEl, setAnchorEl] = useState(null);
  const [visibleIndices, setVisibleIndicesLocal] = useState(() => getVisibleIndices(projectName));
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMaximizeToggled = useCallback(() => setIsMaximized(prev => !prev), []);
  useClaudeEvent(ClaudeEvents.PREVIEW_MAXIMIZE_TOGGLE, handleMaximizeToggled, [handleMaximizeToggled]);

  const setActiveTab = (val) => {
    setActiveTabLocal(val);
    storeSetActiveTab(projectName, val);
  };

  const setVisibleIndices = (val) => {
    setVisibleIndicesLocal(val);
    storeSetVisibleIndices(projectName, val);
  };
  const prevFilesRef = React.useRef([]);
  const MAX_VISIBLE_TABS = 6;

  // Initialize visible indices when files change
  useEffect(() => {
    const prevFiles = prevFilesRef.current;
    const prevPaths = prevFiles.map(f => f.path);
    const currPaths = files.map(f => f.path);

    // Skip if only content changed (same paths, same order)
    if (prevPaths.length === currPaths.length && prevPaths.every((p, i) => p === currPaths[i])) {
      prevFilesRef.current = files;
      return;
    }

    // Check if a new file was added
    const newFile = files.find(f => !prevFiles.some(pf => pf.path === f.path));
    if (newFile) {
      const newFileIndex = files.indexOf(newFile);
      // Add new file to visible indices at the beginning and make it active
      const newVisibleIndices = [newFileIndex, ...visibleIndices.filter(i => i !== newFileIndex)].slice(0, MAX_VISIBLE_TABS);
      setVisibleIndices(newVisibleIndices);
      setActiveTab(0);
      prevFilesRef.current = files;
      return;
    }

    // Otherwise, reset visible indices to first MAX_VISIBLE_TABS files
    const newIndices = files.map((_, i) => i).slice(0, MAX_VISIBLE_TABS);
    setVisibleIndices(newIndices);
    if (files.length > 0 && activeTab >= files.length) {
      setActiveTab(0);
    }

    prevFilesRef.current = files;
  }, [files]);

  // Reset active tab if it exceeds visible indices
  useEffect(() => {
    if (visibleIndices.length > 0 && activeTab >= visibleIndices.length) {
      setActiveTab(0);
    }
  }, [activeTab, visibleIndices]);

  const extensionMap = useMemo(
    () => buildExtensionMap(previewersConfig || [], autoFilePreviewExtensions || []),
    [previewersConfig, autoFilePreviewExtensions]
  );

  const getFilename = (path) => {
    if (!path) return '';
    if (path.endsWith('.agent-created-files.artifacts.md')) return t('sidebar.artifacts');
    if (path.startsWith('#imap')) return t('imapInbox.title');
    return path.split(/[/\\]/).pop();
  };

  const handleCloseTab = (event, index) => {
    event.stopPropagation();
    // Get the actual file index from visible indices
    const fileIndex = visibleIndices[index];
    // Adjust active tab before closing
    if (activeTab >= index && activeTab > 0) {
      setActiveTab(activeTab - 1);
    }
    // Call parent callback to actually remove the file
    if (onCloseTab && files[fileIndex]) {
      onCloseTab(files[fileIndex].path);
    }
  };

  const handleOverflowMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleOverflowMenuClose = () => {
    setAnchorEl(null);
  };

  const handleOverflowItemClick = (fileIndex) => {
    // Replace first visible tab with the clicked overflow file
    const newVisibleIndices = [fileIndex, ...visibleIndices.slice(1)];
    setVisibleIndices(newVisibleIndices);
    setActiveTab(0);
    handleOverflowMenuClose();
  };

  const handleCloseAll = () => {
    handleOverflowMenuClose();
    // Call parent callback to clear all files
    if (onCloseAll) {
      onCloseAll();
    }
  };

  // Compute visible files based on visible indices
  const visibleFiles = visibleIndices.map(i => files[i]).filter(f => f);

  // Compute overflow files (files not in visible indices)
  const overflowIndices = files.map((_, i) => i).filter(i => !visibleIndices.includes(i));
  const overflowFiles = overflowIndices.map(i => ({ file: files[i], index: i })).filter(item => item.file);
  const hasOverflow = overflowFiles.length > 0;

  const HIDDEN_OVERFLOW_VIEWERS = new Set(['workflow', 'excel', 'prompt', 'scrapbook', 'knowledge']);

  const renderFileContent = (file) => {
    if (!file) return null;

    const viewerName = getViewerForFile(file.path, extensionMap);

    // MCP UI previewers: render via McpUIPreview instead of a local component
    const previewerConfig = previewersConfig?.find(p => p.viewer === viewerName);
    if (previewerConfig?.type === 'mcpui' && previewerConfig.mcpGroup) {
      return (
        <Box sx={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <McpUIPreview
            filename={file.path}
            content={file.content}
            mcpGroup={previewerConfig.mcpGroup}
            mcpToolName={previewerConfig.mcpToolName || 'render_file'}
            projectName={projectName}
            onViewerStateChange={(state) => onUpdateViewerState?.(file.path, {
              viewerName: previewerConfig.viewer,
              ...state,
            })}
          />
        </Box>
      );
    }

    const renderFn = viewerName ? VIEWER_COMPONENTS[viewerName] : null;

    if (renderFn) {
      const useHiddenOverflow = HIDDEN_OVERFLOW_VIEWERS.has(viewerName);
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: useHiddenOverflow ? 'hidden' : 'auto',
            border: 0,
          }}
        >
          {renderFn(file, projectName, (state) => onUpdateViewerState?.(file.path, { viewerName, ...state }))}
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '12px' }}>
          {file.content}
        </pre>
      </Box>
    );
  };

  if (files.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <BackgroundInfo infoId="live-changes" showBackgroundInfo={showBackgroundInfo} />
        </Box>
        {/* User Orders carousel — in minimalistic mode, only takes space when orders exist */}
        <Box sx={{ flex: isMinimalistic ? 'none' : 1, display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0 }}>
          <UserOrders minimal={isMinimalistic} />
        </Box>

        {/* Lower 50%: Background image */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
            overflow: 'hidden'
          }}
        >
          <img
            src="/workspace-placeholder.png"
            alt={t('filesPanel:workspacePlaceholderAlt')}
            style={{
              maxWidth: '60%',
              maxHeight: '60%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              opacity: themeMode === 'dark' ? 1 : 0.6
            }}
          />
          <Typography
            variant="body2"
            sx={{
              mt: 2,
              color: 'grey.500',
              textAlign: 'center'
            }}
          >
            {t('filesPanel:workspacePlaceholder')}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: themeMode === 'dark' ? 'transparent' : (isMinimalistic ? '#fafafa' : '#efefef') }}>
      <Box sx={{ p: 1, pb: 0 }}>
        <BackgroundInfo infoId="live-changes" showBackgroundInfo={showBackgroundInfo} />
      </Box>

      {/* Tab Strip */}
      <Box sx={{ borderBottom: 0, borderColor: 'divider', display: 'flex', alignItems: 'center', backgroundColor: themeMode === 'dark' ? 'transparent' : (isMinimalistic ? '#fafafa' : '#efefef') }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => {
            const targetFile = visibleFiles[newValue];
            if (targetFile) clearTabState(projectName, targetFile.path);
            setActiveTab(newValue);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            flex: 1,
            minHeight: 32,
            '& .MuiTabs-indicator': {
              top: 0,
              bottom: 'unset',
              backgroundColor: 'gold',
              height: '3px',
            },
          }}
        >
          {visibleFiles.map((file, index) => (
            <Tab
              key={file.path}
              onDoubleClick={() => claudeEventBus.publish(ClaudeEvents.PREVIEW_MAXIMIZE_TOGGLE)}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <CiFileOn size={14} />
                    {index !== activeTab && (() => {
                      const state = getTabState(projectName, file.path);
                      if (!state) return null;
                      const colorMap = { green: '#4caf50', orange: '#ff9800', red: '#f44336' };
                      return (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: -3,
                            left: -3,
                            mt: '6px',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            border: '1px solid white',
                            backgroundColor: colorMap[state.color] || 'transparent',
                          }}
                        />
                      );
                    })()}
                  </Box>
                  <span>{getFilename(file.path)}</span>
                  <Box
                    component="span"
                    onClick={(e) => handleCloseTab(e, index)}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      p: 0.25,
                      ml: 0.5,
                      cursor: 'pointer',
                      borderRadius: '2px',
                      '&:hover': { backgroundColor: 'rgba(0,0,0,0.08)' }
                    }}
                  >
                    <IoClose size={12} />
                  </Box>
                </Box>
              }
              sx={{
                textTransform: 'none',
                minHeight: 32,
                minWidth: 60,
                padding: '4px 8px',
                fontSize: '0.75rem',
                color: themeMode === 'dark' ? '#ccc' : 'black',
                backgroundColor: themeMode === 'dark' ? '#111' : '#ccc',
                '& svg': { color: themeMode === 'dark' ? '#ccc' : 'inherit' },
                '&.Mui-selected': {
                  color: themeMode === 'dark' ? '#fff' : 'black',
                  fontWeight: 'bold',
                  backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#ffffff',
                  '& svg': { color: themeMode === 'dark' ? '#fff' : 'black' },
                },
              }}
            />
          ))}
        </Tabs>

        {/* Overflow Menu */}
        {hasOverflow && (
          <>
            <IconButton
              onClick={handleOverflowMenuOpen}
              sx={{ mx: 1, color: '#ffffff' }}
              size="small"
            >
              <BsThreeDotsVertical />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleOverflowMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {overflowFiles.map((item) => (
                <MenuItem
                  key={item.file.path}
                  onClick={() => handleOverflowItemClick(item.index)}
                  sx={{ fontSize: '0.875rem' }}
                >
                  {item.file.path}
                </MenuItem>
              ))}
              <Divider />
              <MenuItem onClick={handleCloseAll} sx={{ fontSize: '0.875rem', color: 'error.main' }}>
                {t('filesPanel:closeAll')}
              </MenuItem>
            </Menu>
          </>
        )}

        {/* Maximize / Minimize toggle */}
        <IconButton
          onClick={() => claudeEventBus.publish(ClaudeEvents.PREVIEW_MAXIMIZE_TOGGLE)}
          size="small"
          sx={{ ml: 'auto', mr: '20px', mt: '-3px', color: themeMode === 'dark' ? '#ccc' : '#555' }}
        >
          {isMaximized ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
        </IconButton>
      </Box>

      {/* Content Area */}
      <Box sx={{ flex: 1, overflow: 'hidden', border: 0, position: 'relative', backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#ffffff' }}>
        {visibleFiles[activeTab] && renderFileContent(visibleFiles[activeTab])}
      </Box>
    </Box>
  );
}
