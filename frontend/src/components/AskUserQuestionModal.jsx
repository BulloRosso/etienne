import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  Chip,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Checkbox,
  FormGroup,
  TextField,
  Divider
} from '@mui/material';
import { Close as CloseIcon, HelpOutline as HelpIcon } from '@mui/icons-material';

/**
 * AskUserQuestionModal - Multi-choice Question Dialog
 *
 * Displays questions from Claude's AskUserQuestion tool with predefined options.
 * Supports single-select (radio) and multi-select (checkbox) modes.
 * Always includes an "Other" option for custom text input.
 *
 * Props:
 * - open: boolean - Whether the modal is visible
 * - question: object - The question request data { id, questions }
 * - onRespond: (response) => void - Callback when user responds
 * - onClose: () => void - Callback when modal is closed without response
 */
export default function AskUserQuestionModal({ open, question, onRespond, onClose }) {
  const [answers, setAnswers] = useState({});
  const [otherTexts, setOtherTexts] = useState({});

  // Reset answers when question changes
  useEffect(() => {
    if (question?.questions) {
      const initialAnswers = {};
      const initialOther = {};
      question.questions.forEach((q, idx) => {
        initialAnswers[idx] = q.multiSelect ? [] : '';
        initialOther[idx] = '';
      });
      setAnswers(initialAnswers);
      setOtherTexts(initialOther);
    }
  }, [question]);

  if (!question) return null;

  const { id, questions } = question;

  const handleSingleSelect = (questionIdx, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionIdx]: value
    }));
  };

  const handleMultiSelect = (questionIdx, value, checked) => {
    setAnswers(prev => {
      const current = prev[questionIdx] || [];
      if (checked) {
        return { ...prev, [questionIdx]: [...current, value] };
      } else {
        return { ...prev, [questionIdx]: current.filter(v => v !== value) };
      }
    });
  };

  const handleOtherText = (questionIdx, text) => {
    setOtherTexts(prev => ({
      ...prev,
      [questionIdx]: text
    }));
  };

  const handleSubmit = () => {
    // Build answers object keyed by question text
    const formattedAnswers = {};
    questions.forEach((q, idx) => {
      const answer = answers[idx];
      const otherText = otherTexts[idx];

      if (q.multiSelect) {
        // For multi-select, join selected values with comma
        let selected = answer || [];
        if (otherText) {
          selected = [...selected, otherText];
        }
        formattedAnswers[q.question] = selected.join(', ');
      } else {
        // For single-select
        if (answer === '__other__') {
          formattedAnswers[q.question] = otherText || 'Other';
        } else {
          formattedAnswers[q.question] = answer || '';
        }
      }
    });

    onRespond({
      id,
      action: 'allow',
      updatedInput: {
        answers: formattedAnswers
      }
    });
  };

  const handleCancel = () => {
    onRespond({
      id,
      action: 'cancel',
      message: 'User cancelled'
    });
    onClose?.();
  };

  const isValid = () => {
    // Check that at least one question has an answer
    return questions.some((q, idx) => {
      const answer = answers[idx];
      const otherText = otherTexts[idx];
      if (q.multiSelect) {
        return (answer && answer.length > 0) || otherText;
      }
      return answer || otherText;
    });
  };

  const renderQuestion = (q, idx) => {
    const { question: questionText, header, options, multiSelect } = q;

    return (
      <Box key={idx} sx={{ mb: 3 }}>
        {idx > 0 && <Divider sx={{ mb: 2 }} />}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Chip label={header} size="small" color="primary" variant="outlined" />
        </Box>

        <Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
          {questionText}
        </Typography>

        <FormControl component="fieldset" sx={{ width: '100%' }}>
          {multiSelect ? (
            // Multi-select with checkboxes
            <FormGroup>
              {options.map((opt, optIdx) => (
                <FormControlLabel
                  key={optIdx}
                  control={
                    <Checkbox
                      checked={(answers[idx] || []).includes(opt.label)}
                      onChange={(e) => handleMultiSelect(idx, opt.label, e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">{opt.label}</Typography>
                      {opt.description && (
                        <Typography variant="caption" color="text.secondary">
                          {opt.description}
                        </Typography>
                      )}
                    </Box>
                  }
                  sx={{ alignItems: 'flex-start', mb: 1 }}
                />
              ))}
              {/* Other option for multi-select */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1 }}>
                <Typography variant="body2" sx={{ mt: 1, minWidth: 60 }}>Other:</Typography>
                <TextField
                  size="small"
                  placeholder="Enter custom option"
                  value={otherTexts[idx] || ''}
                  onChange={(e) => handleOtherText(idx, e.target.value)}
                  fullWidth
                />
              </Box>
            </FormGroup>
          ) : (
            // Single-select with radio buttons
            <RadioGroup
              value={answers[idx] || ''}
              onChange={(e) => handleSingleSelect(idx, e.target.value)}
            >
              {options.map((opt, optIdx) => (
                <FormControlLabel
                  key={optIdx}
                  value={opt.label}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">{opt.label}</Typography>
                      {opt.description && (
                        <Typography variant="caption" color="text.secondary">
                          {opt.description}
                        </Typography>
                      )}
                    </Box>
                  }
                  sx={{ alignItems: 'flex-start', mb: 1 }}
                />
              ))}
              {/* Other option for single-select */}
              <FormControlLabel
                value="__other__"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">Other:</Typography>
                    <TextField
                      size="small"
                      placeholder="Enter custom option"
                      value={otherTexts[idx] || ''}
                      onChange={(e) => handleOtherText(idx, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={() => handleSingleSelect(idx, '__other__')}
                      sx={{ minWidth: 200 }}
                    />
                  </Box>
                }
                sx={{ alignItems: 'center' }}
              />
            </RadioGroup>
          )}
        </FormControl>
      </Box>
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
          borderTop: '4px solid #9c27b0'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HelpIcon sx={{ color: '#9c27b0' }} />
          <Typography variant="h6">Question from Claude</Typography>
        </Box>
        <IconButton onClick={handleCancel} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {questions && questions.map((q, idx) => renderQuestion(q, idx))}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleCancel}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={!isValid()}
          sx={{ textTransform: 'none' }}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}
