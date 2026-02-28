import React, { useRef, useEffect, useState } from 'react';
import { Box, IconButton, Modal, Typography, Button, ToggleButton, ToggleButtonGroup, FormControlLabel, Checkbox, TextField, Alert } from '@mui/material';
import { LuBrain } from "react-icons/lu";
import { HiOutlineWrench } from "react-icons/hi2";
import { GiSettingsKnobs } from "react-icons/gi";
import { IoClose } from "react-icons/io5";
import { RiChatNewLine } from "react-icons/ri";
import { PiCaretCircleDownLight } from "react-icons/pi";
import { MdInfo } from "react-icons/md";
import { useTranslation } from 'react-i18next';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import StreamingTimeline from './StreamingTimeline';
import SessionPane from './SessionPane';
import NotificationMenu from './NotificationMenu';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

export default function ChatPane({ messages, structuredMessages = [], onSendMessage, onAbort, streaming, mode, onModeChange, aiModel, onAiModelChange, showBackgroundInfo, onShowBackgroundInfoChange, projectExists = true, projectName, onSessionChange, hasActiveSession = false, hasSessions = false, onShowWelcomePage, uiConfig, codingAgent = 'anthropic' }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const { mode: themeMode } = useThemeMode();
  const isAdmin = hasRole('admin');
  const isGuest = hasRole('guest');
  const messagesEndRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionPaneOpen, setSessionPaneOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(() => {
    const saved = localStorage.getItem('memoryEnabled');
    return saved !== 'false';
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

      const response = await apiFetch(url.toString());
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
    // Guests cannot change mode - they are locked to planning mode
    if (isGuest) return;
    if (newMode !== null && onModeChange) {
      onModeChange(newMode);
    }
  };

  // Force planning mode for guests on mount
  useEffect(() => {
    if (isGuest && mode !== 'plan' && onModeChange) {
      onModeChange('plan');
    }
  }, [isGuest, mode, onModeChange]);

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

        await apiFetch('/api/claude/addFile', {
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
      backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#fffef5'
    }}>
      {/* Header */}
      <Box sx={{
        height: '48px',
        backgroundColor: themeMode === 'dark' ? '#383838' : 'white',
        display: 'flex',
        alignItems: 'center',
        px: 2,
        borderBottom: themeMode === 'dark' ? '1px solid #555' : '1px solid #e0e0e0',
        position: 'relative'
      }}>
        {/* Left: New Conversation Button */}
        <IconButton
          onClick={handleNewSession}
          title={t('chatPane.startNewSession')}
          sx={{ color: themeMode === 'dark' ? 'gold' : '#1976d2' }}
        >
          <RiChatNewLine size={19} />
        </IconButton>

        {/* Center: Mode Toggle — hidden when CODING_AGENT=openai (Codex has no plan mode) */}
        {codingAgent !== 'openai' && (
        <Box sx={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}>
          <ToggleButtonGroup
            value={isGuest ? 'plan' : mode}
            exclusive
            onChange={handleModeChange}
            size="small"
            disabled={isGuest}
            sx={{
              '& .MuiToggleButton-root.Mui-selected': {
                backgroundColor: '#DEEBF7',
                color: '#000',
                '&:hover': {
                  backgroundColor: '#90caf9'
                }
              }
            }}
          >
            <ToggleButton value="plan" title={isGuest ? t('chatPane.planningModeGuestTooltip') : t('chatPane.planningMode')}>
              <LuBrain size={16} />
            </ToggleButton>
            <ToggleButton value="work" title={isGuest ? t('chatPane.workModeGuestTooltip') : t('chatPane.workMode')} disabled={isGuest}>
              <HiOutlineWrench size={20} />
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ color: '#666', fontSize: '0.875rem' }}>
            {mode === 'work' ? t('chatPane.workMode') : t('chatPane.planningMode')}
          </Typography>
        </Box>
        )}

        {/* Right-aligned buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          {/* Notification Bell */}
          <NotificationMenu projectName={projectName} />

          {/* Resume Session Button - only visible if hasSessions */}
          {hasSessions && (
            <IconButton
              onClick={handleResumeSession}
              title={t('chatPane.resumeSession')}
              sx={{ color: themeMode === 'dark' ? '#fff' : '#333' }}
            >
              <PiCaretCircleDownLight size={24} />
            </IconButton>
          )}

          {/* Settings Button - Admin only */}
          {isAdmin && (
            <IconButton
              onClick={() => setSettingsOpen(true)}
              title={t('chatPane.settings')}
              sx={{ color: '#333' }}
            >
              <GiSettingsKnobs size={24} />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Messages Area */}
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        py: 2,
        '&::-webkit-scrollbar': { width: '8px' },
        '&::-webkit-scrollbar-track': { backgroundColor: themeMode === 'dark' ? '#2c2c2c' : '#f5f5f0' },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: themeMode === 'dark' ? '#555' : '#ccc',
          borderRadius: '4px',
          '&:hover': { backgroundColor: themeMode === 'dark' ? '#777' : '#aaa' }
        },
        scrollbarColor: themeMode === 'dark' ? '#555 #2c2c2c' : '#ccc #f5f5f0',
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
              isStreaming={isStreaming}
              spanId={msg.spanId}
              source={msg.source}
              sourceMetadata={msg.sourceMetadata}
            />
          );
        })}

        {/* If no messages yet, or last message is not assistant, show streaming timeline */}
        {(messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') &&
          structuredMessages.length > 0 && (
          <Box sx={{ px: 2 }}>
            <StreamingTimeline
              items={structuredMessages}
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
            <Typography variant="h6">{t('chatPane.settingsTitle')}</Typography>
            <IconButton onClick={() => setSettingsOpen(false)} size="small">
              <IoClose size={20} />
            </IconButton>
          </Box>

          {/* Modal Content */}
          <Box sx={{ p: 3 }}>
            <Typography variant="body1" sx={{ mb: 1 }}>
              {t('chatPane.aiModel')}
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
                {t('chatPane.anthropicClaude')}
              </ToggleButton>
              <ToggleButton value="alternative">
                {t('chatPane.otherAiModel')}
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Alternative Model Configuration */}
            {aiModel === 'alternative' && (
              <Box sx={{ mb: 0, p: 0, borderRadius: 1 }}>
                <TextField
                  label={t('chatPane.modelName')}
                  value={altModelName}
                  onChange={(e) => setAltModelName(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                  placeholder={t('chatPane.modelNamePlaceholder')}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label={t('chatPane.apiBaseUrl')}
                  value={altModelBaseUrl}
                  onChange={(e) => setAltModelBaseUrl(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                  placeholder={t('chatPane.apiBaseUrlPlaceholder')}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label={t('chatPane.tokenApiKey')}
                  value={altModelToken}
                  onChange={(e) => setAltModelToken(e.target.value)}
                  fullWidth
                  size="small"
                  type="password"
                  sx={{ mb: 2 }}
                  placeholder={t('chatPane.tokenApiKeyPlaceholder')}
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
                  {t('chatPane.modelCompatibility')}
                </Alert>
              </Box>
            )}

            <Typography variant="body1" sx={{ mt:2, mb: 1 }}>
              {t('chatPane.features')}
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
              label={t('chatPane.longTermMemory')}
              sx={{ mb: 1 }}
            />

            <Box sx={{ mb: 2, mt: 2 }}>
              <Typography variant="body1" sx={{ mb: 1 }}>
                {t('chatPane.maxAgenticLoops')}
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
                helperText={t('chatPane.maxTurnsHelper')}
              />
            </Box>

            <Typography variant="body1" sx={{ mb: 1, mt: 2 }}>
              {t('chatPane.displayOptions')}
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
              label={t('chatPane.showBackgroundInfo')}
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
              {t('common.save')}
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
