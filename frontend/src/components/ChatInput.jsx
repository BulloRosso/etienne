import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, IconButton, Paper, List, ListItem, ListItemText, Popper, ClickAwayListener } from '@mui/material';
import { AttachFile, MicOutlined, Send, InsertDriveFile, Close } from '@mui/icons-material';
import { BsStopCircle } from 'react-icons/bs';
import { useProject } from '../contexts/ProjectContext';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { SlMicrophone } from "react-icons/sl";
import { GoArrowUp } from "react-icons/go";
import { GoPlus } from "react-icons/go";
import { CiFileOn } from "react-icons/ci";

export default function ChatInput({ onSend, onAbort, streaming, disabled }) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const recognitionRef = useRef(null);
  const textFieldRef = useRef(null);
  const suggestionRefs = useRef([]);
  const { currentProject } = useProject();
  const { mode: themeMode } = useThemeMode();

  // Scroll selected item into view
  useEffect(() => {
    if (showSuggestions && suggestionRefs.current[selectedIndex]) {
      suggestionRefs.current[selectedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex, showSuggestions]);

  // Search for files based on query
  const searchFiles = async (query) => {
    if (!currentProject || query.length === 0) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await fetch(`/api/workspace/${currentProject}/search-files?query=${encodeURIComponent(query)}`);
      if (response.ok) {
        const files = await response.json();
        setSuggestions(files.slice(0, 11)); // Limit to 11 items
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('File search error:', error);
      setSuggestions([]);
    }
  };

  // Handle message changes and detect @ mentions
  const handleMessageChange = (e) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    const cursorPosition = e.target.selectionStart;

    // Find the last @ before cursor position
    const textBeforeCursor = newMessage.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check if there's a space between @ and cursor (if so, no mention)
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (textAfterAt.includes(' ') || textAfterAt.includes('\n')) {
        setShowSuggestions(false);
        setMentionStart(-1);
        return;
      }

      // Extract search query after @
      const query = textAfterAt;
      setMentionStart(lastAtIndex);
      setShowSuggestions(true);
      searchFiles(query);
    } else {
      setShowSuggestions(false);
      setMentionStart(-1);
    }
  };

  // Handle suggestion selection
  const selectSuggestion = (suggestion) => {
    if (mentionStart === -1) return;

    const beforeMention = message.substring(0, mentionStart);
    const afterMention = message.substring(message.indexOf(' ', mentionStart) !== -1 ? message.indexOf(' ', mentionStart) : message.length);

    // Insert the file path
    const newMessage = `${beforeMention}${suggestion.path}${afterMention}`;
    setMessage(newMessage);
    setShowSuggestions(false);
    setMentionStart(-1);
    setSuggestions([]);

    // Focus back on the text field
    if (textFieldRef.current) {
      textFieldRef.current.focus();
    }
  };

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage('');
      setShowSuggestions(false);
      setMentionStart(-1);
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
    <Paper elevation={3} sx={{ p: 1, pr: 0, pl: 3, borderRadius: 0, pb: 2.5, pt: 2, position: 'relative', backgroundColor: themeMode === 'dark' ? '#2c2c2c' : undefined, backgroundImage: themeMode === 'dark' ? 'none' : undefined }}>
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

      {/* Suggestion Box */}
      {showSuggestions && suggestions.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: '14px',
            right: '24px',
            mb: 1,
            maxHeight: '300px',
            overflow: 'hidden',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            border: '2px solid #999',
          }}
        >
          {/* Fixed Header */}
          <Box
            sx={{
              px: 2,
              py: 1,
              borderBottom: '1px solid #e0e0e0',
              backgroundColor: '#f5f5f5',
              fontSize: '12px',
              fontWeight: 600,
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Files found in this project's filesystem:</span>
            <IconButton
              size="small"
              onClick={() => {
                setShowSuggestions(false);
                setMentionStart(-1);
                setSuggestions([]);
              }}
              sx={{
                padding: '2px',
                marginRight: '-4px',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.08)',
                }
              }}
            >
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          {/* Scrollable List */}
          <Box sx={{ overflow: 'auto', maxHeight: 'calc(300px - 40px)' }}>
            <List dense>
              {suggestions.map((file, index) => {
                // Extract directory path without filename
                const pathParts = file.path.split('/');
                const directory = pathParts.length > 1
                  ? pathParts.slice(0, -1).join('/') + '/'
                  : '';

                return (
                  <ListItem
                    key={index}
                    button
                    selected={index === selectedIndex}
                    onClick={() => selectSuggestion(file)}
                    ref={(el) => (suggestionRefs.current[index] = el)}
                    sx={{
                      backgroundColor: index === selectedIndex ? '#DEEBF7' : 'transparent',
                      '&:hover': {
                        backgroundColor: index === selectedIndex ? '#DEEBF7' : 'rgba(0, 0, 0, 0.04)',
                      },
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <CiFileOn style={{ fontSize: 20, color: '#999', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box
                        component="span"
                        sx={{
                          fontSize: '14px',
                          fontWeight: index === selectedIndex ? 'bold' : 'normal'
                        }}
                      >
                        {file.name}
                      </Box>
                      {directory && (
                        <Box component="span" sx={{ fontSize: '12px', color: '#666', ml: 2, flexShrink: 0 }}>
                          {directory}
                        </Box>
                      )}
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        </Paper>
      )}

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
          onChange={handleMessageChange}
          onKeyDown={(e) => {
            if (showSuggestions) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % suggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (suggestions[selectedIndex]) {
                  selectSuggestion(suggestions[selectedIndex]);
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowSuggestions(false);
                setMentionStart(-1);
              }
            } else if (e.key === 'Enter' && e.shiftKey) {
              // Allow Shift+Enter for new line
              return;
            }
          }}
          placeholder="Type your message and use @ to mention files..."
          disabled={disabled || streaming}
          variant="outlined"
          size="small"
          sx={{ pr: 1}}
          inputRef={textFieldRef}
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
