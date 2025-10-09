import React, { useRef, useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton, Modal, TextField } from '@mui/material';
import ChatPane from './components/ChatPane';
import ArtifactsPane from './components/ArtifactsPane';
import SplitLayout from './components/SplitLayout';
import ProjectMenu from './components/ProjectMenu';
import BudgetIndicator from './components/BudgetIndicator';
import SchedulingOverview from './components/SchedulingOverview';
import { TbCalendarTime, TbPresentation } from 'react-icons/tb';
import { IoInformationCircle } from "react-icons/io5";
import { useProject } from './contexts/ProjectContext.jsx';
import { claudeEventBus, ClaudeEvents } from './eventBus';

export default function App() {
  const { currentProject, projectExists, setProject } = useProject();
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState([]);
  const [structuredMessages, setStructuredMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [mode, setMode] = useState('work'); // 'plan' or 'work'
  const [aiModel, setAiModel] = useState('anthropic'); // 'anthropic' or 'openai'
  const [budgetSettings, setBudgetSettings] = useState({ enabled: false, limit: 0 });
  const [hasTasks, setHasTasks] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationText, setPresentationText] = useState('');
  const [showBackgroundInfo, setShowBackgroundInfo] = useState(() => {
    const saved = localStorage.getItem('showBackgroundInfo');
    return saved === 'true' ? true : false;
  });
  const [currentProcessId, setCurrentProcessId] = useState(null);

  const esRef = useRef(null);
  const interceptorEsRef = useRef(null);
  const currentMessageRef = useRef(null);
  const currentUsageRef = useRef(null);
  const activeToolCallsRef = useRef(new Map());

  useEffect(() => () => {
    esRef.current?.close();
    interceptorEsRef.current?.close();
  }, []);

  // Connect to interceptors SSE stream
  useEffect(() => {
    if (!currentProject) return;

    // Close existing connection
    if (interceptorEsRef.current) {
      interceptorEsRef.current.close();
    }

    const es = new EventSource(`/api/interceptors/stream/${currentProject}`);
    interceptorEsRef.current = es;

    es.addEventListener('interceptor', (e) => {
      const event = JSON.parse(e.data);

      // Log ALL interceptor events for debugging
      console.log('Interceptor event:', event.type, event.data);

      // Handle hooks (PreToolUse, PostToolUse)
      if (event.type === 'hook') {
        const hookData = event.data;
        const eventType = hookData.event_type;

        // Log for debugging
        console.log('Hook event:', eventType, hookData);

        if (eventType === 'PreToolUse') {
          // Tool call started
          const toolName = hookData.tool_name;
          const toolInput = hookData.tool_input;

          if (!toolName) {
            console.warn('Could not find tool_name in PreToolUse hook:', hookData);
            return;
          }

          const callId = `tool_${hookData.timestamp || Date.now()}`;
          activeToolCallsRef.current.set(callId, {
            toolName,
            args: toolInput,
            timestamp: hookData.timestamp || Date.now()
          });

          setStructuredMessages(prev => [...prev, {
            id: callId,
            type: 'tool_call',
            toolName,
            args: toolInput,
            status: 'running',
            callId
          }]);
        } else if (eventType === 'PostToolUse') {
          // Tool call completed
          const toolName = hookData.tool_name;
          const toolResponse = hookData.tool_response;
          const toolInput = hookData.tool_input;

          if (!toolName) {
            console.warn('Could not find tool_name in PostToolUse hook:', hookData);
            return;
          }

          // Dispatch claudeHook event for file operations
          const fileOperationTools = ['Edit', 'Write', 'NotebookEdit'];
          if (fileOperationTools.includes(toolName) && toolInput?.file_path) {
            const claudeHookEvent = new CustomEvent('claudeHook', {
              detail: {
                hook: 'PostHook',
                file: toolInput.file_path
              }
            });
            window.dispatchEvent(claudeHookEvent);
            console.log('Dispatched claudeHook for file:', toolInput.file_path);
          }

          // Find the matching PreToolUse
          const matchingCall = Array.from(activeToolCallsRef.current.entries())
            .find(([_, data]) => data.toolName === toolName);

          if (matchingCall) {
            const [callId] = matchingCall;
            activeToolCallsRef.current.delete(callId);

            // Extract result from tool_response if it's an object
            // For TodoWrite, pass the entire response object
            let result;
            if (toolName === 'TodoWrite' && toolResponse) {
              result = toolResponse;
            } else {
              result = toolResponse?.result || toolResponse?.output || JSON.stringify(toolResponse) || 'Completed';
            }

            setStructuredMessages(prev => prev.map(msg =>
              msg.callId === callId
                ? { ...msg, status: 'complete', result, args: toolName === 'TodoWrite' ? toolResponse : msg.args }
                : msg
            ));
          } else {
            console.warn('Could not find matching PreToolUse for PostToolUse:', toolName);
          }
        }
      } else if (event.type === 'event') {
        // Handle other events (Notification, UserPromptSubmit, MemoryExtracted, etc.)
        const eventData = event.data;
        const eventType = eventData.event_type;

        console.log('Event (not hook):', eventType, eventData);

        // Check if this is a memory extraction event
        if (eventType === 'MemoryExtracted') {
          setStructuredMessages(prev => [...prev, {
            id: `memory_${Date.now()}`,
            type: 'memory_extracted',
            facts: eventData.facts || [],
            count: eventData.count || 0
          }]);
        }

        // Check if this is a permission-related notification
        if (eventType === 'Notification' && eventData.message) {
          const msg = eventData.message.toLowerCase();
          if (msg.includes('permission') || msg.includes('allow') || msg.includes('grant')) {
            // This might be a permission request
            setStructuredMessages(prev => [...prev, {
              id: `perm_${Date.now()}`,
              type: 'permission_request',
              permissionId: `perm_${Date.now()}`,
              message: eventData.message
            }]);
          }
        }
      }
    });

    es.onerror = () => {
      console.error('Interceptor SSE connection error');
    };

    return () => {
      es.close();
    };
  }, [currentProject]);

  // Load initial project data
  useEffect(() => {
    if (!currentProject) return;

    const loadInitialData = async () => {
      try {
        const assistantRes = await fetch('/api/claude/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectName: currentProject })
        });
        const assistantData = await assistantRes.json();
        const greeting = assistantData?.assistant?.greeting;

        const historyRes = await fetch('/api/claude/chat/history', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectName: currentProject })
        });
        const historyData = await historyRes.json();
        const chatMessages = historyData?.messages || [];

        const loadedMessages = [];
        if (greeting) {
          loadedMessages.push({
            role: 'assistant',
            text: greeting,
            timestamp: formatTime()
          });
        }

        chatMessages.forEach(msg => {
          loadedMessages.push({
            role: msg.isAgent ? 'assistant' : 'user',
            text: msg.message,
            timestamp: new Date(msg.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }),
            usage: msg.costs
          });
        });

        setMessages(loadedMessages);
      } catch (err) {
        console.error('Failed to load initial chat data:', err);
      }
    };

    loadInitialData();
  }, [currentProject]);

  // Load budget settings when project changes
  useEffect(() => {
    const loadBudgetSettings = async () => {
      try {
        const response = await fetch(`/api/budget-monitoring/${currentProject}/settings`);
        const settings = await response.json();
        setBudgetSettings(settings || { enabled: false, limit: 0 });
      } catch (err) {
        console.error('Failed to load budget settings:', err);
        setBudgetSettings({ enabled: false, limit: 0 });
      }
    };

    if (currentProject) {
      loadBudgetSettings();
    }
  }, [currentProject]);

  // Function to refresh task count
  const refreshTaskCount = async () => {
    if (!currentProject) return;
    try {
      const response = await fetch(`/api/scheduler/${currentProject}/tasks`);
      const data = await response.json();
      setHasTasks((data.tasks || []).length > 0);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setHasTasks(false);
    }
  };

  // Load scheduled tasks when project changes
  useEffect(() => {
    refreshTaskCount();
  }, [currentProject]);

  // Poll for chat refresh from scheduled tasks (every 3 seconds)
  useEffect(() => {
    if (!currentProject) return;

    const pollChatRefresh = async () => {
      try {
        const response = await fetch(`/api/interceptors/chat/${currentProject}`);
        const data = await response.json();

        if (data.needsRefresh) {
          console.log('Chat refresh triggered by scheduled task');
          // Reload chat history
          const historyRes = await fetch('/api/claude/chat/history', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectName: currentProject })
          });
          const historyData = await historyRes.json();
          const chatMessages = historyData?.messages || [];

          // Get assistant greeting
          const assistantRes = await fetch('/api/claude/assistant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectName: currentProject })
          });
          const assistantData = await assistantRes.json();
          const greeting = assistantData?.assistant?.greeting;

          const loadedMessages = [];
          if (greeting) {
            loadedMessages.push({
              role: 'assistant',
              text: greeting,
              timestamp: formatTime()
            });
          }

          chatMessages.forEach(msg => {
            loadedMessages.push({
              role: msg.isAgent ? 'assistant' : 'user',
              text: msg.message,
              timestamp: new Date(msg.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              }),
              usage: msg.costs
            });
          });

          setMessages(loadedMessages);
        }
      } catch (err) {
        console.error('Failed to poll chat refresh:', err);
      }
    };

    const intervalId = setInterval(pollChatRefresh, 3000);

    return () => clearInterval(intervalId);
  }, [currentProject]);

  const formatTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // Fetch file content and add/update it in the files list
  const fetchFile = async (path, projectDir) => {
    const q = new URL(`/api/claude/getFile`, window.location.origin);
    q.searchParams.set('project_dir', projectDir);
    q.searchParams.set('file_name', path);
    const r = await fetch(q.toString());
    const j = await r.json();
    setFiles((arr) => {
      const next = arr.filter(x => x.path !== path).concat([{ path, content: j.content }]);
      return next;
    });
  };

  // Listen for file preview requests
  useEffect(() => {
    const handleFilePreview = (data) => {
      if (data.action === 'html-preview' && data.filePath && data.projectName) {
        // Fetch and add the file to the files list
        fetchFile(data.filePath, data.projectName);
      }
    };

    const unsubscribe = claudeEventBus.subscribe(ClaudeEvents.FILE_PREVIEW_REQUEST, handleFilePreview);

    return () => {
      unsubscribe();
    };
  }, []);

  const handleShowBackgroundInfoChange = (value) => {
    setShowBackgroundInfo(value);
    localStorage.setItem('showBackgroundInfo', value.toString());
    // Clear the closed toasts state so all toasts can be shown again
    localStorage.removeItem('closedBackgroundInfo');
  };

  const handleSendMessage = async (messageText) => {
    // Add user message
    setMessages(prev => [...prev, {
      role: 'user',
      text: messageText,
      timestamp: formatTime()
    }]);

    setStreaming(true);
    currentMessageRef.current = { role: 'assistant', text: '', timestamp: formatTime() };
    currentUsageRef.current = null;
    activeToolCallsRef.current.clear(); // Clear any pending tool calls
    setStructuredMessages([]); // Clear previous structured messages

    // Ensure project file exists
    await fetch(`/api/claude/addFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_dir: currentProject, file_name: 'CLAUDE.md', file_content: `# ${currentProject}\n` })
    });

    // Stream prompt
    const url = new URL(`/api/claude/streamPrompt`, window.location.origin);
    url.searchParams.set('project_dir', currentProject);
    url.searchParams.set('prompt', messageText);
    url.searchParams.set('agentMode', mode);
    url.searchParams.set('aiModel', aiModel);

    // Add memory enabled parameter
    const memoryEnabled = localStorage.getItem('memoryEnabled') === 'true';
    if (memoryEnabled) {
      url.searchParams.set('memoryEnabled', 'true');
    }

    // Add maxTurns parameter
    const maxTurns = localStorage.getItem('maxTurns');
    if (maxTurns) {
      url.searchParams.set('maxTurns', maxTurns);
    }

    const es = new EventSource(url.toString());
    esRef.current = es;

    es.addEventListener('session', (e) => {
      const data = JSON.parse(e.data);
      if (data.session_id) {
        setSessionId(data.session_id);
      }
      if (data.process_id) {
        setCurrentProcessId(data.process_id);
      }
    });

    es.addEventListener('stdout', (e) => {
      const { chunk } = JSON.parse(e.data);
      // Trim leading linebreaks only if this is the first chunk
      const textToAdd = currentMessageRef.current.text === '' ? chunk.trimStart() : chunk;
      // Add a line break after each chunk
      currentMessageRef.current.text += textToAdd + '\n';
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = { ...currentMessageRef.current };
        } else {
          newMessages.push({ ...currentMessageRef.current });
        }
        return newMessages;
      });
    });

    es.addEventListener('usage', (e) => {
      const usage = JSON.parse(e.data);
      currentUsageRef.current = usage;
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = {
            ...currentMessageRef.current,
            usage
          };
        }
        return newMessages;
      });
    });

    es.addEventListener('file_added', (e) => { fetchFile(JSON.parse(e.data).path, currentProject); });
    es.addEventListener('file_changed', (e) => { fetchFile(JSON.parse(e.data).path, currentProject); });

    es.addEventListener('guardrails_triggered', (e) => {
      const { plugins, count, detections } = JSON.parse(e.data);
      setStructuredMessages(prev => [...prev, {
        id: `guardrails_${Date.now()}`,
        type: 'guardrails_warning',
        plugins,
        count,
        detections
      }]);
    });

    es.addEventListener('output_guardrails_triggered', (e) => {
      const { violations, count } = JSON.parse(e.data);
      setStructuredMessages(prev => [...prev, {
        id: `output_guardrails_${Date.now()}`,
        type: 'output_guardrails_warning',
        violations,
        count
      }]);
    });

    const stop = () => {
      es.close();
      setStreaming(false);
      setCurrentProcessId(null);

      // Mark all structured messages as complete
      setStructuredMessages(prev => prev.map(msg =>
        msg.status === 'running' ? { ...msg, status: 'complete' } : msg
      ));

      // Finalize message
      if (currentMessageRef.current.text) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...currentMessageRef.current,
              usage: currentUsageRef.current
            };
          }
          return newMessages;
        });
      }
    };

    es.addEventListener('completed', stop);
    es.addEventListener('error', stop);
  };

  const handleAbort = async () => {
    if (currentProcessId) {
      try {
        await fetch(`/api/claude/abort/${currentProcessId}`, {
          method: 'POST'
        });
        esRef.current?.close();
        setStreaming(false);
        setCurrentProcessId(null);
      } catch (error) {
        console.error('Failed to abort process:', error);
      }
    }
  };

  const handleProjectChange = async (newProject) => {
    setProject(newProject);
    setMessages([]);
    setStructuredMessages([]);
    setFiles([]);
    setSessionId('');
    esRef.current?.close();
    setStreaming(false);

    // Load assistant greeting
    try {
      const assistantRes = await fetch('/api/claude/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectName: newProject })
      });
      const assistantData = await assistantRes.json();
      const greeting = assistantData?.assistant?.greeting;

      // Load chat history
      const historyRes = await fetch('/api/claude/chat/history', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectName: newProject })
      });
      const historyData = await historyRes.json();
      const chatMessages = historyData?.messages || [];

      // Build message list
      const loadedMessages = [];

      // Add greeting as first message if it exists
      if (greeting) {
        loadedMessages.push({
          role: 'assistant',
          text: greeting,
          timestamp: formatTime()
        });
      }

      // Add chat history messages
      chatMessages.forEach(msg => {
        loadedMessages.push({
          role: msg.isAgent ? 'assistant' : 'user',
          text: msg.message,
          timestamp: new Date(msg.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }),
          usage: msg.costs
        });
      });

      setMessages(loadedMessages);

      // Load budget settings for the new project
      const budgetRes = await fetch(`/api/budget-monitoring/${newProject}/settings`);
      const budgetData = await budgetRes.json();
      setBudgetSettings(budgetData || { enabled: false, limit: 0 });

      // Check if project has scheduled tasks
      try {
        const tasksRes = await fetch(`/api/scheduler/${newProject}/tasks`);
        const tasksData = await tasksRes.json();
        setHasTasks((tasksData.tasks || []).length > 0);
      } catch (err) {
        console.error('Failed to load tasks:', err);
        setHasTasks(false);
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" sx={{ zIndex: 10 }}>
        <Toolbar>
          <Typography variant="h6">Etienne: Headless Claude Code</Typography>
          {currentProject && (
            <BudgetIndicator
              project={currentProject}
              budgetSettings={budgetSettings}
              onSettingsChange={setBudgetSettings}
              showBackgroundInfo={showBackgroundInfo}
            />
          )}
          {hasTasks && currentProject && (
            <IconButton
              color="inherit"
              onClick={() => setSchedulingOpen(true)}
              sx={{ ml: 3 }}
              title="Scheduled Tasks"
            >
              <TbCalendarTime size={24} />
            </IconButton>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            color="inherit"
            onClick={() => setPresentationOpen(true)}
            sx={{ opacity: 0.5 }}
            title="Presentation"
          >
            <TbPresentation size={24} />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="subtitle1" sx={{ mr: 2, opacity: 0.8 }}>
            [{currentProject || 'Select/Create a Project'}]
          </Typography>
          {sessionId && (
            <Typography variant="caption" sx={{ mr: 2, opacity: 0.7 }}>
              Session: {sessionId}
            </Typography>
          )}
          <ProjectMenu
            currentProject={currentProject}
            onProjectChange={handleProjectChange}
            budgetSettings={budgetSettings}
            onBudgetSettingsChange={setBudgetSettings}
            onTasksChange={refreshTaskCount}
            showBackgroundInfo={showBackgroundInfo}
          />
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <SplitLayout
          left={<ChatPane messages={messages} structuredMessages={structuredMessages} onSendMessage={handleSendMessage} onAbort={handleAbort} streaming={streaming} mode={mode} onModeChange={setMode} aiModel={aiModel} onAiModelChange={setAiModel} showBackgroundInfo={showBackgroundInfo} onShowBackgroundInfoChange={handleShowBackgroundInfoChange} projectExists={projectExists} />}
          right={<ArtifactsPane files={files} projectName={currentProject} showBackgroundInfo={showBackgroundInfo} projectExists={projectExists} />}
        />
      </Box>

      <SchedulingOverview
        open={schedulingOpen}
        onClose={() => {
          setSchedulingOpen(false);
          refreshTaskCount();
        }}
        project={currentProject}
        showBackgroundInfo={showBackgroundInfo}
      />

      <Modal
        open={presentationOpen}
        onClose={() => {
          setPresentationOpen(false);
          setPresentationText('');
        }}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '30px'
        }}
        BackdropProps={{
          sx: {
            backgroundColor: 'transparent'
          }
        }}
      >
        <Box
          sx={{
            width: '70%',
            height: '100px',
            bgcolor: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            borderRight: '6px solid darkorange',
            padding: '0 20px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}
        >
          <IoInformationCircle size={48} color="darkorange" style={{ marginRight: '20px', flexShrink: 0 }} />
          <TextField
            value={presentationText}
            onChange={(e) => setPresentationText(e.target.value)}
            variant="standard"
            fullWidth
            InputProps={{
              disableUnderline: true,
              style: {
                textAlign: 'center',
                color: 'darkorange',
                fontSize: '2rem'
              }
            }}
            inputProps={{
              style: {
                textAlign: 'center'
              },
              autoComplete: 'off',
              autoCorrect: 'off',
              autoCapitalize: 'off',
              spellCheck: 'false'
            }}
          />
        </Box>
      </Modal>
    </Box>
  );
}
