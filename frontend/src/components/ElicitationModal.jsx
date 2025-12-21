import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  Typography,
  Box,
  Alert,
  IconButton,
  Chip
} from '@mui/material';
import { Close as CloseIcon, Warning as WarningIcon } from '@mui/icons-material';

/**
 * ElicitationModal - MCP Elicitation Dialog Component
 *
 * Renders a modal dialog for MCP elicitation requests.
 * Supports form fields based on JSON Schema: string, number, integer, boolean, enum.
 *
 * Props:
 * - open: boolean - Whether the modal is visible
 * - elicitation: object - The elicitation request data { id, message, requestedSchema, toolName }
 * - onRespond: (response) => void - Callback when user responds
 * - onClose: () => void - Callback when modal is closed without response
 */
export default function ElicitationModal({ open, elicitation, onRespond, onClose }) {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  // Reset form data when elicitation changes
  useEffect(() => {
    if (elicitation?.requestedSchema?.properties) {
      const initialData = {};
      Object.entries(elicitation.requestedSchema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) {
          initialData[key] = prop.default;
        } else if (prop.type === 'boolean') {
          initialData[key] = false;
        } else if (prop.type === 'number' || prop.type === 'integer') {
          initialData[key] = prop.minimum || 0;
        } else {
          initialData[key] = '';
        }
      });
      setFormData(initialData);
      setErrors({});
    }
  }, [elicitation]);

  if (!elicitation) return null;

  const { id, message, requestedSchema, toolName } = elicitation;
  const properties = requestedSchema?.properties || {};
  const required = requestedSchema?.required || [];

  // Validate form data against schema
  const validateForm = () => {
    const newErrors = {};

    Object.entries(properties).forEach(([key, prop]) => {
      const value = formData[key];
      const isRequired = required.includes(key);

      // Check required fields
      if (isRequired && (value === undefined || value === null || value === '')) {
        newErrors[key] = 'This field is required';
        return;
      }

      // Skip validation for empty non-required fields
      if (!isRequired && (value === undefined || value === null || value === '')) {
        return;
      }

      // Type-specific validation
      if (prop.type === 'string') {
        if (prop.minLength && value.length < prop.minLength) {
          newErrors[key] = `Minimum ${prop.minLength} characters required`;
        }
        if (prop.maxLength && value.length > prop.maxLength) {
          newErrors[key] = `Maximum ${prop.maxLength} characters allowed`;
        }
        if (prop.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          newErrors[key] = 'Invalid email format';
        }
        if (prop.format === 'uri' && !/^https?:\/\/.+/.test(value)) {
          newErrors[key] = 'Invalid URL format';
        }
      }

      if (prop.type === 'number' || prop.type === 'integer') {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          newErrors[key] = 'Must be a number';
        } else {
          if (prop.minimum !== undefined && numValue < prop.minimum) {
            newErrors[key] = `Minimum value is ${prop.minimum}`;
          }
          if (prop.maximum !== undefined && numValue > prop.maximum) {
            newErrors[key] = `Maximum value is ${prop.maximum}`;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAccept = () => {
    if (validateForm()) {
      // Convert form data to appropriate types
      const content = {};
      Object.entries(formData).forEach(([key, value]) => {
        const prop = properties[key];
        if (prop?.type === 'number' || prop?.type === 'integer') {
          content[key] = Number(value);
        } else if (prop?.type === 'boolean') {
          content[key] = Boolean(value);
        } else {
          content[key] = value;
        }
      });

      onRespond({
        id,
        action: 'accept',
        content
      });
    }
  };

  const handleDecline = () => {
    onRespond({
      id,
      action: 'decline'
    });
  };

  const handleCancel = () => {
    onRespond({
      id,
      action: 'cancel'
    });
    onClose?.();
  };

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    // Clear error when field is modified
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  // Render a form field based on its schema
  const renderField = (key, prop) => {
    const value = formData[key];
    const error = errors[key];
    const isRequired = required.includes(key);
    const label = prop.title || key;
    const helperText = error || prop.description;

    // Enum field (dropdown)
    if (prop.enum) {
      return (
        <FormControl
          key={key}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          error={!!error}
          required={isRequired}
        >
          <InputLabel>{label}</InputLabel>
          <Select
            value={value || ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            label={label}
          >
            {prop.enum.map((enumValue, idx) => (
              <MenuItem key={enumValue} value={enumValue}>
                {prop.enumNames?.[idx] || enumValue}
              </MenuItem>
            ))}
          </Select>
          {helperText && (
            <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ mt: 0.5, ml: 1.5 }}>
              {helperText}
            </Typography>
          )}
        </FormControl>
      );
    }

    // Boolean field (switch)
    if (prop.type === 'boolean') {
      return (
        <Box key={key} sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={!!value}
                onChange={(e) => handleFieldChange(key, e.target.checked)}
              />
            }
            label={label}
          />
          {prop.description && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6 }}>
              {prop.description}
            </Typography>
          )}
        </Box>
      );
    }

    // Number/Integer field
    if (prop.type === 'number' || prop.type === 'integer') {
      return (
        <TextField
          key={key}
          label={label}
          type="number"
          value={value ?? ''}
          onChange={(e) => handleFieldChange(key, e.target.value)}
          fullWidth
          size="small"
          required={isRequired}
          error={!!error}
          helperText={helperText}
          inputProps={{
            min: prop.minimum,
            max: prop.maximum,
            step: prop.type === 'integer' ? 1 : 'any'
          }}
          sx={{ mb: 2 }}
        />
      );
    }

    // String field (text input)
    return (
      <TextField
        key={key}
        label={label}
        value={value || ''}
        onChange={(e) => handleFieldChange(key, e.target.value)}
        fullWidth
        size="small"
        required={isRequired}
        error={!!error}
        helperText={helperText}
        type={prop.format === 'email' ? 'email' : prop.format === 'date' ? 'date' : 'text'}
        multiline={prop.maxLength && prop.maxLength > 100}
        rows={prop.maxLength && prop.maxLength > 100 ? 3 : 1}
        inputProps={{
          maxLength: prop.maxLength
        }}
        InputLabelProps={prop.format === 'date' ? { shrink: true } : undefined}
        sx={{ mb: 2 }}
      />
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: '4px solid #ff9800'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon sx={{ color: '#ff9800' }} />
          <Typography variant="h6">Input Required</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={toolName}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.75rem' }}
          />
          <IconButton onClick={handleCancel} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Message from the tool */}
        <Alert
          severity="info"
          sx={{ mb: 3, whiteSpace: 'pre-wrap' }}
        >
          {message}
        </Alert>

        {/* Form fields */}
        <Box>
          {Object.entries(properties).map(([key, prop]) => renderField(key, prop))}
        </Box>

        {Object.keys(properties).length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No input fields required. Click Accept to proceed or Decline to cancel.
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleDecline}
          color="error"
          variant="outlined"
          sx={{ textTransform: 'none' }}
        >
          Decline
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handleCancel}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleAccept}
          variant="contained"
          color="primary"
          sx={{ textTransform: 'none' }}
        >
          Accept
        </Button>
      </DialogActions>
    </Dialog>
  );
}
