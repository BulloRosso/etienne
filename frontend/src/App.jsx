import React, { useRef, useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton, Modal, TextField, Tooltip, Snackbar, CircularProgress } from '@mui/material';
import ChatPane from './components/ChatPane';
import ArtifactsPane from './components/ArtifactsPane';
import SplitLayout from './components/SplitLayout';
import ProjectMenu from './components/ProjectMenu';
import BudgetIndicator from './components/BudgetIndicator';
import SchedulingOverview from './components/SchedulingOverview';
import WelcomePage from './components/WelcomePage';
import ContextSwitcher from './components/ContextSwitcher';
import ContextManager from './components/ContextManager';
import ElicitationModal from './components/ElicitationModal';
import PermissionModal from './components/PermissionModal';
import AskUserQuestionModal from './components/AskUserQuestionModal';
import PlanApprovalModal from './components/PlanApprovalModal';
import PairingRequestModal from './components/PairingRequestModal';
import LoginDialog from './components/LoginDialog';
import { TbCalendarTime, TbPresentation, TbDeviceAirtag } from 'react-icons/tb';
import { IoInformationCircle } from "react-icons/io5";
import { useProject } from './contexts/ProjectContext.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { claudeEventBus, ClaudeEvents } from './eventBus';
import Onboarding from './components/Onboarding';

