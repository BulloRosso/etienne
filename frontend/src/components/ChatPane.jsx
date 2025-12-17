import React, { useRef, useEffect, useState } from 'react';
import { Box, IconButton, Modal, Typography, Button, ToggleButton, ToggleButtonGroup, FormControlLabel, Checkbox, TextField, Alert } from '@mui/material';
import { LuBrain } from "react-icons/lu";
import { HiOutlineWrench } from "react-icons/hi2";
import { GiSettingsKnobs } from "react-icons/gi";
import { IoClose } from "react-icons/io5";
import { RiChatNewLine } from "react-icons/ri";
import { PiCaretCircleDownLight } from "react-icons/pi";
import { MdInfo } from "react-icons/md";
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import StreamingTimeline from './StreamingTimeline';
import SessionPane from './SessionPane';

export default function ChatPane({ messages, structuredMessages = [], onSendMessage, onAbort, streaming, mode, onModeChange, aiModel, onAiModelChange, showBackgroundInfo, onShowBackgroundInfoChange, projectExists = true, projectName, onSessionChange, hasActiveSession = false, hasSessions = false, onShowWelcomePage, uiConfig, planApprovalState = {}, onPlanApprove, onPlanReject }) {
  const messagesEndRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionPaneOpen, setSessionPaneOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(() => {
    const saved = localStorage.getItem('memoryEnabled');
    return saved === 'true';
  });
  const [maxTurns, setMaxTurns] = useState(() => {
    const saved = localStorage.getItem('maxTurns');
    return saved ? parseInt(saved, 10) : 5;
  });

  // Alternative AI model configuration
  const [altModelName, setAltModelName] = useState('');
  const [altModelBaseUrl, setAltModelBaseUrl] = useState('');
  const [altModelToken, setAltModelToken] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, structuredMessages, streaming]);

  // Load alternative AI model config when settings dialog opens
  useEffect(() => {
    if (settingsOpen && projectName) {
      loadAltModelConfig();
    }
  }, [settingsOpen, projectName]);

  const loadAltModelConfig = async () => {
    try {
      const url = new URL('/api/claude/getFile', window.location.origin);
      url.searchParams.set('project_dir', projectName);
      url.searchParams.set('file_name', '.etienne/ai-model.json');

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        const config = JSON.parse(data.content);
        setAltModelName(config.model || '');
        setAltModelBaseUrl(config.baseUrl || '');
        setAltModelToken(config.token || '');

        // If config is active, switch to alternative model
        if (config.isActive && onAiModelChange) {
          onAiModelChange('alternative');
        }
      }
    } catch (error) {
      // File doesn't exist or couldn't be loaded - that's OK
      console.log('No alternative model config found');
    }
  };

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

  const handleSettingsSave = async () => {
    console.log('Settings saved:', { aiModel });

    // Save alternative model config if projectName exists
    if (projectName) {
      try {
        const config = {
          isActive: aiModel === 'alternative',
          model: altModelName,
          baseUrl: altModelBaseUrl,
          token: altModelToken
        };

        await fetch('/api/claude/addFile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_dir: projectName,
            file_name: '.etienne/ai-model.json',
            file_content: JSON.stringify(config, null, 2)
          })
        });
      } catch (error) {
        console.error('Failed to save alternative model config:', error);
      }
    }

    setSettingsOpen(false);
  };

  const handleNewSession = () => {
    // Check if we should show welcome page
    if (uiConfig?.welcomePage && uiConfig.welcomePage.showWelcomeMessage !== false && (uiConfig.welcomePage.message || uiConfig.welcomePage.quickActions?.length)) {
      if (onShowWelcomePage) {
        onShowWelcomePage();
      }
    } else {
      // Default behavior: start a new session
      if (onSessionChange) {
        onSessionChange(null); // null means start a new session
      }
    }
  };

  const handleResumeSession = () => {
    setSessionPaneOpen(true);
  };

  const handleSessionSelect = (sessionId) => {
    if (onSessionChange) {
      onSessionChange(sessionId);
    }
  };

  // Check if we should show typing indicator (streaming but no assistant response yet)
  const showTypingIndicator = streaming && (
    messages.length === 0 ||
    messages[messages.length - 1].role !== 'assistant'
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
        px: 2,
        borderBottom: '1px solid #e0e0e0',
        position: 'relative'
      }}>
        {/* Left: New Conversation Button */}
        <IconButton
          onClick={handleNewSession}
          title="Start New Session"
          sx={{ color: '#1976d2' }}
        >
          <RiChatNewLine size={19} />
        </IconButton>

        {/* Center: Mode Toggle */}
        <Box sx={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={handleModeChange}
            size="small"
            sx={{
              '& .MuiToggleButton-root.Mui-selected': {
                backgroundColor: '#DEEBF7',
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

        {/* Right-aligned buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          {/* Resume Session Button - only visible if hasSessions */}
          {hasSessions && (
            <IconButton
              onClick={handleResumeSession}
              title="Resume Session"
              sx={{ color: '#333' }}
            >
              <PiCaretCircleDownLight size={24} />
            </IconButton>
          )}

          {/* Settings Button */}
          <IconButton
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            sx={{ color: '#333' }}
          >
            <GiSettingsKnobs size={24} />
          </IconButton>
        </Box>
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

          // For the last assistant message, include current structured messages as reasoning steps
          // For previous messages, use the reasoningSteps already stored with the message
          const reasoningStepsToShow = isLastMessage && isAssistant && structuredMessages.length > 0
            ? structuredMessages
            : (msg.reasoningSteps || []);

          // Show streaming state for last assistant message when actively streaming
          const isStreaming = streaming && isLastMessage && isAssistant;

          return (
            <ChatMessage
              key={idx}
              role={msg.role}
              text={msg.text}
              timestamp={msg.timestamp}
              usage={msg.usage}
              contextName={msg.contextName}
              reasoningSteps={reasoningStepsToShow}
              planApprovalState={planApprovalState}
              onPlanApprove={onPlanApprove}
              onPlanReject={onPlanReject}
              isStreaming={isStreaming}
              spanId={msg.spanId}
            />
          );
        })}

        {/* If no messages yet, or last message is not assistant, show streaming timeline */}
        {(messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') &&
          structuredMessages.length > 0 && (
          <Box sx={{ px: 2 }}>
            <StreamingTimeline
              items={structuredMessages}
              planApprovalState={planApprovalState}
              onPlanApprove={onPlanApprove}
              onPlanReject={onPlanReject}
            />
          </Box>
        )}

        {showTypingIndicator && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ p: 0, pb: 0 }}>
        <ChatInput onSend={onSendMessage} onAbort={onAbort} streaming={streaming} disabled={!projectExists} />
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
            <Typography variant="body1" sx={{ mb: 1 }}>
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
              <ToggleButton value="alternative">
                Other AI model
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Alternative Model Configuration */}
            {aiModel === 'alternative' && (
              <Box sx={{ mb: 0, p: 0, borderRadius: 1 }}>
                <TextField
                  label="Model Name"
                  value={altModelName}
                  onChange={(e) => setAltModelName(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                  placeholder="e.g., kimi-k2-instruct"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="API Base URL"
                  value={altModelBaseUrl}
                  onChange={(e) => setAltModelBaseUrl(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                  placeholder="e.g., https://api.moonshot.ai/anthropic"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Token/API Key"
                  value={altModelToken}
                  onChange={(e) => setAltModelToken(e.target.value)}
                  fullWidth
                  size="small"
                  type="password"
                  sx={{ mb: 2 }}
                  placeholder="Enter your API key"
                  InputLabelProps={{ shrink: true }}
                />
                <Alert
                  severity="info"
                  icon={<MdInfo />}
                  sx={{
                    backgroundColor: '#fffbf0',
                    color: '#856404',
                    '& .MuiAlert-icon': { color: '#856404' }
                  }}
                >
                  Model must be compatible with Anthropic messages API.
                </Alert>
              </Box>
            )}

            <Typography variant="body1" sx={{ mt:2, mb: 1 }}>
              Features
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={memoryEnabled}
                  disabled={!projectExists}
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

            <Box sx={{ mb: 2, mt: 2 }}>
              <Typography variant="body1" sx={{ mb: 1 }}>
                Maximum Agentic Loops
              </Typography>
              <TextField
                type="number"
                value={maxTurns}
                onChange={(e) => {
                  const value = Math.max(0, parseInt(e.target.value) || 0);
                  setMaxTurns(value);
                  localStorage.setItem('maxTurns', value.toString());
                }}
                size="small"
                sx={{ width: "180px" }}
                inputProps={{ min: 0, step: 1 }}
                helperText="0 = unlimited cycles"
              />
            </Box>

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

      {/* Session Pane */}
      <SessionPane
        open={sessionPaneOpen}
        onClose={() => setSessionPaneOpen(false)}
        projectName={projectName}
        onSessionSelect={handleSessionSelect}
      />
    </Box>
  );
}
