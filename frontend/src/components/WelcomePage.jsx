import React, { useState, useRef } from 'react';
import { Box, Typography, Chip, TextField, IconButton } from '@mui/material';
import { useProject } from '../contexts/ProjectContext';
import { SlMicrophone } from 'react-icons/sl';
import { GoArrowUp, GoPlus } from 'react-icons/go';

const WelcomePage = ({ welcomeConfig, onSendMessage }) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const recognitionRef = useRef(null);
  const { currentProject } = useProject();

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  };

  const handleQuickActionClick = (prompt) => {
    if (onSendMessage) {
      onSendMessage(prompt);
    }
  };

  const handleSend = () => {
    if (message.trim() && onSendMessage) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0 || !currentProject) return;

    setUploading(true);
    const uploadedFiles = [];

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/workspace/${currentProject}/attachments/upload`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          uploadedFiles.push(file.name);
        } else {
          console.error(`Failed to upload ${file.name}`);
        }
      }

      if (uploadedFiles.length > 0) {
        const fileList = uploadedFiles.join(', ');
        const appendText = `Please have a look at ${fileList} in the .attachments folder. I want to `;
        setMessage((prev) => prev ? `${prev}\n\n${appendText}` : appendText);
      }
    } catch (error) {
      console.error('File upload error:', error);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          }
        }

        setMessage((prev) => {
          if (finalTranscript) {
            return prev + finalTranscript;
          }
          return prev;
        });
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    }
  };

  const sortedQuickActions = [...(welcomeConfig?.quickActions || [])].sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100%',
        backgroundColor: welcomeConfig?.backgroundColor || '#f5f5f5',
        p: 4,
      }}
    >
      <Box sx={{ maxWidth: 800, width: '100%' }}>
        {/* Greeting */}
        <Typography
          variant="h3"
          align="center"
          sx={{ mb: 2, fontWeight: 500 }}
        >
          Good {getTimeOfDay()}, User
        </Typography>

        {/* Welcome Message */}
        {welcomeConfig?.message && (
          <Typography
            variant="h6"
            align="center"
            color="text.secondary"
            sx={{ mb: 4 }}
          >
            {welcomeConfig.message}
          </Typography>
        )}

        {/* Chat Input */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, mb: 2 }}>
          <input
            type="file"
            id="file-upload"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <label htmlFor="file-upload">
            <IconButton component="span" disabled={uploading}>
              <GoPlus />
            </IconButton>
          </label>

          <TextField
            fullWidth
            multiline
            minRows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your message..."
            variant="outlined"
            size="small"
          />

          <IconButton
            onClick={toggleSpeechRecognition}
            color={isRecording ? 'error' : 'primary'}
          >
            <SlMicrophone />
          </IconButton>

          <IconButton
            onClick={handleSend}
            disabled={!message.trim()}
            color="primary"
            sx={{ backgroundColor: '#DEEBF7' }}
          >
            <GoArrowUp />
          </IconButton>
        </Box>

        {/* Quick Actions */}
        {sortedQuickActions.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              justifyContent: 'center',
            }}
          >
            {sortedQuickActions.map((action, index) => (
              <Chip
                key={index}
                label={action.title}
                onClick={() => handleQuickActionClick(action.prompt)}
                sx={{
                  backgroundColor: 'transparent',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default WelcomePage;
