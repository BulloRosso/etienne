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
import { reconcileVisiblePaths } from '../utils/tabVisibility';
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
  const { getActiveTabPath, setActiveTabPath: storeSetActiveTabPath, getVisiblePaths, setVisiblePaths: storeSetVisiblePaths } = useTabStore();
  const indicators = useTabStateStore(s => s.indicators);
  const getTabState = useTabStateStore(s => s.getTabState);
  const clearTabState = useTabStateStore(s => s.clearTabState);
  const openFilePaths = useMemo(() => files.map(f => f.path), [files]);
  useTabStateSSE(projectName, openFilePaths);
  const [activePath, setActivePathLocal] = useState(() => getActiveTabPath(projectName));
  const [anchorEl, setAnchorEl] = useState(null);
  const [visiblePaths, setVisiblePathsLocal] = useState(() => getVisiblePaths(projectName));
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMaximizeToggled = useCallback(() => setIsMaximized(prev => !prev), []);
  useClaudeEvent(ClaudeEvents.PREVIEW_MAXIMIZE_TOGGLE, handleMaximizeToggled, [handleMaximizeToggled]);

  const setActivePath = (path) => {
    setActivePathLocal(path);
    storeSetActiveTabPath(projectName, path);
  };

  const setVisiblePaths = (paths) => {
    setVisiblePathsLocal(paths);
    storeSetVisiblePaths(projectName, paths);
  };
  const prevFilesRef = React.useRef([]);
  const MAX_VISIBLE_TABS = 6;

  // Reconcile visible tabs whenever the set of open files changes. Visibility
  // is tracked by path, so adds/removes/reorders of `files` can't leave the
  // tab strip pointing at the wrong entries. Handles any number of files
  // added in a single update (e.g. batched setFiles calls during tab restore).
  useEffect(() => {
    const prevPaths = prevFilesRef.current.map(f => f.path);
    const currPaths = files.map(f => f.path);
    prevFilesRef.current = files;

    // Skip if only content changed (same paths, same order)
    if (prevPaths.length === currPaths.length && prevPaths.every((p, i) => p === currPaths[i])) {
      return;
    }

    const { visible, newPaths } = reconcileVisiblePaths(prevPaths, currPaths, visiblePaths, MAX_VISIBLE_TABS);
    setVisiblePaths(visible);

    if (newPaths.length > 0) {
      setActivePath(newPaths[0]);
    } else if (!visible.includes(activePath)) {
      setActivePath(visible[0] ?? null);
    }
  }, [files]);

  // When a preview is requested for a file that's already open, promote it to
  // a visible tab and activate it. Without this, requesting a file that lives
  // in the overflow menu (or is already visible but not active) appears as a
  // no-op — setFiles doesn't change `files`, so the file-change effect above
  // never fires.
  useEffect(() => {
    const handlePreviewRequest = (data) => {
      if (!data?.action?.endsWith('-preview') || !data?.filePath) return;

      // Service viewers share a slot per service prefix (#imap/... replaces
      // the existing #imap/* tab in App.jsx), so match on prefix rather than
      // full path to find the existing tab.
      const isService = data.filePath.startsWith('#');
      const servicePrefix = isService ? '#' + data.filePath.substring(1).split('/')[0] : null;

      const targetFile = files.find(f =>
        isService ? f.path.startsWith(servicePrefix) : f.path === data.filePath
      );
      if (!targetFile) return; // New file — the files-change effect will handle activation.

      if (!visiblePaths.includes(targetFile.path)) {
        setVisiblePaths([targetFile.path, ...visiblePaths].slice(0, MAX_VISIBLE_TABS));
      }
      if (activePath !== targetFile.path) {
        setActivePath(targetFile.path);
      }
    };

    const unsubscribe = claudeEventBus.subscribe(ClaudeEvents.FILE_PREVIEW_REQUEST, handlePreviewRequest);
    return () => unsubscribe();
  }, [files, visiblePaths, activePath]);

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

  const handleCloseTab = (event, path) => {
    event.stopPropagation();
    // If the active tab is being closed, hand focus to its right neighbor
    // (or left, if it was last). The files-change effect prunes the closed
    // path from visiblePaths and promotes an overflow file into the free slot.
    if (path === activePath) {
      const idx = visiblePaths.indexOf(path);
      setActivePath(visiblePaths[idx + 1] ?? visiblePaths[idx - 1] ?? null);
    }
    // Call parent callback to actually remove the file
    if (onCloseTab) {
      onCloseTab(path);
    }
  };

  const handleOverflowMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleOverflowMenuClose = () => {
    setAnchorEl(null);
  };

  const handleOverflowItemClick = (path) => {
    // Promote the clicked overflow file to the front; the last visible tab
    // drops into the overflow menu if the strip is full.
    setVisiblePaths([path, ...visiblePaths.filter(p => p !== path)].slice(0, MAX_VISIBLE_TABS));
    setActivePath(path);
    handleOverflowMenuClose();
  };

  const handleCloseAll = () => {
    handleOverflowMenuClose();
    // Call parent callback to clear all files
    if (onCloseAll) {
      onCloseAll();
    }
  };

  // Compute visible files based on visible paths
  const visibleFiles = visiblePaths.map(p => files.find(f => f.path === p)).filter(Boolean);

  // Compute overflow files (open files without a visible tab)
  const overflowFiles = files.filter(f => !visiblePaths.includes(f.path));
  const hasOverflow = overflowFiles.length > 0;

  const activeFile = visibleFiles.find(f => f.path === activePath) || null;
  // MUI Tabs warns if `value` doesn't match a rendered tab (transiently
  // possible between a close and the reconciliation effect), so fall back
  // to `false` (no selection) in that case.
  const tabsValue = activeFile ? activeFile.path : false;

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
          value={tabsValue}
          onChange={(e, newValue) => {
            clearTabState(projectName, newValue);
            setActivePath(newValue);
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
          {visibleFiles.map((file) => (
            <Tab
              key={file.path}
              value={file.path}
              onDoubleClick={() => claudeEventBus.publish(ClaudeEvents.PREVIEW_MAXIMIZE_TOGGLE)}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <CiFileOn size={14} />
                    {file.path !== activePath && (() => {
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
                    onClick={(e) => handleCloseTab(e, file.path)}
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
              {overflowFiles.map((file) => (
                <MenuItem
                  key={file.path}
                  onClick={() => handleOverflowItemClick(file.path)}
                  sx={{ fontSize: '0.875rem' }}
                >
                  {file.path}
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
        {activeFile && renderFileContent(activeFile)}
      </Box>
    </Box>
  );
}
