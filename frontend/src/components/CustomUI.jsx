import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  IconButton,
  Divider,
  Alert,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Breadcrumbs,
  Link,
} from '@mui/material';
import { TbPlus, TbTrash, TbFolder, TbFolderOpen } from 'react-icons/tb';
import { PiFile } from 'react-icons/pi';

const CustomUI = ({ project, onSave }) => {
  const [config, setConfig] = useState({
    appBar: {
      title: '',
      fontColor: 'white',
      backgroundColor: '#1976d2',
    },
    welcomePage: {
      message: '',
      backgroundColor: '#f5f5f5',
      quickActions: [],
      showWelcomeMessage: true,
    },
    previewDocuments: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [welcomeChatMessage, setWelcomeChatMessage] = useState('');
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [filePickerIndex, setFilePickerIndex] = useState(null);
  const [currentPath, setCurrentPath] = useState('');
  const [filesAndFolders, setFilesAndFolders] = useState([]);

  useEffect(() => {
    if (project) {
      loadConfig();
    }
  }, [project]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/workspace/${project}/user-interface`);

      if (response.ok) {
        const data = await response.json();
        if (data) {
          setConfig({
            appBar: {
              title: data.appBar?.title || '',
              fontColor: data.appBar?.fontColor || 'white',
              backgroundColor: data.appBar?.backgroundColor || '#1976d2',
            },
            welcomePage: {
              message: data.welcomePage?.message || '',
              backgroundColor: data.welcomePage?.backgroundColor || '#f5f5f5',
              quickActions: data.welcomePage?.quickActions || [],
              showWelcomeMessage: data.welcomePage?.showWelcomeMessage !== false,
            },
            previewDocuments: data.previewDocuments || [],
          });
        }
      } else {
        // If file doesn't exist (404 or other non-OK status), just use default config
        // Don't show error for missing config file
        console.log('No UI configuration found, using defaults');
      }

      // Load welcome chat message from assistant.json
      try {
        const assistantRes = await fetch('/api/claude/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: project })
        });
        if (assistantRes.ok) {
          const assistantData = await assistantRes.json();
          setWelcomeChatMessage(assistantData?.assistant?.greeting || '');
        }
      } catch (err) {
        console.error('Failed to load welcome chat message:', err);
      }
    } catch (err) {
      setError('Failed to load UI configuration');
      console.error('Error loading UI config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSuccess(false);

      const response = await fetch(`/api/workspace/${project}/user-interface`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        // Save welcome chat message to assistant.json
        try {
          const assistantConfig = {
            assistant: {
              greeting: welcomeChatMessage
            }
          };
          await fetch('/api/claude/addFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_dir: project,
              file_name: 'data/assistant.json',
              file_content: JSON.stringify(assistantConfig, null, 2)
            })
          });
        } catch (err) {
          console.error('Failed to save welcome chat message:', err);
        }

        setSuccess(true);
        if (onSave) {
          onSave(config);
        }
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('Failed to save UI configuration');
      }
    } catch (err) {
      setError('Failed to save UI configuration');
      console.error(err);
    }
  };

  const addQuickAction = () => {
    setConfig({
      ...config,
      welcomePage: {
        ...config.welcomePage,
        quickActions: [
          ...config.welcomePage.quickActions,
          { title: '', prompt: '', sortOrder: config.welcomePage.quickActions.length + 1 },
        ],
      },
    });
  };

  const removeQuickAction = (index) => {
    const newActions = config.welcomePage.quickActions.filter((_, i) => i !== index);
    setConfig({
      ...config,
      welcomePage: {
        ...config.welcomePage,
        quickActions: newActions,
      },
    });
  };

  const updateQuickAction = (index, field, value) => {
    const newActions = [...config.welcomePage.quickActions];
    newActions[index] = { ...newActions[index], [field]: value };
    setConfig({
      ...config,
      welcomePage: {
        ...config.welcomePage,
        quickActions: newActions,
      },
    });
  };

  const openFilePicker = async (index) => {
    setFilePickerIndex(index);
    setCurrentPath('');
    await loadFilesAndFolders('');
    setFilePickerOpen(true);
  };

  const loadFilesAndFolders = async (path) => {
    try {
      const url = new URL(`/api/workspace/${project}/search-files`, window.location.origin);
      url.searchParams.set('query', '');
      const response = await fetch(url.toString());

      if (response.ok) {
        const data = await response.json();
        // Filter based on current path
        const items = data
          .filter(item => {
            if (!path) return !item.path.includes('/');
            return item.path.startsWith(path + '/') && item.path.split('/').length === path.split('/').length + 1;
          })
          .map(item => ({
            name: item.name,
            path: item.path,
            isFolder: false
          }));

        // Add folders by extracting unique folder paths
        const folders = new Set();
        data.forEach(item => {
          const parts = item.path.split('/');
          if (parts.length > 1) {
            const folderPath = parts.slice(0, -1).join('/');
            if (!path || folderPath.startsWith(path + '/')) {
              const relevantPath = path ? folderPath.substring(path.length + 1) : folderPath;
              const firstFolder = relevantPath.split('/')[0];
              if (firstFolder) {
                const fullFolderPath = path ? `${path}/${firstFolder}` : firstFolder;
                folders.add(fullFolderPath);
              }
            }
          }
        });

        const folderItems = Array.from(folders).map(folderPath => ({
          name: folderPath.split('/').pop(),
          path: folderPath,
          isFolder: true
        }));

        setFilesAndFolders([...folderItems.sort((a, b) => a.name.localeCompare(b.name)), ...items.sort((a, b) => a.name.localeCompare(b.name))]);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  };

  const handleFileSelect = (filePath) => {
    const newDocs = [...config.previewDocuments];
    newDocs[filePickerIndex] = filePath;
    setConfig({ ...config, previewDocuments: newDocs });
    setFilePickerOpen(false);
  };

  const handleFolderNavigate = (folderPath) => {
    setCurrentPath(folderPath);
    loadFilesAndFolders(folderPath);
  };

  const handleBreadcrumbClick = (path) => {
    setCurrentPath(path);
    loadFilesAndFolders(path);
  };

  if (loading) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 800 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          UI configuration saved successfully!
        </Alert>
      )}

      {/* AppBar Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        App Bar Customization
      </Typography>
      <Box sx={{ mb: 3 }}>
        <TextField
          size="small"
          fullWidth
          label="Title"
          value={config.appBar.title}
          onChange={(e) =>
            setConfig({
              ...config,
              appBar: { ...config.appBar, title: e.target.value },
            })
          }
          sx={{ mb: 2 }}
        />

        <FormControl component="fieldset" size="small" sx={{ mb: 2 }}>
          <FormLabel component="legend">Font Color</FormLabel>
          <RadioGroup
            row
            value={config.appBar.fontColor}
            onChange={(e) =>
              setConfig({
                ...config,
                appBar: { ...config.appBar, fontColor: e.target.value },
              })
            }
          >
            <FormControlLabel value="white" control={<Radio size="small" />} label="White" />
            <FormControlLabel value="black" control={<Radio size="small" />} label="Black" />
          </RadioGroup>
        </FormControl>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TextField
            size="small"
            label="Background Color"
            value={config.appBar.backgroundColor}
            onChange={(e) =>
              setConfig({
                ...config,
                appBar: { ...config.appBar, backgroundColor: e.target.value },
              })
            }
            sx={{ flex: 1 }}
          />
          <input
            type="color"
            value={config.appBar.backgroundColor}
            onChange={(e) =>
              setConfig({
                ...config,
                appBar: { ...config.appBar, backgroundColor: e.target.value },
              })
            }
            style={{ width: 50, height: 40, cursor: 'pointer' }}
          />
        </Box>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Welcome Chat Message Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Welcome Chat Message
      </Typography>
      <Box sx={{ mb: 3 }}>
        <TextField
          size="small"
          fullWidth
          multiline
          rows={3}
          label="Chat Greeting Message"
          value={welcomeChatMessage}
          onChange={(e) => setWelcomeChatMessage(e.target.value)}
          placeholder="Enter the initial greeting message that appears in the chat when the project loads"
          helperText="This message appears as the first assistant message in the chat pane"
        />
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Welcome Page Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Welcome Page Customization
      </Typography>
      <Box sx={{ mb: 3 }}>
        <TextField
          size="small"
          fullWidth
          label="Welcome Message"
          value={config.welcomePage.message}
          onChange={(e) =>
            setConfig({
              ...config,
              welcomePage: { ...config.welcomePage, message: e.target.value },
            })
          }
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <TextField
            size="small"
            label="Background Color"
            value={config.welcomePage.backgroundColor}
            onChange={(e) =>
              setConfig({
                ...config,
                welcomePage: { ...config.welcomePage, backgroundColor: e.target.value },
              })
            }
            sx={{ flex: 1 }}
          />
          <input
            type="color"
            value={config.welcomePage.backgroundColor}
            onChange={(e) =>
              setConfig({
                ...config,
                welcomePage: { ...config.welcomePage, backgroundColor: e.target.value },
              })
            }
            style={{ width: 50, height: 40, cursor: 'pointer' }}
          />
        </Box>

        {/* Quick Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1">Quick Actions</Typography>
          <Button
            size="small"
            startIcon={<TbPlus />}
            onClick={addQuickAction}
            variant="outlined"
          >
            Add Action
          </Button>
        </Box>

        {config.welcomePage.quickActions.map((action, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ flex: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Title"
                  value={action.title}
                  onChange={(e) => updateQuickAction(index, 'title', e.target.value)}
                  sx={{ mb: 2 }}
                />
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  rows={3}
                  label="Prompt (Markdown)"
                  value={action.prompt}
                  onChange={(e) => updateQuickAction(index, 'prompt', e.target.value)}
                  sx={{ mb: 2 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Sort Order"
                  value={action.sortOrder}
                  onChange={(e) => updateQuickAction(index, 'sortOrder', parseInt(e.target.value) || 0)}
                  sx={{ width: 120 }}
                />
              </Box>
              <IconButton
                size="small"
                color="error"
                onClick={() => removeQuickAction(index)}
              >
                <TbTrash />
              </IconButton>
            </Box>
          </Paper>
        ))}

        {/* Show Welcome Message Checkbox */}
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Radio
                checked={config.welcomePage.showWelcomeMessage}
                onChange={() =>
                  setConfig({
                    ...config,
                    welcomePage: { ...config.welcomePage, showWelcomeMessage: true },
                  })
                }
              />
            }
            label="Show welcome message"
          />
          <FormControlLabel
            control={
              <Radio
                checked={!config.welcomePage.showWelcomeMessage}
                onChange={() =>
                  setConfig({
                    ...config,
                    welcomePage: { ...config.welcomePage, showWelcomeMessage: false },
                  })
                }
              />
            }
            label="Don't show welcome message"
          />
        </Box>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Preview Documents Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Auto-Open Preview Documents
      </Typography>
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Specify documents that should automatically open in the preview pane when the project loads
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1">Documents</Typography>
          <Button
            size="small"
            startIcon={<TbPlus />}
            onClick={() => setConfig({
              ...config,
              previewDocuments: [...config.previewDocuments, '']
            })}
            variant="outlined"
          >
            Add Document
          </Button>
        </Box>

        {config.previewDocuments.map((doc, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                size="small"
                fullWidth
                label="File Path (relative to project root)"
                value={doc}
                onChange={(e) => {
                  const newDocs = [...config.previewDocuments];
                  newDocs[index] = e.target.value;
                  setConfig({ ...config, previewDocuments: newDocs });
                }}
                placeholder="e.g., out/index.html or docs/README.md"
              />
              <IconButton
                size="small"
                color="primary"
                onClick={() => openFilePicker(index)}
                title="Browse files"
              >
                <TbFolderOpen />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                onClick={() => {
                  const newDocs = config.previewDocuments.filter((_, i) => i !== index);
                  setConfig({ ...config, previewDocuments: newDocs });
                }}
              >
                <TbTrash />
              </IconButton>
            </Box>
          </Paper>
        ))}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={handleSave}>
          Save Configuration
        </Button>
      </Box>

      {/* File Picker Dialog */}
      <Dialog
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Select a File
          <Breadcrumbs sx={{ mt: 1, fontSize: '0.875rem' }}>
            <Link
              component="button"
              underline="hover"
              color="inherit"
              onClick={() => handleBreadcrumbClick('')}
            >
              Root
            </Link>
            {currentPath.split('/').filter(Boolean).map((part, index, arr) => {
              const path = arr.slice(0, index + 1).join('/');
              return (
                <Link
                  key={path}
                  component="button"
                  underline="hover"
                  color="inherit"
                  onClick={() => handleBreadcrumbClick(path)}
                >
                  {part}
                </Link>
              );
            })}
          </Breadcrumbs>
        </DialogTitle>
        <DialogContent>
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {filesAndFolders.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                No files or folders found
              </Typography>
            ) : (
              filesAndFolders.map((item) => (
                <ListItem key={item.path} disablePadding>
                  <ListItemButton
                    onClick={() => item.isFolder ? handleFolderNavigate(item.path) : handleFileSelect(item.path)}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                      {item.isFolder ? <TbFolder size={20} /> : <PiFile size={20} />}
                      <ListItemText primary={item.name} />
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFilePickerOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomUI;
