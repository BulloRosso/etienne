import React, { useState, useEffect } from 'react';
import { Box, Button, CircularProgress, Alert, FormControlLabel, Checkbox } from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import axios from 'axios';

export default function Filesystem({ projectName }) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSystemFiles, setShowSystemFiles] = useState(false);

  useEffect(() => {
    loadFilesystem();
  }, [projectName]);

  const loadFilesystem = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/claude/filesystem', {
        projectName
      });
      setTree(response.data.tree || []);
    } catch (err) {
      setError('Failed to load filesystem');
      console.error('Load filesystem error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterSystemFiles = (nodes) => {
    if (showSystemFiles) return nodes;

    return nodes.filter(node => {
      // Filter out CLAUDE.md in root and data folder
      if (node.label === 'CLAUDE.md' || node.label === 'data') {
        return false;
      }

      // Recursively filter children
      if (node.children) {
        node.children = filterSystemFiles(node.children);
      }

      return true;
    });
  };

  const renderTree = (nodes) => {
    return nodes.map((node) => {
      const isFolder = node.type === 'folder';

      const slots = isFolder
        ? {
            expandIcon: () => <FolderOutlined sx={{ color: '#999' }} />,
            collapseIcon: () => <FolderOpenOutlined sx={{ color: '#999' }} />
          }
        : {
            icon: () => <DescriptionOutlined sx={{ color: '#999' }} />
          };

      return (
        <TreeItem
          key={node.id}
          itemId={node.id}
          label={node.label}
          slots={slots}
        >
          {isFolder && node.children && renderTree(node.children)}
        </TreeItem>
      );
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, height: '96%', p: 2, mr: '0px' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1, border: '1px solid #ddd', borderRadius: 1, overflow: 'auto', p: 1, mr: '0px' }}>
        <SimpleTreeView sx={{ fontSize: '90%', fontWeight: 300 }}>
          {renderTree(filterSystemFiles(tree))}
        </SimpleTreeView>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={showSystemFiles}
              onChange={(e) => setShowSystemFiles(e.target.checked)}
            />
          }
          label="Show System Files"
          sx={{ ml: 2 }}
        />
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadFilesystem}
        >
          Refresh
        </Button>
      </Box>
    </Box>
  );
}
