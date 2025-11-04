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
} from '@mui/material';
import { TbPlus, TbTrash } from 'react-icons/tb';

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
    },
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

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
            },
          });
        }
      } else {
        // If file doesn't exist (404 or other non-OK status), just use default config
        // Don't show error for missing config file
        console.log('No UI configuration found, using defaults');
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
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={handleSave}>
          Save Configuration
        </Button>
      </Box>
    </Box>
  );
};

export default CustomUI;