export default function App() {
  const { currentProject, projectExists, setProject } = useProject();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState([]);
  const [structuredMessages, setStructuredMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null); // Track which session we're viewing
  const [hasSessions, setHasSessions] = useState(false); // Track if sessions exist
  const [mode, setMode] = useState('work'); // 'plan' or 'work'
  const [planApprovalState, setPlanApprovalState] = useState({}); // { [toolId]: 'approved' | 'rejected' }
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
  const [showConfigurationRequired, setShowConfigurationRequired] = useState(null); // null = checking, true = show onboarding, false = show app
  const [pendingElicitation, setPendingElicitation] = useState(null); // Current elicitation request from MCP tool
  const [pendingPermission, setPendingPermission] = useState(null); // Current permission request from SDK canUseTool
  const [pendingQuestion, setPendingQuestion] = useState(null); // Current AskUserQuestion request
  const [pendingPlanApproval, setPendingPlanApproval] = useState(null); // Current ExitPlanMode request
  const [pendingPairing, setPendingPairing] = useState(null); // Current Telegram pairing request

  const esRef = useRef(null);
  const globalInterceptorEsRef = useRef(null); // For global events like pairing requests
  const interceptorEsRef = useRef(null);
  const eventsEsRef = useRef(null);
  const currentMessageRef = useRef(null);
  const currentUsageRef = useRef(null);
  const activeToolCallsRef = useRef(new Map());
  const currentSessionIdRef = useRef(null); // Ref to access current session ID in event listeners
  const handledRequestIdsRef = useRef(new Set()); // Track handled permission/question request IDs to prevent duplicates

  useEffect(() => () => {
    esRef.current?.close();
    interceptorEsRef.current?.close();
    eventsEsRef.current?.close();
    globalInterceptorEsRef.current?.close();
  }, []);

  // Handle hash route for opening scrapbook modal
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#scrapbook') {
        window.dispatchEvent(new CustomEvent('openScrapbook'));
      }
    };

    // Check on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Check if configuration exists on startup
  useEffect(() => {
    const checkConfiguration = async () => {
      try {
        const response = await fetch('/api/configuration');
        if (response.status === 404) {
          // No configuration exists, show onboarding
          setShowConfigurationRequired(true);
        } else if (response.ok) {
          // Configuration exists, show main app
          setShowConfigurationRequired(false);
        } else {
          // Other error, show onboarding
          setShowConfigurationRequired(true);
        }
      } catch (err) {
        // Network error (backend not running) - also show onboarding
        console.error('Failed to check configuration:', err);
        setShowConfigurationRequired(true);
      }
    };

    checkConfiguration();
  }, []);

  // Keep currentSessionIdRef in sync with state for use in event listeners
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Connect to global interceptors SSE stream for pairing requests (always active)
  useEffect(() => {
    // Close existing connection
    if (globalInterceptorEsRef.current) {
      globalInterceptorEsRef.current.close();
    }

    // Fetch any existing pending pairings on mount
    const fetchPendingPairings = async () => {
      try {
        const res = await fetch('/api/remote-sessions/pairing/pending');
        if (res.ok) {
          const data = await res.json();
          const pairings = data.pairings || [];
          if (pairings.length > 0) {
            // Show the first pending pairing (oldest)
            const pairing = pairings[0];
            if (!handledRequestIdsRef.current.has(pairing.id)) {
              console.log('Found existing pending pairing:', pairing);
              handledRequestIdsRef.current.add(pairing.id);
              setPendingPairing(pairing);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch pending pairings:', err);
      }
    };
    fetchPendingPairings();

    // Connect to __global__ project for pairing events
    const es = new EventSource('/api/interceptors/stream/__global__');
    globalInterceptorEsRef.current = es;

    es.addEventListener('interceptor', (e) => {
      const event = JSON.parse(e.data);

      console.log('Global interceptor event:', event.type, event.data);

      if (event.type === 'pairing_request') {
        // Handle Telegram pairing request
        const pairingId = event.data?.id;
        if (handledRequestIdsRef.current.has(pairingId)) {
          console.log('Skipping duplicate pairing request:', pairingId);
          return;
        }
        handledRequestIdsRef.current.add(pairingId);
        console.log('Pairing request received:', event.data);
        setPendingPairing(event.data);
      }
    });

    es.onerror = () => {
      console.error('Global interceptor SSE connection error');
    };

    return () => {
      es.close();
    };
  }, []); // Run once on mount

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
              usage: msg.costs,
              reasoningSteps: msg.reasoningSteps || [],
              contextName: msg.contextName,
              source: msg.source,
              sourceMetadata: msg.sourceMetadata
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

  // Connect to interceptors SSE stream with auto-reconnect
  useEffect(() => {
    if (!currentProject) return;

    let reconnectTimeout = null;
    let isCancelled = false;

    const connect = () => {
      // Close existing connection
      if (interceptorEsRef.current) {
        interceptorEsRef.current.close();
      }

      console.log(`[SSE] Connecting to /api/interceptors/stream/${currentProject}`);
      const es = new EventSource(`/api/interceptors/stream/${currentProject}`);
      interceptorEsRef.current = es;

      es.onopen = () => {
        console.log(`[SSE] Connected to interceptor stream for ${currentProject}`);
      };

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
      } else if (event.type === 'elicitation_request') {
        // Handle MCP elicitation request - show modal for user input
        setPendingElicitation(event.data);
      } else if (event.type === 'permission_request') {
        // Handle SDK canUseTool permission request
        // Skip if already handled (ReplaySubject may replay old events)
        const permId = event.data?.id;
        if (handledRequestIdsRef.current.has(permId)) {
          console.log('Skipping duplicate permission request:', permId);
          return;
        }
        // Mark as handled IMMEDIATELY to prevent duplicates
        handledRequestIdsRef.current.add(permId);
        console.log('Permission request received:', event.data);
        setPendingPermission(event.data);
      } else if (event.type === 'ask_user_question') {
        // Handle AskUserQuestion tool request
        // Skip if already handled (ReplaySubject may replay old events)
        const questionId = event.data?.id;
        if (handledRequestIdsRef.current.has(questionId)) {
          console.log('Skipping duplicate AskUserQuestion:', questionId);
          return;
        }
        // Mark as handled IMMEDIATELY to prevent duplicates
        handledRequestIdsRef.current.add(questionId);
        console.log('AskUserQuestion received:', event.data);
        setPendingQuestion(event.data);
      } else if (event.type === 'plan_approval') {
        // Handle ExitPlanMode tool request
        // Skip if already handled (ReplaySubject may replay old events)
        const planId = event.data?.id;
        if (handledRequestIdsRef.current.has(planId)) {
          console.log('Skipping duplicate plan approval:', planId);
          return;
        }
        // Mark as handled IMMEDIATELY to prevent duplicates
        handledRequestIdsRef.current.add(planId);
        console.log('Plan approval request received:', event.data);
        setPendingPlanApproval(event.data);
      } else if (event.type === 'chat_message') {
        // Handle chat message from remote sessions (Telegram, Teams, etc.)
        const chatData = event.data;
        console.log('Remote chat message received:', chatData);

        // For remote messages (from Telegram, Teams, etc.), always display them
        // as a live feed - this lets users monitor remote conversations in real-time.
        // For non-remote messages, filter by session ID.
        const isRemoteMessage = chatData.source === 'remote';
        const sessionMatches = !currentSessionIdRef.current || currentSessionIdRef.current === chatData.sessionId;

        if (isRemoteMessage || sessionMatches) {
          const newMessage = {
            role: chatData.isAgent ? 'assistant' : 'user',
            text: chatData.message,
            timestamp: new Date(chatData.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }),
            usage: chatData.costs,
            source: chatData.source,
            sourceMetadata: chatData.sourceMetadata
          };

          setMessages(prev => [...prev, newMessage]);

          // Update hasSessions if this creates a new session
          if (!hasSessions) {
            setHasSessions(true);
          }
        }
      }
    });

      es.onerror = () => {
        console.error('Interceptor SSE connection error, will reconnect in 3s...');
        // Reconnect after a delay unless cancelled
        if (!isCancelled) {
          reconnectTimeout = setTimeout(() => {
            if (!isCancelled) {
              console.log('Reconnecting interceptor SSE...');
              connect();
            }
          }, 3000);
        }
      };
    };

    // Initial connection
    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (interceptorEsRef.current) {
        interceptorEsRef.current.close();
      }
    };
  }, [currentProject]);

  // Handle elicitation response from user
  const handleElicitationResponse = async (response) => {
    console.log('Sending elicitation response:', response);
    try {
      const res = await fetch('/mcp/elicitation/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test123'  // MCP auth token
        },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send elicitation response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending elicitation response:', err);
    } finally {
      setPendingElicitation(null);
    }
  };

  // Handle SDK permission response from user (canUseTool callback)
  const handlePermissionResponse = async (response) => {
    console.log('Sending permission response:', response);
    try {
      const res = await fetch('/api/claude/permission/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send permission response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending permission response:', err);
    } finally {
      setPendingPermission(null);
    }
  };

  // Handle AskUserQuestion response from user
  const handleQuestionResponse = async (response) => {
    console.log('Sending question response:', response);
    try {
      const res = await fetch('/api/claude/permission/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send question response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending question response:', err);
    } finally {
      setPendingQuestion(null);
    }
  };

  // Handle plan approval response from user (ExitPlanMode)
  const handlePlanApprovalResponse = async (response) => {
    console.log('Sending plan approval response:', response);
    try {
      const res = await fetch('/api/claude/permission/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send plan approval response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending plan approval response:', err);
    } finally {
      setPendingPlanApproval(null);
    }
  };

  // Handle pairing request response from admin (Telegram pairing)
  const handlePairingResponse = async (response) => {
    console.log('Sending pairing response:', response);
    try {
      const res = await fetch('/api/remote-sessions/pairing/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send pairing response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending pairing response:', err);
    } finally {
      setPendingPairing(null);
    }
  };

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

  // Connect to event-handling SSE stream for prompt executions
  useEffect(() => {
    if (!currentProject) return;

    // Close existing connection
    if (eventsEsRef.current) {
      eventsEsRef.current.close();
    }

    const es = new EventSource(`/api/events/${encodeURIComponent(currentProject)}/stream`);
    eventsEsRef.current = es;

    es.addEventListener('prompt-execution', async (e) => {
      const data = JSON.parse(e.data);
      console.log('Prompt execution event:', data);

      // When a prompt completes, reload the chat history to show the automated response
      if (data.status !== 'completed') return;

      // Use ref to get current session ID to avoid stale closure
      let sessionId = currentSessionIdRef.current;

      // If no session is currently selected, fetch the most recent session
      if (!sessionId) {
        try {
          const sessionsRes = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}`);
          const sessionsData = await sessionsRes.json();
          if (sessionsData.success && sessionsData.sessions && sessionsData.sessions.length > 0) {
            sessionId = sessionsData.sessions[0].sessionId;
            // Update the refs and state with the new session
            setCurrentSessionId(sessionId);
            setSessionId(sessionId);
            console.log('No current session, loaded most recent:', sessionId);
          }
        } catch (err) {
          console.error('Failed to fetch sessions:', err);
        }
      }

      if (sessionId) {
        try {
          // Add a small delay to ensure the message is persisted
          await new Promise(resolve => setTimeout(resolve, 500));

          const historyRes = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}/${sessionId}/history`);
          const historyData = await historyRes.json();
          const chatMessages = historyData?.messages || [];

          // Load assistant greeting
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
              usage: msg.costs,
              reasoningSteps: msg.reasoningSteps || [],
              contextName: msg.contextName,
              source: msg.source,
              sourceMetadata: msg.sourceMetadata
            });
          });

          setMessages(loadedMessages);
          setHasSessions(true);
          console.log('Chat history reloaded after prompt execution');
        } catch (err) {
          console.error('Failed to reload chat history:', err);
        }
      } else {
        console.log('No session available for prompt execution refresh');
      }
    });

    // Listen for chat-refresh events (triggered after automated prompt execution)
    es.addEventListener('chat-refresh', async (e) => {
      const data = JSON.parse(e.data);
      console.log('Chat refresh event:', data);

      // Reload chat history when notified
      // Use ref to get current session ID to avoid stale closure
      let sessionId = currentSessionIdRef.current;

      // If no session is currently selected, fetch the most recent session
      if (!sessionId) {
        try {
          const sessionsRes = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}`);
          const sessionsData = await sessionsRes.json();
          if (sessionsData.success && sessionsData.sessions && sessionsData.sessions.length > 0) {
            sessionId = sessionsData.sessions[0].sessionId;
            // Update the refs and state with the new session
            setCurrentSessionId(sessionId);
            setSessionId(sessionId);
            console.log('No current session, loaded most recent:', sessionId);
          }
        } catch (err) {
          console.error('Failed to fetch sessions:', err);
        }
      }

      if (sessionId) {
        try {
          // Add a small delay to ensure the message is persisted
          await new Promise(resolve => setTimeout(resolve, 500));

          const historyRes = await fetch(`/api/sessions/${encodeURIComponent(currentProject)}/${sessionId}/history`);
          const historyData = await historyRes.json();
          const chatMessages = historyData?.messages || [];

          // Load assistant greeting
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
              usage: msg.costs,
              reasoningSteps: msg.reasoningSteps || [],
              contextName: msg.contextName,
              source: msg.source,
              sourceMetadata: msg.sourceMetadata
            });
          });

          setMessages(loadedMessages);
          setHasSessions(true);
          console.log('Chat history reloaded after chat-refresh event');
        } catch (err) {
          console.error('Failed to reload chat history:', err);
        }
      } else {
        console.log('No session available for chat refresh');
      }
    });

    es.onerror = () => {
      console.error('Events SSE connection error');
    };

    return () => {
      es.close();
    };
  }, [currentProject]); // Removed currentSessionId from deps - using ref instead

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
              usage: msg.costs,
              reasoningSteps: msg.reasoningSteps || [],
              contextName: msg.contextName,
              source: msg.source,
              sourceMetadata: msg.sourceMetadata
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

  // Handle plan approval (ExitPlanMode)
  const handlePlanApprove = async (toolId) => {
    console.log('Plan approved:', toolId);
    setPlanApprovalState(prev => ({ ...prev, [toolId]: 'approved' }));

    // Switch to work mode to execute the plan
    setMode('work');

    // Send a continuation message to execute the plan
    // The assistant will continue from where it left off
    setTimeout(() => {
      handleSendMessage('Please proceed with executing the plan.');
    }, 500);
  };

  const handlePlanReject = async (toolId) => {
    console.log('Plan rejected:', toolId);
    setPlanApprovalState(prev => ({ ...prev, [toolId]: 'rejected' }));
    // User can provide feedback in their next message
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

    // Track accumulated text before line breaks
    let textBuffer = '';
    let lastChunkTime = Date.now();

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
      const chunkTime = Date.now();

      // Update last chunk time immediately
      lastChunkTime = chunkTime;

      // Trim leading linebreaks only if this is the first chunk
      const textToAdd = currentMessageRef.current.text === '' ? chunk.trimStart() : chunk;
      // Don't add extra line breaks - the chunk already contains proper formatting
      currentMessageRef.current.text += textToAdd;

      // Accumulate text in buffer
      textBuffer += chunk;

      // Check if buffer contains double line breaks (paragraph separators)
      // Split on \n\n but capture the delimiter to preserve it
      const parts = textBuffer.split(/(\n\n+)/);

      // If we have paragraph breaks (more than one part after split)
      if (parts.length > 1) {
        // Combine text with its following newlines to form complete segments
        // e.g., ["text1", "\n\n", "text2", "\n\n", "text3"] -> ["text1\n\n", "text2\n\n"] with "text3" remaining
        let currentContent = '';
        const segments = [];

        for (let i = 0; i < parts.length - 1; i++) {
          currentContent += parts[i];
          // If next part is a newline sequence, include it and flush the segment
          if (i + 1 < parts.length - 1 && /^\n\n+$/.test(parts[i + 1])) {
            currentContent += parts[i + 1];
            if (currentContent.trim()) {
              segments.push(currentContent);
            }
            currentContent = '';
            i++; // Skip the newline part since we already added it
          }
        }

        // Add remaining content to segments if it ends with newlines
        if (currentContent.trim()) {
          segments.push(currentContent);
        }

        // Add all complete segments as text chunks
        segments.forEach((segment, idx) => {
          const textChunk = {
            id: `text_${chunkTime}_${idx}`,
            type: 'text_chunk',
            content: segment,
            timestamp: chunkTime
          };
          setStructuredMessages(prev => [...prev, textChunk]);
        });

        // Keep the last incomplete part in the buffer
        textBuffer = parts[parts.length - 1];
      }

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

    es.addEventListener('telemetry', (e) => {
      const data = JSON.parse(e.data);
      // Store spanId with the current assistant message for feedback
      if (data.span_id) {
        currentMessageRef.current.spanId = data.span_id;
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...currentMessageRef.current,
              spanId: data.span_id
            };
          }
          return newMessages;
        });
      }
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

    es.addEventListener('api_error', (e) => {
      const { message, fullError, timestamp } = JSON.parse(e.data);
      console.error('API Error:', message, fullError);
      setStructuredMessages(prev => [...prev, {
        id: `api_error_${Date.now()}`,
        type: 'api_error',
        message,
        fullError,
        timestamp
      }]);
    });

    const stop = () => {
      es.close();
      setStreaming(false);
      setCurrentProcessId(null);

      // Flush any remaining text buffer
      if (textBuffer.trim()) {
        const timestamp = Date.now();
        setStructuredMessages(prev => [...prev, {
          id: `text_${timestamp}_final`,
          type: 'text_chunk',
          content: textBuffer,
          timestamp: lastChunkTime
        }]);
        textBuffer = '';
      }

      // Mark all structured messages as complete
      const finalStructuredMessages = [];
      setStructuredMessages(prev => {
        const updated = prev.map(msg =>
          msg.status === 'running' ? { ...msg, status: 'complete' } : msg
        );
        finalStructuredMessages.push(...updated);
        return updated;
      });

      // Finalize message with reasoning steps attached
      if (currentMessageRef.current.text) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...currentMessageRef.current,
              usage: currentUsageRef.current,
              reasoningSteps: finalStructuredMessages.length > 0 ? finalStructuredMessages : undefined
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
      const receivedTime = Date.now(); // Timestamp when we receive the event
      console.log('Tool event:', { tool: data.toolName, status: data.status, timestamp: receivedTime, callId: data.callId });

      // Flush any buffered text before the tool call
      // Use a timestamp slightly before the tool call to ensure proper ordering
      if (textBuffer.trim() && data.status === 'running') {
        const bufferContent = textBuffer;
        const bufferTimestamp = receivedTime - 1; // 1ms before tool call
        console.log('Flushing text buffer before tool call:', { timestamp: bufferTimestamp, preview: bufferContent.substring(0, 50) });
        setStructuredMessages(prev => [...prev, {
          id: `text_${receivedTime}_before_tool`,
          type: 'text_chunk',
          content: bufferContent,
          timestamp: bufferTimestamp
        }]);
        textBuffer = '';
      }

      setStructuredMessages(prev => {
        const existing = prev.find(msg => msg.id === data.callId);
        if (existing) {
          // Update existing tool call with new status
          console.log('Updating existing tool call:', { callId: data.callId, status: data.status });
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
          // Add new tool call with timestamp from when we received it
          // Note: TodoWrite entries are now kept in chronological order (no longer deduplicated)
          console.log('Adding new tool call:', { callId: data.callId, tool: data.toolName, timestamp: receivedTime });
          return [...prev, {
            id: data.callId,
            type: 'tool_call',
            toolName: data.toolName,
            args: data.input,
            status: data.status,
            result: data.result,
            timestamp: receivedTime
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
          usage: msg.costs,
          reasoningSteps: msg.reasoningSteps || [],
          contextName: msg.contextName,
          source: msg.source,
          sourceMetadata: msg.sourceMetadata
        });
      });

      setMessages(loadedMessages);
      setStructuredMessages([]);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  };

  // Save open tabs to workbench.json when files change
  useEffect(() => {
    if (!currentProject || files.length === 0) return;

    const saveWorkbench = async () => {
      try {
        const workbenchConfig = {
          openTabs: files.map(f => f.path)
        };
        await fetch(`/api/workspace/${encodeURIComponent(currentProject)}/workbench`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workbenchConfig)
        });
      } catch (err) {
        console.error('Failed to save workbench config:', err);
      }
    };

    // Debounce the save operation to avoid too many writes
    const timeoutId = setTimeout(saveWorkbench, 500);
    return () => clearTimeout(timeoutId);
  }, [currentProject, files]);

  // Restore open tabs from workbench.json when project loads
  const restoreWorkbench = async (projectName) => {
    try {
      const response = await fetch(`/api/workspace/${encodeURIComponent(projectName)}/workbench`);
      if (response.ok) {
        const config = await response.json();
        if (config && config.openTabs && Array.isArray(config.openTabs)) {
          // Restore tabs by simulating file preview requests
          // We do this in sequence to maintain tab order
          for (const filePath of config.openTabs) {
            // Use filePreviewHandler to trigger the preview
            // This will be tolerant - if file doesn't exist, it will fail silently
            try {
              const { filePreviewHandler } = await import('./services/FilePreviewHandler');
              filePreviewHandler.handlePreview(filePath, projectName);
            } catch (err) {
              console.warn(`Failed to restore tab for ${filePath}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore workbench config:', err);
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

    // Restore workbench after a short delay to ensure project is loaded
    setTimeout(() => {
      restoreWorkbench(newProject);
    }, 1000);
  };

  const handleOnboardingComplete = (projectName) => {
    // Onboarding is complete, hide it and load the new project
    setShowConfigurationRequired(false);
    setProject(projectName);
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Show login dialog if not authenticated
  if (!isAuthenticated) {
    return <LoginDialog onSuccess={() => {}} />;
  }

  // Show loading while checking configuration
  if (showConfigurationRequired === null) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Show onboarding wizard if configuration is required
  if (showConfigurationRequired) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

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
            showConfigurationRequired={showConfigurationRequired}
            onConfigurationSaved={() => setShowConfigurationRequired(false)}
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
            left={<ChatPane messages={messages} structuredMessages={structuredMessages} onSendMessage={handleSendMessage} onAbort={handleAbort} streaming={streaming} mode={mode} onModeChange={setMode} aiModel={aiModel} onAiModelChange={setAiModel} showBackgroundInfo={showBackgroundInfo} onShowBackgroundInfoChange={handleShowBackgroundInfoChange} projectExists={projectExists} projectName={currentProject} onSessionChange={handleSessionChange} hasActiveSession={sessionId !== ''} hasSessions={hasSessions} onShowWelcomePage={() => setShowWelcomePage(true)} uiConfig={uiConfig} planApprovalState={planApprovalState} onPlanApprove={handlePlanApprove} onPlanReject={handlePlanReject} />}
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

      {/* MCP Elicitation Modal */}
      <ElicitationModal
        open={!!pendingElicitation}
        elicitation={pendingElicitation}
        onRespond={handleElicitationResponse}
        onClose={() => setPendingElicitation(null)}
      />

      {/* SDK Permission Modal (canUseTool callback) */}
      <PermissionModal
        open={!!pendingPermission}
        permission={pendingPermission}
        onRespond={handlePermissionResponse}
        onClose={() => setPendingPermission(null)}
      />

      {/* AskUserQuestion Modal */}
      <AskUserQuestionModal
        open={!!pendingQuestion}
        question={pendingQuestion}
        onRespond={handleQuestionResponse}
        onClose={() => setPendingQuestion(null)}
      />

      {/* Plan Approval Modal (ExitPlanMode) */}
      <PlanApprovalModal
        open={!!pendingPlanApproval}
        plan={pendingPlanApproval}
        onRespond={handlePlanApprovalResponse}
        onClose={() => setPendingPlanApproval(null)}
        currentProject={currentProject}
      />

      {/* Telegram Pairing Request Modal */}
      <PairingRequestModal
        open={!!pendingPairing}
        pairing={pendingPairing}
        onRespond={handlePairingResponse}
        onClose={() => setPendingPairing(null)}
      />
    </Box>
  );
}
