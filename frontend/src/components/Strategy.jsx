import React, { useState, useEffect } from 'react';
import { Box, Button, CircularProgress, Alert, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Save } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import BackgroundInfo from './BackgroundInfo';

// Import role templates
const roleTemplates = import.meta.glob('../role-templates/*.md', { as: 'raw', eager: true });

export default function Strategy({ projectName, showBackgroundInfo }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');

  // Process role templates into sorted array
  const getRoleOptions = () => {
    return Object.keys(roleTemplates)
      .map(path => {
        // Extract filename without extension from path like '../role-templates/researcher.md'
        const filename = path.split('/').pop().replace('.md', '');
        // Capitalize first letter
        const label = filename.charAt(0).toUpperCase() + filename.slice(1);
        return { value: path, label, filename };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  const handleRoleChange = (event) => {
    const selectedPath = event.target.value;
    setSelectedRole(selectedPath);

    if (selectedPath && roleTemplates[selectedPath]) {
      // Replace content with the selected role template
      setContent(roleTemplates[selectedPath]);
    }
  };

  useEffect(() => {
    loadStrategy();
  }, [projectName]);

  const loadStrategy = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/claude/strategy', {
        projectName
      });
      setContent(response.data.content || '');
    } catch (err) {
      setError('Failed to load strategy');
      console.error('Load strategy error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await axios.post('/api/claude/strategy/save', {
        projectName,
        content
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save strategy');
      console.error('Save strategy error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <BackgroundInfo infoId="system-prompt" showBackgroundInfo={showBackgroundInfo} />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          Strategy saved successfully
        </Alert>
      )}

      <Box sx={{ flex: 1, border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          defaultLanguage="markdown"
          theme="light"
          value={content}
          onChange={(value) => setContent(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel id="predefined-role-label">Predefined Role</InputLabel>
          <Select
            labelId="predefined-role-label"
            id="predefined-role-select"
            value={selectedRole}
            label="Predefined Role"
            onChange={handleRoleChange}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {getRoleOptions().map(role => (
              <MenuItem key={role.value} value={role.value}>
                {role.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
