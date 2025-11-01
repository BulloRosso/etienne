import React, { useState, useEffect } from 'react';
import { Box, Typography, Tab, Tabs, IconButton, Menu, MenuItem, Divider } from '@mui/material';
import { BsRobot } from 'react-icons/bs';
import { IoClose } from 'react-icons/io5';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { CiFileOn } from 'react-icons/ci';
import LiveHTMLPreview from './LiveHTMLPreview';
import JSONViewer from './JSONViewer';
import MarkdownViewer from './MarkdownViewer';
import MermaidViewer from './MermaidViewer';
import ResearchDocument from './ResearchDocument';
import ImageViewer from './ImageViewer';
import ExcelViewer from './ExcelViewer';
import BackgroundInfo from './BackgroundInfo';

export default function FilesPanel({ files, projectName, showBackgroundInfo, onCloseTab, onCloseAll }) {
  const [activeTab, setActiveTab] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [visibleIndices, setVisibleIndices] = useState([]);
  const prevFilesRef = React.useRef([]);
  const MAX_VISIBLE_TABS = 6;

  // Initialize visible indices when files change
  useEffect(() => {
    const prevFiles = prevFilesRef.current;

    // Check if a new file was added
    if (files.length > prevFiles.length) {
      // Find the newly added file
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

  const isHtmlFile = (filename) => {
    return filename && (filename.endsWith('.html') || filename.endsWith('.htm'));
  };

  const isJsonFile = (filename) => {
    return filename && filename.endsWith('.json');
  };

  const isMarkdownFile = (filename) => {
    return filename && filename.endsWith('.md');
  };

  const isMermaidFile = (filename) => {
    return filename && filename.endsWith('.mermaid');
  };

  const isResearchFile = (filename) => {
    return filename && filename.endsWith('.research');
  };

  const isImageFile = (filename) => {
    return filename && (filename.endsWith('.jpg') || filename.endsWith('.jpeg') ||
                        filename.endsWith('.png') || filename.endsWith('.gif'));
  };

  const isExcelFile = (filename) => {
    return filename && (filename.endsWith('.xls') || filename.endsWith('.xlsx'));
  };

  const getFilename = (path) => {
    if (!path) return '';
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

  const renderFileContent = (file) => {
    if (!file) return null;

    if (isHtmlFile(file.path)) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <LiveHTMLPreview filename={file.path} projectName={projectName} />
        </Box>
      );
    }

    if (isJsonFile(file.path)) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <JSONViewer filename={file.path} projectName={projectName} />
        </Box>
      );
    }

    if (isMarkdownFile(file.path)) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <MarkdownViewer filename={file.path} projectName={projectName} />
        </Box>
      );
    }

    if (isMermaidFile(file.path)) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <MermaidViewer filename={file.path} projectName={projectName} />
        </Box>
      );
    }

    if (isResearchFile(file.path)) {
      // For research files, we need to extract input and output from the file path
      // The ResearchDocument component expects input and output parameters
      // For now, we'll use the file path as the output and assume no input file tracking needed
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ResearchDocument
            input=""
            output={file.path}
            projectName={projectName}
          />
        </Box>
      );
    }

    if (isImageFile(file.path)) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ImageViewer filename={file.path} projectName={projectName} />
        </Box>
      );
    }

    if (isExcelFile(file.path)) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ExcelViewer filename={file.path} projectName={projectName} />
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
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ccc',
            fontSize: '36px',
            textAlign: 'center',
            gap: 2
          }}
        >
          <BsRobot size={72} color="#ccc" />
          <Box>
            <Typography sx={{ fontSize: '36px', color: '#ccc', lineHeight: 1.2 }}>
              Use Case
            </Typography>
            <Typography sx={{ fontSize: '36px', color: '#ccc', fontWeight: 'bold', lineHeight: 1.2 }}>
              Virtual Collaborator/Expert
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#13579b' }}>
      <Box sx={{ p: 2, pb: 0 }}>
        <BackgroundInfo infoId="live-changes" showBackgroundInfo={showBackgroundInfo} />
      </Box>

      {/* Tab Strip */}
      <Box sx={{ borderBottom: 0, borderColor: 'divider', display: 'flex', alignItems: 'center', backgroundColor: '#13579b' }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ flex: 1, minHeight: 32, '& .MuiTabs-indicator': { backgroundColor: 'gold' } }}
        >
          {visibleFiles.map((file, index) => (
            <Tab
              key={file.path}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CiFileOn size={14} style={{ color: '#ffffff' }} />
                  <span>{getFilename(file.path)}</span>
                  <IconButton
                    size="small"
                    onClick={(e) => handleCloseTab(e, index)}
                    sx={{
                      p: 0.25,
                      ml: 0.5,
                      color: '#ffffff',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' }
                    }}
                  >
                    <IoClose size={12} />
                  </IconButton>
                </Box>
              }
              sx={{
                textTransform: 'none',
                minHeight: 32,
                minWidth: 60,
                padding: '4px 8px',
                fontSize: '0.75rem',
                color: '#ffffff',
                '&.Mui-selected': { color: 'gold' }
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
                Close All
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>

      {/* Content Area */}
      <Box sx={{ flex: 1, overflow: 'hidden', border: 0, position: 'relative', backgroundColor: '#ffffff' }}>
        {visibleFiles[activeTab] && renderFileContent(visibleFiles[activeTab])}
      </Box>
    </Box>
  );
}
