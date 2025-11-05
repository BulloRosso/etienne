import React, { useState, useRef } from 'react';
import { Box, Typography, Chip, TextField, IconButton, Paper } from '@mui/material';
import { useProject } from '../contexts/ProjectContext';
import { SlMicrophone } from 'react-icons/sl';
import { GoArrowUp, GoPlus, GoX } from 'react-icons/go';
import { PiChats, PiFile, PiFileText, PiFilePdf, PiImage } from 'react-icons/pi';

const WelcomePage = ({ welcomeConfig, onSendMessage, onReturnToDefault }) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
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

  const handleSend = async () => {
    if ((message.trim() || selectedFiles.length > 0) && onSendMessage) {
      setUploading(true);
      let finalMessage = message;

      // Upload files if any are selected
      if (selectedFiles.length > 0 && currentProject) {
        const uploadedFiles = [];
        try {
          for (const file of selectedFiles) {
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
            finalMessage = finalMessage ? `${finalMessage}\n\n${appendText}` : appendText;
          }
        } catch (error) {
          console.error('File upload error:', error);
        }
      }

      // Store the message in project history
      if (currentProject && finalMessage.trim()) {
        try {
          const timestamp = new Date().toISOString();
          const historyEntry = `## ${timestamp}\n\n${finalMessage}`;

          await fetch(`/api/workspace/${currentProject}/project-history`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: historyEntry }),
          });
        } catch (error) {
          console.error('Failed to save project history:', error);
          // Continue even if history save fails
        }
      }

      onSendMessage(finalMessage);
      setMessage('');
      setSelectedFiles([]);
      setUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Add new files to existing selection
    setSelectedFiles(prev => [...prev, ...files]);

    // Clear the input so the same file can be selected again
    e.target.value = '';
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) {
      return <PiImage size={20} />;
    }
    if (ext === 'pdf') {
      return <PiFilePdf size={20} />;
    }
    if (['txt', 'md', 'doc', 'docx'].includes(ext)) {
      return <PiFileText size={20} />;
    }
    return <PiFile size={20} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
        position: 'relative',
      }}
    >
      {/* Navigation Button */}
      {onReturnToDefault && (
        <Box
          sx={{
            position: 'absolute',
            top: 10,
            right: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            '&:hover': {
              opacity: 0.7,
            },
          }}
          onClick={onReturnToDefault}
        >
          <IconButton size="small">
            <PiChats size={20} />
          </IconButton>
          <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
            Previous Conversations / Settings
          </Typography>
        </Box>
      )}

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
            ref={fileInputRef}
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <GoPlus />
          </IconButton>

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
            placeholder="Please describe as precise as possible what we want to achieve in our session. This is essential for me to give high-quality responses!"
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
            disabled={!message.trim() && selectedFiles.length === 0}
            color="primary"
            sx={{ backgroundColor: '#DEEBF7' }}
          >
            <GoArrowUp />
          </IconButton>
        </Box>

        {/* File Preview Section */}
        {selectedFiles.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedFiles.map((file, index) => (
                <Paper
                  key={index}
                  elevation={1}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    pr: 0.5,
                    borderRadius: 1,
                    backgroundColor: '#f9f9f9',
                    maxWidth: 250,
                  }}
                >
                  <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                    {getFileIcon(file.name)}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.875rem',
                      }}
                    >
                      {file.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(file.size)}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => removeFile(index)}
                    sx={{
                      p: 0.5,
                      '&:hover': {
                        color: 'error.main',
                      },
                    }}
                  >
                    <GoX size={16} />
                  </IconButton>
                </Paper>
              ))}
            </Box>
          </Box>
        )}

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
