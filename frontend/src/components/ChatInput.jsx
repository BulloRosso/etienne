import React, { useState, useRef } from 'react';
import { Box, TextField, IconButton, Paper } from '@mui/material';
import { AttachFile, MicOutlined, Send } from '@mui/icons-material';
import { BsStopCircle } from 'react-icons/bs';
import { useProject } from '../contexts/ProjectContext';
import { SlMicrophone } from "react-icons/sl";
import { GoArrowUp } from "react-icons/go";
import { GoPlus } from "react-icons/go";

export default function ChatInput({ onSend, onAbort, streaming, disabled }) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const recognitionRef = useRef(null);
  const { currentProject } = useProject();

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleStop = () => {
    if (onAbort) {
      onAbort();
      // Keep the message text so user can edit and retry
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
      <style>
        {`
          @keyframes rotateIcon {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          .rotating-icon {
            animation: rotateIcon 2s linear infinite;
          }
        `}
      </style>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0 }}>
        <input
          type="file"
          id="file-upload"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <label htmlFor="file-upload">
          <IconButton component="span" disabled={disabled || uploading || streaming}>
            <GoPlus />
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
          disabled={disabled || streaming}
          variant="outlined"
          size="small"
          sx={{ pr: 1}}
        />

        <IconButton
          onClick={toggleSpeechRecognition}
          disabled={disabled || streaming}
          color={isRecording ? 'error' : 'primary'}
        >
          <SlMicrophone />
        </IconButton>

        {streaming ? (
          <IconButton
            onClick={handleStop}
            disabled={disabled}
            sx={{ color: '#c62828' }}
            className="rotating-icon"
          >
            <BsStopCircle size={24} />
          </IconButton>
        ) : (
          <IconButton
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            color="primary"
            sx={{ backgroundColor: "#DEEBF7" }}
          >
            <GoArrowUp />
          </IconButton>
        )}
      </Box>
    </Paper>
  );
}
