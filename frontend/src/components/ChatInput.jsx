import React, { useState, useRef } from 'react';
import { Box, TextField, IconButton, Paper } from '@mui/material';
import { AttachFile, MicOutlined, Send } from '@mui/icons-material';

export default function ChatInput({ onSend, disabled }) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // TODO: Implement file upload
      console.log('File upload:', file);
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
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
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

  return (
    <Paper elevation={3} sx={{ p: 1, pr: 0, pl: 0, borderRadius: 0, pb: 2.5, pt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0 }}>
        <input
          type="file"
          id="file-upload"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <label htmlFor="file-upload">
          <IconButton component="span" disabled={disabled}>
            <AttachFile />
          </IconButton>
        </label>

        <TextField
          fullWidth
          multiline
          maxRows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              // Allow Shift+Enter for new line
              return;
            }
          }}
          placeholder="Type your message..."
          disabled={disabled}
          variant="outlined"
          size="small"
          sx={{ pr: 1}}
        />

        <IconButton
          onClick={toggleSpeechRecognition}
          disabled={disabled}
          color={isRecording ? 'error' : 'primary'}
        >
          <MicOutlined />
        </IconButton>

        <IconButton
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          color="primary"
        >
          <Send />
        </IconButton>
      </Box>
    </Paper>
  );
}
