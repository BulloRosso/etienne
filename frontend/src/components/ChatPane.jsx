import React, { useRef, useEffect, useState } from 'react';
import { Box, IconButton, Modal, Typography, Button, ToggleButton, ToggleButtonGroup, FormControlLabel, Checkbox } from '@mui/material';
import { LuBrain } from "react-icons/lu";
import { HiOutlineWrench } from "react-icons/hi2";
import { GiSettingsKnobs } from "react-icons/gi";
import { IoClose } from "react-icons/io5";
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import { StructuredMessage } from './StructuredMessage';

export default function ChatPane({ messages, structuredMessages = [], onSendMessage, streaming, mode, onModeChange, aiModel, onAiModelChange, showBackgroundInfo, onShowBackgroundInfoChange }) {
  const messagesEndRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(() => {
    const saved = localStorage.getItem('memoryEnabled');
    return saved === 'true';
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, structuredMessages, streaming]);

  const handlePermissionResponse = async (permissionId, approved) => {
    // This would need to be implemented in the backend
    // For now, just log it
    console.log('Permission response:', permissionId, approved);
  };

  const handleModeChange = (event, newMode) => {
    if (newMode !== null && onModeChange) {
      onModeChange(newMode);
    }
  };

  const handleSettingsSave = () => {
    console.log('Settings saved:', { aiModel });
    setSettingsOpen(false);
  };

  // Check if we should show typing indicator (streaming but no assistant response yet, or assistant response is empty)
  const showTypingIndicator = streaming && (
    messages.length === 0 ||
    messages[messages.length - 1].role !== 'assistant' ||
    !messages[messages.length - 1].text
  );

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#fffef5'
    }}>
      {/* Header */}
      <Box sx={{
        height: '48px',
        backgroundColor: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        borderBottom: '1px solid #e0e0e0'
      }}>
        {/* Mode Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={handleModeChange}
            size="small"
            sx={{
              '& .MuiToggleButton-root.Mui-selected': {
                backgroundColor: '#bbdefb',
                '&:hover': {
                  backgroundColor: '#90caf9'
                }
              }
            }}
          >
            <ToggleButton value="plan" title="Planning Mode">
              <LuBrain size={16} />
            </ToggleButton>
            <ToggleButton value="work" title="Work Mode">
              <HiOutlineWrench size={20} />
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ color: '#666', fontSize: '0.875rem' }}>
            {mode === 'work' ? 'Work Mode' : 'Planning Mode'}
          </Typography>
        </Box>

        {/* Settings Button */}
        <IconButton
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          sx={{ color: '#333' }}
        >
          <GiSettingsKnobs size={24} />
        </IconButton>
      </Box>

      {/* Messages Area */}
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        py: 2
      }}>
        {messages.map((msg, idx) => {
          const isLastMessage = idx === messages.length - 1;
          const isAssistant = msg.role === 'assistant';

          return (
            <React.Fragment key={idx}>
              {/* Show tool calls before the last assistant message */}
              {isLastMessage && isAssistant && structuredMessages.length > 0 && (
                <>
                  {structuredMessages.map((structMsg) => (
                    <StructuredMessage
                      key={structMsg.id}
                      message={structMsg}
                      onPermissionResponse={handlePermissionResponse}
                    />
                  ))}
                </>
              )}

              <ChatMessage
                role={msg.role}
                text={msg.text}
                timestamp={msg.timestamp}
                usage={msg.usage}
              />
            </React.Fragment>
          );
        })}

        {/* If no messages yet, or last message is not assistant, show structured messages at the end */}
        {(messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') &&
          structuredMessages.length > 0 && (
          <>
            {structuredMessages.map((msg) => (
              <StructuredMessage
                key={msg.id}
                message={msg}
                onPermissionResponse={handlePermissionResponse}
              />
            ))}
          </>
        )}

        {showTypingIndicator && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ p: 0, pb: 0 }}>
        <ChatInput onSend={onSendMessage} disabled={streaming} />
      </Box>

      {/* Settings Modal */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Box sx={{
          minWidth: 750,
          backgroundColor: 'white',
          borderRadius: 2,
          boxShadow: 24,
          outline: 'none'
        }}>
          {/* Modal Header */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            borderBottom: '1px solid #e0e0e0'
          }}>
            <Typography variant="h6">AI Core Settings</Typography>
            <IconButton onClick={() => setSettingsOpen(false)} size="small">
              <IoClose size={20} />
            </IconButton>
          </Box>

          {/* Modal Content */}
          <Box sx={{ p: 3 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              AI Model
            </Typography>
            <ToggleButtonGroup
              value={aiModel}
              exclusive
              onChange={(e, newModel) => {
                if (newModel !== null && onAiModelChange) {
                  onAiModelChange(newModel);
                }
              }}
              fullWidth
              sx={{
                mb: 3,
                '& .MuiToggleButton-root.Mui-selected': {
                  backgroundColor: '#bbdefb',
                  '&:hover': {
                    backgroundColor: '#90caf9'
                  }
                }
              }}
            >
              <ToggleButton value="anthropic">
                Anthropic Claude 4.5
              </ToggleButton>
              <ToggleButton value="openai">
                OpenAI GPT-5
              </ToggleButton>
            </ToggleButtonGroup>

            <Typography variant="body1" sx={{ mb: 1 }}>
              Features
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={memoryEnabled}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setMemoryEnabled(value);
                    localStorage.setItem('memoryEnabled', value.toString());
                    // Dispatch custom event for same-window storage changes
                    window.dispatchEvent(new Event('memoryChanged'));
                  }}
                />
              }
              label="Long Term Memory"
              sx={{ mb: 1 }}
            />

            <Typography variant="body1" sx={{ mb: 1, mt: 2 }}>
              Display Options
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={showBackgroundInfo}
                  onChange={(e) => {
                    if (onShowBackgroundInfoChange) {
                      onShowBackgroundInfoChange(e.target.checked);
                    }
                  }}
                />
              }
              label="Show background info"
            />
          </Box>

          {/* Modal Footer */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            p: 2,
            borderTop: '1px solid #e0e0e0'
          }}>
            <Button variant="contained" onClick={handleSettingsSave}>
              Save
            </Button>
          </Box>
        </Box>
      </Modal>
    </Box>
  );
}
