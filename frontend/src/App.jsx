import React, { useRef, useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton, Modal, TextField, Tooltip, Snackbar } from '@mui/material';
import ChatPane from './components/ChatPane';
import ArtifactsPane from './components/ArtifactsPane';
import SplitLayout from './components/SplitLayout';
import ProjectMenu from './components/ProjectMenu';
import BudgetIndicator from './components/BudgetIndicator';
import SchedulingOverview from './components/SchedulingOverview';
import WelcomePage from './components/WelcomePage';
import ContextSwitcher from './components/ContextSwitcher';
import ContextManager from './components/ContextManager';
import { TbCalendarTime, TbPresentation, TbDeviceAirtag } from 'react-icons/tb';
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
  const [currentSessionId, setCurrentSessionId] = useState(null); // Track which session we're viewing
  const [hasSessions, setHasSessions] = useState(false); // Track if sessions exist
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
  const [uiConfig, setUiConfig] = useState(null);
  const [showWelcomePage, setShowWelcomePage] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [activeContextId, setActiveContextId] = useState(null);
  const [contexts, setContexts] = useState([]);
  const [contextManagerOpen, setContextManagerOpen] = useState(false);
  const [allTags, setAllTags] = useState([]);

  const esRef = useRef(null);
  const interceptorEsRef = useRef(null);
  const currentMessageRef = useRef(null);
  const currentUsageRef = useRef(null);
  const activeToolCallsRef = useRef(new Map());

  useEffect(() => () => {
    esRef.current?.close();
    interceptorEsRef.current?.close();
  }, []);

  // Load tags when project changes
  useEffect(() => {
    if (currentProject) {
      loadTags();
    }
  }, [currentProject]);

  // Load active context when session changes
  useEffect(() => {
    if (currentProject && sessionId) {
      loadActiveContext();
    }
  }, [currentProject, sessionId]);

  // Load contexts when project changes
  useEffect(() => {
    if (currentProject) {
      loadContexts();
    }
  }, [currentProject]);

  const loadTags = async () => {
    try {
      const response = await fetch(`/api/workspace/${encodeURIComponent(currentProject)}/tags`);
      const data = await response.json();
      setAllTags(data || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const loadContexts = async () => {
    try {
      const response = await fetch(`/api/workspace/${encodeURIComponent(currentProject)}/contexts`);
      const data = await response.json();
      setContexts(data || []);
    } catch (err) {
      console.error('Failed to load contexts:', err);
    }
  };

  const loadActiveContext = async () => {
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}/${sessionId}/context`);
      const data = await response.json();
      if (data.success) {
        setActiveContextId(data.contextId);
      }
    } catch (err) {
      console.error('Failed to load active context:', err);
    }
  };

  const handleContextChange = (contextId) => {
    setActiveContextId(contextId);
  };

  // Load project data on initial mount and project changes (including page refresh)
  useEffect(() => {
    if (!currentProject) {
      setUiConfig(null);
      setShowWelcomePage(false);
      return;
    }

    const initializeProject = async () => {
      try {
        // Check if sessions exist
        const sessionsRes = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}`);
        const sessionsData = await sessionsRes.json();
        const hasExistingSessions = sessionsData.success && sessionsData.sessions && sessionsData.sessions.length > 0;
        setHasSessions(hasExistingSessions);

        // Load assistant greeting
        const assistantRes = await fetch('/api/claude/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectName: currentProject })
        });
        const assistantData = await assistantRes.json();
        const greeting = assistantData?.assistant?.greeting;

        // If sessions exist, automatically load the most recent one
        if (hasExistingSessions && sessionsData.sessions.length > 0) {
          const mostRecentSession = sessionsData.sessions[0];
          setCurrentSessionId(mostRecentSession.sessionId);
          setSessionId(mostRecentSession.sessionId);

          // Load the most recent session's history
          const historyRes = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}/${mostRecentSession.sessionId}/history`);
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
        } else {
          // No sessions exist, just show the greeting
          const loadedMessages = [];
          if (greeting) {
            loadedMessages.push({
              role: 'assistant',
              text: greeting,
              timestamp: formatTime()
            });
          }
          setMessages(loadedMessages);
        }

        // Load UI configuration with session info
        const uiResponse = await fetch(`/api/workspace/${currentProject}/user-interface`);
        if (uiResponse.ok) {
          const config = await uiResponse.json();
          setUiConfig(config);
          // Show welcome page only if config exists, has welcome data, showWelcomeMessage is true, AND no existing sessions
          const shouldShowWelcome = config?.welcomePage && config.welcomePage.showWelcomeMessage !== false && (config.welcomePage.message || config.welcomePage.quickActions?.length) && !hasExistingSessions;
          setShowWelcomePage(shouldShowWelcome);

          // Load preview documents if configured
          if (config?.previewDocuments && Array.isArray(config.previewDocuments)) {
            config.previewDocuments.forEach(docPath => {
              if (docPath && docPath.trim()) {
                fetchFile(docPath.trim(), currentProject);
              }
            });
          }
        } else {
          setUiConfig(null);
          setShowWelcomePage(false);
        }

        // Load budget settings
        const budgetRes = await fetch(`/api/budget-monitoring/${currentProject}/settings`);
        const budgetData = await budgetRes.json();
        setBudgetSettings(budgetData || { enabled: false, limit: 0 });

        // Check if project has scheduled tasks
        const tasksRes = await fetch(`/api/scheduler/${currentProject}/tasks`);
        const tasksData = await tasksRes.json();
        setHasTasks((tasksData.tasks || []).length > 0);
      } catch (error) {
        console.error('Failed to initialize project:', error);
        setUiConfig(null);
        setShowWelcomePage(false);
      }
    };

    initializeProject();
  }, [currentProject]);

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
          // PreToolUse hook is logged but UI updates come from main stream 'tool' events
          // to avoid duplicates (backend emits to both streams)
          console.log('PreToolUse hook received:', hookData);
        } else if (eventType === 'PostToolUse') {
          // PostToolUse hook handles side effects only (file operations, etc.)
          // UI updates come from main stream 'tool' events to avoid duplicates
          const toolName = hookData.tool_name;
          const toolInput = hookData.tool_input;

          if (!toolName) {
            console.warn('Could not find tool_name in PostToolUse hook:', hookData);
            return;
          }

          console.log('PostToolUse hook received:', hookData);

          // Dispatch claudeHook event for file operations (still needed for file watchers)
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

            // Auto-preview files with supported extensions
            const filePath = toolInput.file_path;
            const extension = filePath.split('.').pop()?.toLowerCase();
            const supportedExtensions = ['html', 'htm', 'json', 'md', 'mermaid'];

            if (supportedExtensions.includes(extension)) {
              // Extract relative path from absolute path
              const relativePath = extractRelativePath(filePath);
              console.log(`[Auto-preview] File created: ${filePath}`);
              console.log(`[Auto-preview] Extension: ${extension}`);
              console.log(`[Auto-preview] Relative path: ${relativePath}`);
              console.log(`[Auto-preview] Current project: ${currentProject}`);
              console.log(`[Auto-preview] Waiting 800ms before fetching...`);

              // Increase delay to ensure file is fully written to disk
              setTimeout(() => {
                console.log(`[Auto-preview] Now fetching file: ${relativePath}`);
                fetchFile(relativePath, currentProject);
              }, 800);
            }
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

  // Listen for deep research events and auto-open research files
  useEffect(() => {
    if (!currentProject) return;

    const researchEs = new EventSource(`/api/deep-research/${encodeURIComponent(currentProject)}/stream`);

    researchEs.addEventListener('Research.started', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research started:', data);

      // Auto-open the research file (even though it doesn't exist yet)
      // The ResearchDocument component will show progress
      const file = {
        path: data.outputFile,
        content: '', // Empty content, component handles polling
        type: 'research'
      };

      setFiles(prevFiles => {
        // Check if file already exists in the list
        const exists = prevFiles.some(f => f.path === data.outputFile);
        if (exists) {
          return prevFiles;
        }
        return [...prevFiles, file];
      });

      // Don't show structured messages in chat - all progress shown in ResearchDocument component only
    });

    researchEs.addEventListener('Research.completed', (e) => {
      const data = JSON.parse(e.data);
      console.log('Research completed:', data);

      // Don't show structured messages in chat - all progress shown in ResearchDocument component only
    });

    researchEs.addEventListener('Research.error', (e) => {
      const data = JSON.parse(e.data);
      console.error('Research error:', data);

      // Don't show structured messages in chat - all progress shown in ResearchDocument component only
    });

    researchEs.onerror = () => {
      console.error('Research SSE connection error');
    };

    return () => {
      researchEs.close();
    };
  }, [currentProject]);

  // Check if sessions exist for the current project
  useEffect(() => {
    if (!currentProject) return;

    const checkSessions = async () => {
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}`);
        const data = await response.json();
        setHasSessions(data.success && data.sessions && data.sessions.length > 0);
      } catch (err) {
        console.error('Failed to check sessions:', err);
        setHasSessions(false);
      }
    };

    checkSessions();
  }, [currentProject]);

  // This effect is no longer needed - project loading is handled by handleProjectChange
  // Keeping this comment as a marker that initial load logic has been moved

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

  // Extract relative path from absolute path
  const extractRelativePath = (absolutePath) => {
    // absolutePath is like: C:\Data\GitHub\claude-multitenant\workspace\pet-store-4\out\vogel-angebote.html
    // We need: out/vogel-angebote.html
    const pathParts = absolutePath.split(/[/\\]/);
    const workspaceIndex = pathParts.findIndex(p => p === 'workspace');

    if (workspaceIndex !== -1 && pathParts.length > workspaceIndex + 2) {
      // Skip workspace and project dir, get the rest
      return pathParts.slice(workspaceIndex + 2).join('/');
    }

    // If it's already a relative path, return as-is
    return absolutePath;
  };

  // Fetch file content and add/update it in the files list
  const fetchFile = async (path, projectDir, retries = 3, delayMs = 500) => {
    console.log(`[fetchFile] Attempting to fetch: ${path} from project: ${projectDir}`);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const q = new URL(`/api/claude/getFile`, window.location.origin);
        q.searchParams.set('project_dir', projectDir);
        q.searchParams.set('file_name', path);

        console.log(`[fetchFile] Attempt ${attempt + 1}/${retries}: ${q.toString()}`);
        const r = await fetch(q.toString());

        if (!r.ok) {
          const errorText = await r.text();
          console.error(`[fetchFile] HTTP ${r.status}: ${errorText}`);

          // If it's a 404 and we have retries left, wait and retry
          if (r.status === 404 && attempt < retries - 1) {
            console.log(`[fetchFile] File not found, retrying in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }

          throw new Error(`HTTP ${r.status}: ${errorText}`);
        }

        const j = await r.json();
        console.log(`[fetchFile] Successfully fetched: ${path}`);

        setFiles((arr) => {
          const next = arr.filter(x => x.path !== path).concat([{ path, content: j.content }]);
          return next;
        });

        return; // Success, exit the retry loop

      } catch (error) {
        console.error(`[fetchFile] Attempt ${attempt + 1} failed:`, error);

        // If this was the last attempt, give up
        if (attempt === retries - 1) {
          console.error(`[fetchFile] All ${retries} attempts failed for: ${path}`);
          return;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  };

  // Handle closing a single tab
  const handleCloseTab = (path) => {
    setFiles(files => files.filter(f => f.path !== path));
  };

  // Listen for file preview requests
  useEffect(() => {
    const handleFilePreview = (data) => {
      if ((data.action === 'html-preview' || data.action === 'json-preview' || data.action === 'markdown-preview' || data.action === 'mermaid-preview' || data.action === 'research-preview' || data.action === 'image-preview' || data.action === 'excel-preview') && data.filePath && data.projectName) {
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

  const handleCopySessionId = async () => {
    if (sessionId) {
      try {
        await navigator.clipboard.writeText(sessionId);
        setSnackbarOpen(true);
      } catch (err) {
        console.error('Failed to copy session ID:', err);
      }
    }
  };

  const handleSendMessage = async (messageText) => {
    // Get active context name if available
    const activeContext = activeContextId ? contexts.find(c => c.id === activeContextId) : null;

    // Add user message
    setMessages(prev => [...prev, {
      role: 'user',
      text: messageText,
      timestamp: formatTime(),
      contextName: activeContext ? activeContext.name : null
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
    const url = new URL(`/api/claude/streamPrompt/sdk`, window.location.origin);
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
      // Don't add extra line breaks - the chunk already contains proper formatting
      currentMessageRef.current.text += textToAdd;
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = { ...currentMessageRef.current };
        } else {
          // Only add message to state if there's actual content
          if (currentMessageRef.current.text.trim()) {
            newMessages.push({ ...currentMessageRef.current });
          }
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

    es.addEventListener('file_added', (e) => {
      const absolutePath = JSON.parse(e.data).path;
      const relativePath = extractRelativePath(absolutePath);
      console.log(`[file_added] Absolute: ${absolutePath}, Relative: ${relativePath}`);

      // Dispatch claudeHook event for LiveHTMLPreview to refresh
      const claudeHookEvent = new CustomEvent('claudeHook', {
        detail: {
          hook: 'PostHook',
          file: absolutePath
        }
      });
      window.dispatchEvent(claudeHookEvent);
      console.log('[file_added] Dispatched claudeHook event for:', absolutePath);

      fetchFile(relativePath, currentProject);
    });
    es.addEventListener('file_changed', (e) => {
      const absolutePath = JSON.parse(e.data).path;
      const relativePath = extractRelativePath(absolutePath);
      console.log(`[file_changed] Absolute: ${absolutePath}, Relative: ${relativePath}`);

      // Dispatch claudeHook event for LiveHTMLPreview to refresh
      const claudeHookEvent = new CustomEvent('claudeHook', {
        detail: {
          hook: 'PostHook',
          file: absolutePath
        }
      });
      window.dispatchEvent(claudeHookEvent);
      console.log('[file_changed] Dispatched claudeHook event for:', absolutePath);

      fetchFile(relativePath, currentProject);
    });

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

      // Refresh sessions list (a new session may have been created)
      if (currentProject) {
        fetch(`/api/sessions/${encodeURIComponent(currentProject)}`)
          .then(res => res.json())
          .then(data => {
            setHasSessions(data.success && data.sessions && data.sessions.length > 0);
          })
          .catch(err => {
            console.error('Failed to refresh sessions:', err);
          });
      }
    };

    // Listen for tool execution events
    es.addEventListener('tool', (e) => {
      const data = JSON.parse(e.data);
      console.log('Tool event:', data);

      setStructuredMessages(prev => {
        const existing = prev.find(msg => msg.id === data.callId);
        if (existing) {
          // Update existing tool call with new status
          return prev.map(msg =>
            msg.id === data.callId
              ? {
                  ...msg,
                  type: 'tool_call',
                  toolName: data.toolName,
                  args: data.input,
                  status: data.status,
                  result: data.result
                }
              : msg
          );
        } else {
          // For TodoWrite, remove all previous TodoWrite entries to show only the latest
          const isTodoWrite = data.toolName === 'TodoWrite';
          const filteredPrev = isTodoWrite
            ? prev.filter(msg => msg.toolName !== 'TodoWrite')
            : prev;

          // Add new tool call
          return [...filteredPrev, {
            id: data.callId,
            type: 'tool_call',
            toolName: data.toolName,
            args: data.input,
            status: data.status,
            result: data.result
          }];
        }
      });
    });

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

  const handleSessionChange = async (newSessionId) => {
    // If newSessionId is null, start a new session (clear current session)
    if (newSessionId === null) {
      setCurrentSessionId(null);
      setSessionId('');
      setMessages([]);
      setStructuredMessages([]);

      // Clear the session.id file on the backend
      try {
        await fetch(`/api/claude/clearSession/${encodeURIComponent(currentProject)}`, {
          method: 'POST'
        });
      } catch (err) {
        console.error('Failed to clear session on backend:', err);
      }

      // Load just the greeting
      try {
        const assistantRes = await fetch('/api/claude/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectName: currentProject })
        });
        const assistantData = await assistantRes.json();
        const greeting = assistantData?.assistant?.greeting;

        if (greeting) {
          setMessages([{
            role: 'assistant',
            text: greeting,
            timestamp: formatTime()
          }]);
        }
      } catch (err) {
        console.error('Failed to load greeting:', err);
      }
      return;
    }

    // Load specific session
    setCurrentSessionId(newSessionId);
    setSessionId(newSessionId);

    try {
      // Load session history
      const historyRes = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}/${newSessionId}/history`);
      const historyData = await historyRes.json();
      const chatMessages = historyData?.messages || [];

      // Load greeting
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
      setStructuredMessages([]);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  };

  const handleProjectChange = async (newProject) => {
    // Reset state before project change
    setMessages([]);
    setStructuredMessages([]);
    setFiles([]);
    setSessionId('');
    setCurrentSessionId(null);
    setHasSessions(false);
    esRef.current?.close();
    setStreaming(false);

    // Update project - this will trigger the useEffect that loads all project data
    setProject(newProject);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="static"
        sx={{
          zIndex: 10,
          backgroundColor: uiConfig?.appBar?.backgroundColor,
          color: uiConfig?.appBar?.fontColor,
        }}
      >
        <Toolbar>
          <Typography variant="h6">
            {uiConfig?.appBar?.title || 'Etienne: an Anthropic Agent SDK Seed'}
          </Typography>
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
            <Tooltip title={`Claude Session ID: ${sessionId}`} arrow>
              <IconButton
                color="inherit"
                sx={{ mr: 1, opacity: 0.8 }}
                onClick={handleCopySessionId}
              >
                <TbDeviceAirtag size={24} />
              </IconButton>
            </Tooltip>
          )}
          {currentProject && sessionId && (
            <ContextSwitcher
              projectName={currentProject}
              sessionId={sessionId}
              activeContextId={activeContextId}
              onContextChange={handleContextChange}
              onManageContexts={() => setContextManagerOpen(true)}
              sx={{ mr: 2 }}
            />
          )}
          <ProjectMenu
            currentProject={currentProject}
            onProjectChange={handleProjectChange}
            budgetSettings={budgetSettings}
            onBudgetSettingsChange={setBudgetSettings}
            onTasksChange={refreshTaskCount}
            showBackgroundInfo={showBackgroundInfo}
            onUIConfigChange={(config) => {
              setUiConfig(config);
              if (config?.welcomePage && (config.welcomePage.message || config.welcomePage.quickActions?.length)) {
                setShowWelcomePage(true);
              }
            }}
          />
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {showWelcomePage ? (
          <WelcomePage
            welcomeConfig={uiConfig?.welcomePage}
            onSendMessage={(message) => {
              setShowWelcomePage(false);
              handleSendMessage(message);
            }}
            onReturnToDefault={() => setShowWelcomePage(false)}
          />
        ) : (
          <SplitLayout
            left={<ChatPane messages={messages} structuredMessages={structuredMessages} onSendMessage={handleSendMessage} onAbort={handleAbort} streaming={streaming} mode={mode} onModeChange={setMode} aiModel={aiModel} onAiModelChange={setAiModel} showBackgroundInfo={showBackgroundInfo} onShowBackgroundInfoChange={handleShowBackgroundInfoChange} projectExists={projectExists} projectName={currentProject} onSessionChange={handleSessionChange} hasActiveSession={sessionId !== ''} hasSessions={hasSessions} onShowWelcomePage={() => setShowWelcomePage(true)} uiConfig={uiConfig} />}
            right={<ArtifactsPane files={files} projectName={currentProject} showBackgroundInfo={showBackgroundInfo} projectExists={projectExists} onClearPreview={() => setFiles([])} onCloseTab={handleCloseTab} />}
          />
        )}
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

      {/* Snackbar for copy confirmation */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message="Claude Session ID copied"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />

      {/* Context Manager Dialog */}
      <ContextManager
        open={contextManagerOpen}
        onClose={() => setContextManagerOpen(false)}
        projectName={currentProject}
        allTags={allTags}
        onContextChange={handleContextChange}
      />
    </Box>
  );
}
