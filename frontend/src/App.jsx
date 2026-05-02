import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton, Modal, TextField, Tooltip, Snackbar, Alert, CircularProgress, Drawer } from '@mui/material';
import { useTranslation } from 'react-i18next';
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
import HITLApprovalModal from './components/HITLApprovalModal';
import LoginDialog from './components/LoginDialog';
import ServiceHealthGate from './components/ServiceHealthGate';
import { TbCalendarTime, TbPresentation, TbWorld } from 'react-icons/tb';
import { IoInformationCircle, IoSunnyOutline, IoMoonOutline } from "react-icons/io5";
import { useProject } from './contexts/ProjectContext.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { useThemeMode } from './contexts/ThemeContext.jsx';
import { claudeEventBus, ClaudeEvents } from './eventBus';
import { buildExtensionMap, getViewerForFile } from './components/viewerRegistry.jsx';
import Onboarding from './components/Onboarding';
import TechnologyRadarPage from './pages/TechnologyRadarPage';
import { apiFetch } from './services/api';
import { filePreviewHandler } from './services/FilePreviewHandler';
import useTabStore from './stores/useTabStore';
import useMultiplexSSE from './hooks/useMultiplexSSE';
import useStreamingSessions from './hooks/useStreamingSessions';
import { MuxSSEProvider } from './contexts/MuxSSEContext';
import { useUxMode } from './contexts/UxModeContext.jsx';
import MinimalisticSidebar from './components/MinimalisticSidebar';
import KeyboardShortcutsOverlay from './components/KeyboardShortcutsOverlay';
import ServiceControlDrawer from './components/ServiceControlDrawer';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';

export default function App() {
  const { t, i18n } = useTranslation();
  const { currentProject, projectExists, setProject, loading: projectLoading } = useProject();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const { mode: themeMode, toggleMode } = useThemeMode();
  const { isMinimalistic, uxType, toggleUxMode } = useUxMode();

  // Check required services (secrets-manager, oauth-server) before login
  const [servicesReady, setServicesReady] = useState(null); // null=checking, true/false
  useEffect(() => {
    fetch('/api/process-manager/health/required')
      .then(r => r.json())
      .then(data => setServicesReady(data.ok))
      .catch(() => setServicesReady(false));
  }, []);

  // Fetch agent name and agent class from personality config
  const [agentName, setAgentName] = useState('Etienne');
  const [agentClass, setAgentClass] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    document.title = 'Etienne: AI Coworker';
    apiFetch('/api/persona-manager/personality')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.name) {
          setAgentName(data.name);
          document.title = `${data.name}: AI Coworker`;
        }
        if (data?.agentClass) {
          setAgentClass(data.agentClass);
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const formatGreeting = (text) => agentName ? `**${agentName}**: ${text}` : text;

  const streamSessions = useStreamingSessions();
  const [messages, setMessages] = useState([]);
  const [structuredMessages, setStructuredMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const { getTabPaths, setTabPaths } = useTabStore();
  const [sessionId, setSessionId] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null); // Track which session we're viewing
  const [hasSessions, setHasSessions] = useState(false); // Track if sessions exist
  const [mode, setMode] = useState('work'); // 'plan' or 'work'
  const [aiModel, setAiModel] = useState('anthropic'); // 'anthropic' or 'openai'
  const [budgetSettings, setBudgetSettings] = useState({ enabled: false, limit: 0 });
  const [hasTasks, setHasTasks] = useState(false);
  const [hasPublicWebsite, setHasPublicWebsite] = useState(false);
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
  const [hashRoute, setHashRoute] = useState(window.location.hash.slice(1) || '');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [langToast, setLangToast] = useState({ open: false, language: '' });
  const [uxToast, setUxToast] = useState({ open: false, mode: '' });
  const [shortcutsOverlayOpen, setShortcutsOverlayOpen] = useState(false);
  const [serviceControlOpen, setServiceControlOpen] = useState(false);
  const [knowledgeToast, setKnowledgeToast] = useState({ open: false, message: '' });
  const [activeContextId, setActiveContextId] = useState(null);
  const [contexts, setContexts] = useState([]);
  const [contextManagerOpen, setContextManagerOpen] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [showConfigurationRequired, setShowConfigurationRequired] = useState(null); // null = checking, true = show onboarding, false = show app
  const [pendingElicitation, setPendingElicitation] = useState(null); // Current elicitation request from MCP tool
  const [pendingPermission, setPendingPermission] = useState(null); // Current permission request from SDK canUseTool
  const [pendingQuestion, setPendingQuestion] = useState(null); // Current AskUserQuestion request
  const [pendingPlanApproval, setPendingPlanApproval] = useState(null); // Current ExitPlanMode request
  const [pendingHITL, setPendingHITL] = useState(null); // Current HITL Protocol verification request
  const [pendingPairing, setPendingPairing] = useState(null); // Current Telegram pairing request
  const [codingAgent, setCodingAgent] = useState('anthropic'); // 'anthropic' or 'openai' — from CODING_AGENT env var
  const [previewersConfig, setPreviewersConfig] = useState([]);

  const esRef = useRef(null);
  const mux = useMultiplexSSE(currentProject);
  const currentMessageRef = useRef(null);
  const currentUsageRef = useRef(null);
  const activeToolCallsRef = useRef(new Map());
  const currentSessionIdRef = useRef(null); // Ref to access current session ID in event listeners
  const handledRequestIdsRef = useRef(new Set()); // Track handled permission/question request IDs to prevent duplicates

  // Shared viewer state: viewers (e.g. budget donut chart) report selection state here.
  // Attached to chat submissions so the LLM knows what's selected in open previewers.
  const viewerStatesRef = useRef({});
  const updateViewerState = useCallback((filePath, state) => {
    if (state && Object.keys(state).length > 0) {
      viewerStatesRef.current[filePath] = state;
    } else {
      delete viewerStatesRef.current[filePath];
    }
  }, []);
  const getViewerStates = useCallback(() => {
    return Object.entries(viewerStatesRef.current)
      .filter(([_, s]) => s && Object.keys(s).length > 0)
      .map(([path, state]) => ({ path, ...state }));
  }, []);

  // Derived streaming state: true when the currently viewed session has an active stream.
  // Also matches 'pending_*' keys (stream registered but sessionId not yet known from backend).
  const streaming = streamSessions.activeSessionIds.includes(sessionId)
    || streamSessions.activeSessionIds.some(id => id.startsWith('pending_'));

  useEffect(() => () => {
    esRef.current?.close();
    streamSessions.closeAll();
  }, []);

  // Handle hash routes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || '';
      setHashRoute(hash);
      if (hash === 'scrapbook') {
        window.dispatchEvent(new CustomEvent('openScrapbook'));
      }
    };

    // Check on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Centralized keyboard shortcuts
  const SUPPORTED_LANGS = useMemo(() => ['en', 'de', 'it', 'zh'], []);
  const LANG_LABELS = useMemo(() => ({ en: 'English', de: 'Deutsch', it: 'Italiano', zh: '中文' }), []);
  const UX_LABELS = useMemo(() => ({ verbose: 'Verbose', minimalistic: 'Minimalistic' }), []);

  const keyboardShortcuts = useMemo(() => ({
    'ctrl+l': {
      handler: () => {
        const currentIdx = SUPPORTED_LANGS.indexOf(i18n.language);
        const nextIdx = (currentIdx + 1) % SUPPORTED_LANGS.length;
        const nextLang = SUPPORTED_LANGS[nextIdx];
        localStorage.setItem('i18nLanguageOverride', nextLang);
        i18n.changeLanguage(nextLang);
        setLangToast({ open: true, language: LANG_LABELS[nextLang] || nextLang });
      },
      description: t('shortcuts.cycleLanguage', 'Cycle UI language'),
      category: t('shortcuts.categoryDisplay', 'Display'),
    },
    'ctrl+u': {
      handler: () => {
        toggleUxMode();
        const nextMode = uxType === 'verbose' ? 'minimalistic' : 'verbose';
        setUxToast({ open: true, mode: UX_LABELS[nextMode] || nextMode });
      },
      description: t('shortcuts.toggleUxMode', 'Toggle UX mode'),
      category: t('shortcuts.categoryDisplay', 'Display'),
    },
    'ctrl+n': {
      handler: () => handleSessionChange(null),
      description: t('shortcuts.newChat', 'New chat'),
      category: t('shortcuts.categoryChat', 'Chat'),
    },
    'ctrl+/': {
      handler: () => {
        const input = document.querySelector('[data-chat-input] textarea, [data-chat-input] input');
        if (input) input.focus();
      },
      description: t('shortcuts.focusInput', 'Focus chat input'),
      category: t('shortcuts.categoryChat', 'Chat'),
    },
    'ctrl+s': {
      handler: () => setServiceControlOpen(prev => !prev),
      description: t('shortcuts.serviceControl', 'Service control'),
      category: t('shortcuts.categoryNavigation', 'Navigation'),
    },
    'ctrl+shift+s': {
      handler: () => setSidebarCollapsed(prev => !prev),
      description: t('shortcuts.toggleSidebar', 'Toggle sidebar'),
      category: t('shortcuts.categoryNavigation', 'Navigation'),
    },
    '?': {
      handler: () => setShortcutsOverlayOpen(prev => !prev),
      description: t('shortcuts.showShortcuts', 'Show keyboard shortcuts'),
      category: t('shortcuts.categoryNavigation', 'Navigation'),
    },
  }), [i18n, uxType, toggleUxMode, t, SUPPORTED_LANGS, LANG_LABELS, UX_LABELS]);

  useKeyboardShortcuts(keyboardShortcuts);

  // Register minimal service worker for desktop notifications
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/notification-sw.js').catch(() => {});
    }
  }, []);

  // Check if configuration exists once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkConfiguration = async () => {
      try {
        const response = await apiFetch('/api/configuration');
        if (response.status === 404) {
          // No configuration exists, show onboarding
          setShowConfigurationRequired(true);
        } else if (response.ok) {
          // Configuration exists, show main app
          setShowConfigurationRequired(false);
          // Read CODING_AGENT setting for A/B agent selection
          try {
            const config = await response.json();
            if (config.CODING_AGENT) {
              setCodingAgent(config.CODING_AGENT);
            }
          } catch { /* ignore parse errors */ }
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
  }, [isAuthenticated]);

  // Fetch registered previewers configuration on startup
  useEffect(() => {
    const fetchPreviewers = async () => {
      try {
        const response = await apiFetch('/api/previewers/configuration');
        if (response.ok) {
          const data = await response.json();
          setPreviewersConfig(data.previewers || []);
        }
      } catch (err) {
        console.error('Failed to fetch previewers config:', err);
      }
    };
    fetchPreviewers();
  }, []);

  // When Codex (OpenAI) is active, force mode to 'work' — plan mode is not supported
  useEffect(() => {
    if (codingAgent === 'openai') {
      setMode('work');
    }
  }, [codingAgent]);

  // Keep currentSessionIdRef in sync with state for use in event listeners
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Fetch any existing pending pairings on mount
  useEffect(() => {
    const fetchPendingPairings = async () => {
      try {
        const res = await apiFetch('/api/remote-sessions/pairing/pending');
        if (res.ok) {
          const data = await res.json();
          const pairings = data.pairings || [];
          if (pairings.length > 0) {
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
  }, []);

  // Global interceptor events (pairing requests) via multiplexed SSE
  useEffect(() => {
    const handler = (event) => {
      console.log('Global interceptor event:', event.type, event.data);
      if (event.type === 'pairing_request') {
        const pairingId = event.data?.id;
        if (handledRequestIdsRef.current.has(pairingId)) {
          console.log('Skipping duplicate pairing request:', pairingId);
          return;
        }
        handledRequestIdsRef.current.add(pairingId);
        console.log('Pairing request received:', event.data);
        setPendingPairing(event.data);
      }
    };
    mux.on('interceptor-global', '*', handler);
    return () => mux.off('interceptor-global', '*', handler);
  }, [mux]);

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
      const response = await apiFetch(`/api/workspace/${encodeURIComponent(currentProject)}/tags`);
      const data = await response.json();
      setAllTags(data || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const loadContexts = async () => {
    try {
      const response = await apiFetch(`/api/workspace/${encodeURIComponent(currentProject)}/contexts`);
      const data = await response.json();
      setContexts(data || []);
    } catch (err) {
      console.error('Failed to load contexts:', err);
    }
  };

  const loadActiveContext = async () => {
    try {
      const response = await apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}/${sessionId}/context`);
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
        const sessionsRes = await apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}`);
        const sessionsData = await sessionsRes.json();
        const hasExistingSessions = sessionsData.success && sessionsData.sessions && sessionsData.sessions.length > 0;
        setHasSessions(hasExistingSessions);

        // Load assistant greeting
        const assistantRes = await apiFetch('/api/claude/assistant', {
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
          const historyRes = await apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}/${mostRecentSession.sessionId}/history`);
          const historyData = await historyRes.json();
          const chatMessages = historyData?.messages || [];

          const loadedMessages = [];
          if (greeting) {
            loadedMessages.push({
              role: 'assistant',
              text: formatGreeting(greeting),
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
              text: formatGreeting(greeting),
              timestamp: formatTime()
            });
          }
          setMessages(loadedMessages);
        }

        // Load UI configuration with session info
        const uiResponse = await apiFetch(`/api/workspace/${currentProject}/user-interface`);
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
        const budgetRes = await apiFetch(`/api/budget-monitoring/${currentProject}/settings`);
        const budgetData = await budgetRes.json();
        setBudgetSettings(budgetData || { enabled: false, limit: 0 });

        // Check if project has scheduled tasks
        const tasksRes = await apiFetch(`/api/scheduler/${currentProject}/tasks`);
        const tasksData = await tasksRes.json();
        setHasTasks((tasksData.tasks || []).length > 0);

        // Check if public website is available (webserver running on :4000 + /web subdir exists)
        try {
          const [webserverRes, filesRes] = await Promise.all([
            apiFetch('/api/process-manager/webserver'),
            apiFetch(`/api/claude/listFiles?project_dir=${encodeURIComponent(currentProject)}&sub_dir=.`),
          ]);
          const webserverData = await webserverRes.json();
          const filesData = await filesRes.json();
          const hasWebDir = Array.isArray(filesData) && filesData.some(f => f.name === 'web' && f.isDir);
          setHasPublicWebsite(webserverData.status === 'running' && hasWebDir);
        } catch {
          setHasPublicWebsite(false);
        }
      } catch (error) {
        console.error('Failed to initialize project:', error);
        setUiConfig(null);
        setShowWelcomePage(false);
      }
    };

    initializeProject();
  }, [currentProject]);

  // Project interceptor events via multiplexed SSE
  useEffect(() => {
    if (!currentProject) return;

    const handler = (event) => {
      // Log ALL interceptor events for debugging
      console.log('Interceptor event:', event.type, event.data);

      // Handle hooks (PreToolUse, PostToolUse)
      if (event.type === 'hook') {
        const hookData = event.data;
        const eventType = hookData.event_type;

        console.log('Hook event:', eventType, hookData);

        if (eventType === 'PreToolUse') {
          console.log('PreToolUse hook received:', hookData);
        } else if (eventType === 'PostToolUse') {
          const toolName = hookData.tool_name;
          const toolInput = hookData.tool_input;

          if (!toolName) {
            console.warn('Could not find tool_name in PostToolUse hook:', hookData);
            return;
          }

          console.log('PostToolUse hook received:', hookData);

          // Dispatch claudeHook event for file operations
          const fileOperationTools = ['Edit', 'Write', 'NotebookEdit'];
          if (fileOperationTools.includes(toolName) && toolInput?.file_path) {
            const claudeHookEvent = new CustomEvent('claudeHook', {
              detail: { hook: 'PostHook', file: toolInput.file_path }
            });
            window.dispatchEvent(claudeHookEvent);
            console.log('Dispatched claudeHook for file:', toolInput.file_path);

            const filePath = toolInput.file_path;
            if (hasPreviewExtension(filePath)) {
              const relativePath = extractRelativePath(filePath);
              setTimeout(() => {
                fetchFile(relativePath, currentProject);
              }, 800);
            }
          }
        }
      } else if (event.type === 'event') {
        const eventData = event.data;
        const eventType = eventData.event_type;

        console.log('Event (not hook):', eventType, eventData);

        if (eventType === 'MemoryExtracted') {
          setStructuredMessages(prev => [...prev, {
            id: `memory_${Date.now()}`,
            type: 'memory_extracted',
            facts: eventData.facts || [],
            count: eventData.count || 0
          }]);
        }

        if (eventType === 'file_added' || eventType === 'file_changed') {
          const absolutePath = eventData.path;
          if (absolutePath) {
            const relativePath = extractRelativePath(absolutePath);
            console.log(`[mux ${eventType}] Absolute: ${absolutePath}, Relative: ${relativePath}`);

            // Dispatch claudeHook event for LiveHTMLPreview to refresh
            const claudeHookEvent = new CustomEvent('claudeHook', {
              detail: {
                hook: 'PostHook',
                file: absolutePath
              }
            });
            window.dispatchEvent(claudeHookEvent);
            console.log(`[mux ${eventType}] Dispatched claudeHook event for:`, absolutePath);

            if (hasPreviewExtension(absolutePath)) {
              fetchFile(relativePath, currentProject);
            }
          }
        }

        if (eventType === 'knowledge-acquired') {
          // Dispatch window event for KnowledgeViewer to pick up
          window.dispatchEvent(new CustomEvent('knowledgeAcquired', { detail: eventData }));
          // Show global toast so user sees confirmation regardless of active tab
          const msg = eventData.summary || `Learned from ${eventData.document || 'document'}`;
          setKnowledgeToast({ open: true, message: msg });
        }

        if (eventType === 'Notification' && eventData.message) {
          const msg = eventData.message.toLowerCase();
          if (msg.includes('permission') || msg.includes('allow') || msg.includes('grant')) {
            setStructuredMessages(prev => [...prev, {
              id: `perm_${Date.now()}`,
              type: 'permission_request',
              permissionId: `perm_${Date.now()}`,
              message: eventData.message
            }]);
          }
        }

        if (eventType === 'Stop' && eventData.reason === 'completed') {
          try {
            const notifChannels = JSON.parse(localStorage.getItem('notificationChannels') || '[]');
            if (notifChannels.includes('desktop') && 'Notification' in window && Notification.permission === 'granted') {
              const body = currentMessageRef.current.text?.substring(0, 100) || t('app.taskCompletedBody');
              if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready
                  .then(reg => reg.showNotification(t('app.taskCompleted'), { body }))
                  .catch(() => new Notification(t('app.taskCompleted'), { body }));
              } else {
                new Notification(t('app.taskCompleted'), { body });
              }
              // Track desktop notification in recent items so it appears in the sidebar
              apiFetch('/api/recent-items/notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: body, projectName: currentProject }),
              }).catch(() => {});
            }
          } catch { /* ignore */ }
        }

        // Track remote/external streaming sessions via interceptor events
        // This handles streams started by Telegram, Teams, scheduled tasks, etc.
        if (eventType === 'SessionStart' && eventData.session_id) {
          // Only register if not already tracked (local streams register via handleSendMessage)
          if (!streamSessions.isSessionStreaming(eventData.session_id)) {
            streamSessions.startStream(eventData.session_id, null, null);
          }
        }
        if (eventType === 'Stop' && eventData.session_id) {
          // Remove from streaming if it was a remote session (no local EventSource)
          const ctx = streamSessions.getStreamContext(eventData.session_id);
          if (ctx && !ctx.eventSource) {
            streamSessions.stopStream(eventData.session_id);
          }
        }
      } else if (event.type === 'elicitation_request') {
        setPendingElicitation(event.data);
      } else if (event.type === 'permission_request') {
        const permId = event.data?.id;
        if (handledRequestIdsRef.current.has(permId)) return;
        handledRequestIdsRef.current.add(permId);
        console.log('Permission request received:', event.data);
        setPendingPermission(event.data);
      } else if (event.type === 'ask_user_question') {
        const questionId = event.data?.id;
        if (handledRequestIdsRef.current.has(questionId)) return;
        handledRequestIdsRef.current.add(questionId);
        console.log('AskUserQuestion received:', event.data);
        setPendingQuestion(event.data);
      } else if (event.type === 'plan_approval') {
        const planId = event.data?.id;
        if (handledRequestIdsRef.current.has(planId)) return;
        handledRequestIdsRef.current.add(planId);
        console.log('Plan approval request received:', event.data);
        setPendingPlanApproval(event.data);
      } else if (event.type === 'hitl_request') {
        const hitlId = event.data?.id;
        if (handledRequestIdsRef.current.has(hitlId)) return;
        handledRequestIdsRef.current.add(hitlId);
        console.log('HITL verification request received:', event.data);
        setPendingHITL(event.data);
      } else if (event.type === 'chat_message') {
        const chatData = event.data;
        console.log('Remote chat message received:', chatData);

        const isRemoteMessage = chatData.source === 'remote';
        const sessionMatches = !currentSessionIdRef.current || currentSessionIdRef.current === chatData.sessionId;

        if (isRemoteMessage || sessionMatches) {
          const newMessage = {
            role: chatData.isAgent ? 'assistant' : 'user',
            text: chatData.message,
            timestamp: new Date(chatData.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', hour12: false
            }),
            usage: chatData.costs,
            source: chatData.source,
            sourceMetadata: chatData.sourceMetadata
          };
          setMessages(prev => [...prev, newMessage]);
          if (!hasSessions) setHasSessions(true);
        }
      }
    };

    mux.on('interceptor', '*', handler);
    return () => mux.off('interceptor', '*', handler);
  }, [currentProject, mux]);

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
      const res = await apiFetch('/api/claude/permission/respond', {
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
      const res = await apiFetch('/api/claude/permission/respond', {
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
      const res = await apiFetch('/api/claude/permission/respond', {
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

  // Handle HITL Protocol verification response from user
  const handleHITLResponse = async (response) => {
    console.log('Sending HITL response:', response);
    try {
      const res = await apiFetch('/api/hitl/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send HITL response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending HITL response:', err);
    } finally {
      setPendingHITL(null);
    }
  };

  // Handle pairing request response from admin (Telegram pairing)
  const handlePairingResponse = async (response) => {
    console.log('Sending pairing response:', response);
    try {
      const res = await apiFetch('/api/remote-sessions/pairing/respond', {
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

  // Listen for deep research events via multiplexed SSE
  useEffect(() => {
    if (!currentProject) return;

    const handler = (data, type) => {
      if (type === 'Research.started') {
        console.log('Research started:', data);
        const file = { path: data.outputFile, content: '', type: 'research' };
        setFiles(prevFiles => {
          const exists = prevFiles.some(f => f.path === data.outputFile);
          return exists ? prevFiles : [...prevFiles, file];
        });
      } else if (type === 'Research.completed') {
        console.log('Research completed:', data);
      } else if (type === 'Research.error') {
        console.error('Research error:', data);
      }
    };

    mux.on('research', '*', handler);
    return () => mux.off('research', '*', handler);
  }, [currentProject, mux]);

  // Event handling events (prompt-execution, chat-refresh) via multiplexed SSE
  useEffect(() => {
    if (!currentProject) return;

    const reloadChatHistory = async (source) => {
      let sessionId = currentSessionIdRef.current;

      if (!sessionId) {
        try {
          const sessionsRes = await apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}`);
          const sessionsData = await sessionsRes.json();
          if (sessionsData.success && sessionsData.sessions && sessionsData.sessions.length > 0) {
            sessionId = sessionsData.sessions[0].sessionId;
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
          await new Promise(resolve => setTimeout(resolve, 500));

          const historyRes = await apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}/${sessionId}/history`);
          const historyData = await historyRes.json();
          const chatMessages = historyData?.messages || [];

          const assistantRes = await apiFetch('/api/claude/assistant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectName: currentProject })
          });
          const assistantData = await assistantRes.json();
          const greeting = assistantData?.assistant?.greeting;

          const loadedMessages = [];
          if (greeting) {
            loadedMessages.push({ role: 'assistant', text: formatGreeting(greeting), timestamp: formatTime() });
          }

          chatMessages.forEach(msg => {
            loadedMessages.push({
              role: msg.isAgent ? 'assistant' : 'user',
              text: msg.message,
              timestamp: new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
              usage: msg.costs,
              reasoningSteps: msg.reasoningSteps || [],
              contextName: msg.contextName,
              source: msg.source,
              sourceMetadata: msg.sourceMetadata
            });
          });

          setMessages(loadedMessages);
          setHasSessions(true);
          console.log(`Chat history reloaded after ${source}`);
        } catch (err) {
          console.error('Failed to reload chat history:', err);
        }
      }
    };

    const promptHandler = (data) => {
      console.log('Prompt execution event:', data);
      if (data.status === 'completed') reloadChatHistory('prompt execution');
    };

    const chatRefreshHandler = (data) => {
      console.log('Chat refresh event:', data);
      reloadChatHistory('chat-refresh event');
    };

    mux.on('events', 'prompt-execution', promptHandler);
    mux.on('events', 'chat-refresh', chatRefreshHandler);
    return () => {
      mux.off('events', 'prompt-execution', promptHandler);
      mux.off('events', 'chat-refresh', chatRefreshHandler);
    };
  }, [currentProject, mux]);

  // Check if sessions exist for the current project
  useEffect(() => {
    if (!currentProject) return;

    const checkSessions = async () => {
      try {
        const response = await apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}`);
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
        const response = await apiFetch(`/api/budget-monitoring/${currentProject}/settings`);
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
      const response = await apiFetch(`/api/scheduler/${currentProject}/tasks`);
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
        const response = await apiFetch(`/api/interceptors/chat/${currentProject}`);
        const data = await response.json();

        if (data.needsRefresh) {
          console.log('Chat refresh triggered by scheduled task');
          // Reload chat history
          const historyRes = await apiFetch('/api/claude/chat/history', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectName: currentProject })
          });
          const historyData = await historyRes.json();
          const chatMessages = historyData?.messages || [];

          // Get assistant greeting
          const assistantRes = await apiFetch('/api/claude/assistant', {
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
              text: formatGreeting(greeting),
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

  // Build dynamic auto-preview extension map from previewers config + project overrides
  const autoPreviewExtensionMap = useMemo(() => {
    return buildExtensionMap(
      previewersConfig,
      uiConfig?.autoFilePreviewExtensions || []
    );
  }, [previewersConfig, uiConfig?.autoFilePreviewExtensions]);

  // Keep the FilePreviewHandler singleton in sync with the current extension map
  useEffect(() => {
    filePreviewHandler.setExtensionMap(autoPreviewExtensionMap);
  }, [autoPreviewExtensionMap]);

  // Check if a file path ends with a supported preview extension
  const hasPreviewExtension = (filePath) => {
    if (!filePath) return false;
    return getViewerForFile(filePath, autoPreviewExtensionMap) !== null;
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
        const r = await apiFetch(q.toString());

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
      if (data.action && data.action.endsWith('-preview') && data.filePath && data.projectName) {
        // For viewers that handle their own data loading (e.g. RequirementsViewer, ArtifactsForSession),
        // or service viewers (paths starting with #, e.g. #imap/inbox),
        // add a placeholder entry immediately so the tab opens and the viewer mounts,
        // even if the file doesn't exist on disk yet.
        if (data.filePath.endsWith('.requirements.json') || data.filePath.endsWith('.artifacts.md') || data.filePath.startsWith('#')) {
          setFiles((arr) => {
            // For service viewers, replace existing entry with same service prefix to update the path
            if (data.filePath.startsWith('#')) {
              const servicePrefix = '#' + data.filePath.substring(1).split('/')[0];
              const filtered = arr.filter(x => !x.path.startsWith(servicePrefix));
              return filtered.concat([{ path: data.filePath, content: '' }]);
            }
            if (arr.some(x => x.path === data.filePath)) return arr;
            return arr.concat([{ path: data.filePath, content: '' }]);
          });
          return;
        }
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

    // Per-stream message object — captured in the SSE handler closures so each
    // stream accumulates into its own object even when running in the background.
    const streamMsg = { role: 'assistant', text: '', timestamp: formatTime() };
    currentMessageRef.current = streamMsg; // sync shared ref while this session is viewed
    currentUsageRef.current = null;
    activeToolCallsRef.current.clear(); // Clear any pending tool calls
    // Persist current structured messages to the last assistant message, then clear
    setStructuredMessages(prev => {
      if (prev.length > 0) {
        setMessages(msgPrev => {
          const newMessages = [...msgPrev];
          const lastIdx = newMessages.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1);
          if (lastIdx >= 0 && !newMessages[lastIdx].reasoningSteps) {
            newMessages[lastIdx] = { ...newMessages[lastIdx], reasoningSteps: prev };
          }
          return newMessages;
        });
      }
      return []; // Clear structured messages for the new streaming session
    });

    // Ensure project file exists
    await apiFetch(`/api/claude/addFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_dir: currentProject, file_name: codingAgent === 'anthropic' ? 'CLAUDE.md' : 'AGENTS.md', file_content: `# ${currentProject}\n` })
    });

    // Stream prompt
    const url = new URL(`/api/claude/streamPrompt/sdk`, window.location.origin);
    url.searchParams.set('project_dir', currentProject);
    url.searchParams.set('prompt', messageText);
    url.searchParams.set('agentMode', mode);
    url.searchParams.set('aiModel', aiModel);

    // Add memory enabled parameter
    const memoryEnabled = localStorage.getItem('memoryEnabled') !== 'false';
    if (memoryEnabled) {
      url.searchParams.set('memoryEnabled', 'true');
    }

    // Add maxTurns parameter
    const maxTurns = localStorage.getItem('maxTurns');
    if (maxTurns) {
      url.searchParams.set('maxTurns', maxTurns);
    }

    // Add notification channels for server-side notifications
    try {
      const notifChannels = JSON.parse(localStorage.getItem('notificationChannels') || '[]');
      const serverChannels = notifChannels.filter(c => c !== 'desktop');
      if (serverChannels.length > 0) {
        url.searchParams.set('notificationChannels', serverChannels.join(','));
      }
      const notifEmail = localStorage.getItem('notificationEmail');
      if (serverChannels.includes('email') && notifEmail) {
        url.searchParams.set('notificationEmail', notifEmail);
      }
    } catch { /* ignore parse errors */ }

    // Attach shared viewer state (selections from open previewers)
    const viewerStates = getViewerStates();
    if (viewerStates.length > 0) {
      url.searchParams.set('viewerState', JSON.stringify(viewerStates));
    }

    const token = localStorage.getItem('auth_accessToken') || sessionStorage.getItem('auth_accessToken');
    if (token) url.searchParams.set('token', token);
    const es = new EventSource(url.toString());
    esRef.current = es;

    // Temporary key for the stream context until the real sessionId arrives
    const pendingKey = `pending_${Date.now()}`;
    let resolvedSessionId = pendingKey;

    // Register the stream context with a temporary key; targetRef='state' means
    // SSE handlers write directly to React state (the user is viewing this session).
    streamSessions.startStream(pendingKey, es, null);
    const ctx = streamSessions.getStreamContext(pendingKey);
    ctx.streamMsg = streamMsg; // Store per-stream message object for restoration on session switch

    // Helper: get or update messages depending on whether this session is in foreground
    const updateMessages = (updater) => {
      if (ctx.targetRef.current === 'state') {
        setMessages(updater);
      } else {
        ctx.messages = updater(ctx.messages);
      }
    };
    const updateStructuredMessages = (updater) => {
      if (ctx.targetRef.current === 'state') {
        setStructuredMessages(updater);
      } else {
        ctx.structuredMessages = updater(ctx.structuredMessages);
      }
    };

    // Ensure an empty assistant message exists so the elapsed timer shows
    const ensureAssistantMessage = () => {
      if (ctx.assistantMessageAdded) return;
      ctx.assistantMessageAdded = true;
      updateMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') return prev;
        return [...prev, { ...streamMsg }];
      });
    };

    es.addEventListener('session', (e) => {
      const data = JSON.parse(e.data);
      if (data.session_id) {
        // Rekey the stream context from the temporary key to the real sessionId
        streamSessions.rekey(resolvedSessionId, data.session_id);
        resolvedSessionId = data.session_id;
        if (ctx.targetRef.current === 'state') {
          setSessionId(data.session_id);
        }
      }
      if (data.process_id) {
        ctx.processId = data.process_id;
        if (ctx.targetRef.current === 'state') {
          setCurrentProcessId(data.process_id);
        }
      }
    });

    es.addEventListener('stdout', (e) => {
      const { chunk } = JSON.parse(e.data);
      const chunkTime = Date.now();
      ensureAssistantMessage();

      // Update last chunk time immediately
      ctx.lastChunkTime = chunkTime;

      // Trim leading linebreaks only if this is the first chunk
      const textToAdd = streamMsg.text === '' ? chunk.trimStart() : chunk;
      // Don't add extra line breaks - the chunk already contains proper formatting
      streamMsg.text += textToAdd;
      ctx.currentMessageText = streamMsg.text;

      // Accumulate text in buffer
      ctx.textBuffer += chunk;

      // Check if buffer contains double line breaks (paragraph separators)
      // Split on \n\n but capture the delimiter to preserve it
      const parts = ctx.textBuffer.split(/(\n\n+)/);

      // If we have paragraph breaks (more than one part after split)
      if (parts.length > 1) {
        // Combine text with its following newlines to form complete segments
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
          updateStructuredMessages(prev => [...prev, textChunk]);
        });

        // Keep the last incomplete part in the buffer
        ctx.textBuffer = parts[parts.length - 1];
      }

      updateMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = { ...streamMsg };
        } else {
          // Only add message to state if there's actual content
          if (streamMsg.text.trim()) {
            newMessages.push({ ...streamMsg });
          }
        }
        return newMessages;
      });
    });

    es.addEventListener('usage', (e) => {
      const usage = JSON.parse(e.data);
      currentUsageRef.current = usage;
      ctx.currentUsage = usage;
      updateMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          newMessages[newMessages.length - 1] = {
            ...streamMsg,
            usage
          };
        }
        return newMessages;
      });
    });

    es.addEventListener('telemetry', (e) => {
      const data = JSON.parse(e.data);
      // Store spanId and traceId with the current assistant message for feedback
      if (data.span_id) {
        streamMsg.spanId = data.span_id;
        streamMsg.traceId = data.trace_id;
        updateMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...streamMsg,
              spanId: data.span_id,
              traceId: data.trace_id
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

      if (hasPreviewExtension(absolutePath)) {
        const viewer = getViewerForFile(absolutePath, autoPreviewExtensionMap);
        if (viewer) {
          claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
            action: `${viewer}-preview`,
            filePath: relativePath,
            projectName: currentProject
          });
        }
        fetchFile(relativePath, currentProject);
      }
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

      if (hasPreviewExtension(absolutePath)) {
        fetchFile(relativePath, currentProject);
      }
    });

    es.addEventListener('guardrails_triggered', (e) => {
      const { plugins, count, detections } = JSON.parse(e.data);
      updateStructuredMessages(prev => [...prev, {
        id: `guardrails_${Date.now()}`,
        type: 'guardrails_warning',
        plugins,
        count,
        detections
      }]);
    });

    es.addEventListener('output_guardrails_triggered', (e) => {
      const { violations, count } = JSON.parse(e.data);
      updateStructuredMessages(prev => [...prev, {
        id: `output_guardrails_${Date.now()}`,
        type: 'output_guardrails_warning',
        violations,
        count
      }]);
    });

    es.addEventListener('api_error', (e) => {
      const { message, fullError, timestamp } = JSON.parse(e.data);
      console.error('API Error:', message, fullError);
      updateStructuredMessages(prev => [...prev, {
        id: `api_error_${Date.now()}`,
        type: 'api_error',
        message,
        fullError,
        timestamp
      }]);
    });

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      es.close();
      setCurrentProcessId(null);

      // Flush remaining text buffer, mark running items complete, and capture
      // final structured messages in a single state update to avoid races.
      const finalStructuredMessages = [];

      // Build final structured messages from whichever target is active
      const flushStructured = (prev) => {
        let updated = [...prev];

        // Flush any remaining text buffer
        if (ctx.textBuffer.trim()) {
          updated.push({
            id: `text_${Date.now()}_final`,
            type: 'text_chunk',
            content: ctx.textBuffer,
            timestamp: ctx.lastChunkTime
          });
          ctx.textBuffer = '';
        }

        // Mark all running items as complete
        updated = updated.map(msg =>
          msg.status === 'running' ? { ...msg, status: 'complete' } : msg
        );

        finalStructuredMessages.push(...updated);
        return updated;
      };

      if (ctx.targetRef.current === 'state') {
        setStructuredMessages(flushStructured);
      } else {
        ctx.structuredMessages = flushStructured(ctx.structuredMessages);
      }

      // Finalize message with reasoning steps attached
      if (streamMsg.text) {
        const finalizeMessages = (prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...streamMsg,
              usage: ctx.currentUsage,
              reasoningSteps: finalStructuredMessages.length > 0 ? finalStructuredMessages : undefined
            };
          }
          return newMessages;
        };

        if (ctx.targetRef.current === 'state') {
          setMessages(finalizeMessages);
        } else {
          ctx.messages = finalizeMessages(ctx.messages);
        }
      }

      // Remove from active streaming sessions
      streamSessions.stopStream(resolvedSessionId);

      // Refresh sessions list (a new session may have been created)
      if (currentProject) {
        apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}`)
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
      if (ctx.textBuffer.trim() && data.status === 'running') {
        const bufferContent = ctx.textBuffer;
        const bufferTimestamp = receivedTime - 1; // 1ms before tool call
        console.log('Flushing text buffer before tool call:', { timestamp: bufferTimestamp, preview: bufferContent.substring(0, 50) });
        updateStructuredMessages(prev => [...prev, {
          id: `text_${receivedTime}_before_tool`,
          type: 'text_chunk',
          content: bufferContent,
          timestamp: bufferTimestamp
        }]);
        ctx.textBuffer = '';
      }

      updateStructuredMessages(prev => {
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

    // Listen for thinking/reasoning events (Codex reasoning items)
    es.addEventListener('thinking', (e) => {
      const data = JSON.parse(e.data);
      if (data.content) {
        const timestamp = Date.now();
        updateStructuredMessages(prev => [...prev, {
          id: `thinking_${timestamp}`,
          type: 'thinking',
          content: data.content,
          timestamp
        }]);
      }
    });

    es.addEventListener('completed', () => {
      stop();
    });
    es.addEventListener('error', () => {
      stop();
    });
  };

  const handleAbort = async () => {
    // Look up the stream context for the currently viewed session
    const ctx = streamSessions.getStreamContext(sessionId);
    const pid = ctx?.processId || currentProcessId;
    if (pid) {
      try {
        await apiFetch(`/api/claude/abort/${pid}`, {
          method: 'POST'
        });
        // Close the specific EventSource and remove from streaming sessions
        if (ctx) {
          streamSessions.stopStream(sessionId);
        } else {
          esRef.current?.close();
        }
        setCurrentProcessId(null);
      } catch (error) {
        console.error('Failed to abort process:', error);
      }
    }
  };

  const handleSessionChange = async (newSessionId, targetProject) => {
    const project = targetProject || currentProject;

    // --- Snapshot the departing session if it's currently streaming ---
    const departingCtx = streamSessions.getStreamContext(sessionId);
    if (departingCtx && departingCtx.targetRef.current === 'state') {
      // Capture the latest React state into the stream context's buffers.
      // We flip targetRef inside the updater so SSE handlers see 'buffer' only
      // after the snapshot is taken, avoiding a race where handlers write to
      // an empty ctx.messages before the snapshot populates it.
      setMessages(prev => {
        departingCtx.messages = [...prev];
        return prev;
      });
      setStructuredMessages(prev => {
        departingCtx.structuredMessages = [...prev];
        departingCtx.targetRef.current = 'buffer';
        return prev;
      });
    }

    // If newSessionId is null, start a new session (clear current session)
    if (newSessionId === null) {
      setCurrentSessionId(null);
      setSessionId('');
      setMessages([]);
      setStructuredMessages([]);

      // Clear the session.id file on the backend
      try {
        await apiFetch(`/api/claude/clearSession/${encodeURIComponent(project)}`, {
          method: 'POST'
        });
      } catch (err) {
        console.error('Failed to clear session on backend:', err);
      }

      // Load just the greeting
      try {
        const assistantRes = await apiFetch('/api/claude/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectName: project })
        });
        const assistantData = await assistantRes.json();
        const greeting = assistantData?.assistant?.greeting;

        if (greeting) {
          setMessages([{
            role: 'assistant',
            text: formatGreeting(greeting),
            timestamp: formatTime()
          }]);
        }
      } catch (err) {
        console.error('Failed to load greeting:', err);
      }
      return;
    }

    // --- Switch TO the target session ---
    setCurrentSessionId(newSessionId);
    setSessionId(newSessionId);

    // Check if the target session has an active background stream
    const targetCtx = streamSessions.getStreamContext(newSessionId);
    if (targetCtx) {
      // Restore buffered state from the background stream into React state
      setMessages(targetCtx.messages);
      setStructuredMessages(targetCtx.structuredMessages);
      setCurrentProcessId(targetCtx.processId);
      // Restore the per-stream message ref so the MuxSSE Stop handler reads the right text
      if (targetCtx.streamMsg) {
        currentMessageRef.current = targetCtx.streamMsg;
      }
      // Re-point SSE handlers to write to React state
      targetCtx.targetRef.current = 'state';
      return;
    }

    // No active stream — load session history from API (existing behavior)
    try {
      // Load session history
      const historyRes = await apiFetch(`/api/sessions/${encodeURIComponent(project)}/${newSessionId}/history`);
      const historyData = await historyRes.json();
      const chatMessages = historyData?.messages || [];

      // Load greeting
      const assistantRes = await apiFetch('/api/claude/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectName: project })
      });
      const assistantData = await assistantRes.json();
      const greeting = assistantData?.assistant?.greeting;

      const loadedMessages = [];
      if (greeting) {
        loadedMessages.push({
          role: 'assistant',
          text: formatGreeting(greeting),
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

      // Track recent chat access
      if (isMinimalistic) {
        const lastUserMsg = chatMessages.filter(m => !m.isAgent).pop();
        const title = lastUserMsg ? lastUserMsg.message.split(/\s+/).slice(0, 5).join(' ') : 'Chat';
        apiFetch('/api/recent-items/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: project, sessionId: newSessionId, title }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  };

  // Listen for loadSession events from UserOrders (navigate to a specific session)
  const handleSessionChangeRef = useRef(handleSessionChange);
  handleSessionChangeRef.current = handleSessionChange;
  useEffect(() => {
    const handleLoadSession = (e) => {
      const { sessionId: sid, projectName } = e.detail || {};
      if (projectName) {
        setProject(projectName);
      }
      if (sid) {
        handleSessionChangeRef.current(sid, projectName);
      }
    };
    window.addEventListener('loadSession', handleLoadSession);
    return () => window.removeEventListener('loadSession', handleLoadSession);
  }, [setProject]);

  // Save open tabs to workbench.json when files change
  useEffect(() => {
    if (!currentProject || files.length === 0) return;

    const saveWorkbench = async () => {
      try {
        const workbenchConfig = {
          openTabs: files.map(f => f.path)
        };
        await apiFetch(`/api/workspace/${encodeURIComponent(currentProject)}/workbench`, {
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

  // Sync open tabs to Zustand store (sessionStorage persistence for reload survival)
  useEffect(() => {
    if (!currentProject) return;
    setTabPaths(currentProject, files.map(f => f.path));
  }, [currentProject, files]);

  // Restore tabs from sessionStorage on initial page load
  useEffect(() => {
    if (!currentProject || files.length > 0) return;

    const savedPaths = getTabPaths(currentProject);
    if (savedPaths.length === 0) return;

    for (const filePath of savedPaths) {
      if (filePath.startsWith('#') || filePath.endsWith('.requirements.json') || filePath.endsWith('.artifacts.md')) {
        setFiles(arr => {
          if (arr.some(x => x.path === filePath)) return arr;
          return arr.concat([{ path: filePath, content: '' }]);
        });
      } else {
        try {
          filePreviewHandler.handlePreview(filePath, currentProject);
        } catch (err) {
          console.warn(`Failed to restore tab for ${filePath}:`, err);
        }
      }
    }
  }, [currentProject]);

  // Restore open tabs from workbench.json when project loads
  const restoreWorkbench = async (projectName) => {
    try {
      const response = await apiFetch(`/api/workspace/${encodeURIComponent(projectName)}/workbench`);
      if (response.ok) {
        const config = await response.json();
        if (config && config.openTabs && Array.isArray(config.openTabs)) {
          // Restore tabs by simulating file preview requests
          // We do this in sequence to maintain tab order
          for (const filePath of config.openTabs) {
            // Use filePreviewHandler to trigger the preview
            // This will be tolerant - if file doesn't exist, it will fail silently
            try {
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

  const handleProjectChange = async (newProject, guidanceDocuments) => {
    // Reset state before project change
    setMessages([]);
    setStructuredMessages([]);
    setFiles([]);
    setSessionId('');
    setCurrentSessionId(null);
    setHasSessions(false);
    esRef.current?.close();
    streamSessions.closeAll();

    // Update project - this will trigger the useEffect that loads all project data
    setProject(newProject);

    // Track recent project access
    if (isMinimalistic) {
      apiFetch('/api/recent-items/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProject }),
      }).catch(() => {});
    }

    // Restore workbench after a short delay to ensure project is loaded
    setTimeout(() => {
      restoreWorkbench(newProject);
    }, 1000);

    // Open guidance documents from newly created project in the preview pane
    if (guidanceDocuments && Array.isArray(guidanceDocuments) && guidanceDocuments.length > 0) {
      setTimeout(() => {
        guidanceDocuments.forEach(docPath => {
          fetchFile(docPath, newProject);
        });
      }, 1500);
    }
  };

  const handleLoadChat = async (chatSessionId, projectName) => {
    if (projectName && projectName !== currentProject) {
      await handleProjectChange(projectName);
      // Wait for project to load before switching session
      setTimeout(() => handleSessionChange(chatSessionId, projectName), 500);
    } else {
      handleSessionChange(chatSessionId);
    }
  };

  const handleOnboardingComplete = (projectName) => {
    // Onboarding is complete, hide it and load the new project
    setShowConfigurationRequired(false);
    setProject(projectName);
  };

  // Show loading while checking required services
  if (servicesReady === null) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Show service health gate if required services are not running
  if (servicesReady === false) {
    return <ServiceHealthGate onReady={() => setServicesReady(true)} />;
  }

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.default' }}>
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
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Show onboarding wizard if configuration is required
  if (showConfigurationRequired) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // Show loading while restoring project from localStorage
  if (projectLoading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <MuxSSEProvider mux={mux}>
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: isMinimalistic ? 'row' : 'column' }}>
      {isMinimalistic && (
        <MinimalisticSidebar
          onNewChat={() => handleSessionChange(null)}
          onProjectChange={handleProjectChange}
          onLoadChat={handleLoadChat}
          currentProject={currentProject}
          sessionId={sessionId}
          streaming={streaming}
          streamingSessionIds={new Set(streamSessions.activeSessionIds)}
          onCopySessionId={handleCopySessionId}
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
          codingAgent={codingAgent}
          allTags={allTags}
          agentClass={agentClass}
          keyboardShortcuts={keyboardShortcuts}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
          hasPublicWebsite={hasPublicWebsite}
          mux={mux}
        />
      )}

      {!isMinimalistic && (
      <AppBar
        position="static"
        sx={{
          zIndex: 10,
          backgroundColor: themeMode === 'dark' ? 'navy' : uiConfig?.appBar?.backgroundColor,
          color: uiConfig?.appBar?.fontColor,
        }}
      >
        <Toolbar>
          <Typography variant="h6">
            {uiConfig?.appBar?.title || t('app.title')}
          </Typography>
          {currentProject && (
            <BudgetIndicator
              project={currentProject}
              budgetSettings={budgetSettings}
              onSettingsChange={setBudgetSettings}
              showBackgroundInfo={showBackgroundInfo}
              mux={mux}
            />
          )}
          {hasTasks && currentProject && (
            <IconButton
              color="inherit"
              onClick={() => setSchedulingOpen(true)}
              sx={{ ml: 3 }}
              title={t('app.scheduledTasks')}
            >
              <TbCalendarTime size={24} />
            </IconButton>
          )}
          {hasPublicWebsite && currentProject && (
            <Tooltip title={t('app.publicWebsite')} arrow>
              <IconButton
                color="inherit"
                onClick={() => {
                  const url = `${window.location.protocol}//${window.location.host}/web/${encodeURIComponent(currentProject)}`;
                  window.open(url, '_blank');
                }}
                sx={{ ml: 1 }}
              >
                <TbWorld size={24} />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            color="inherit"
            onClick={() => setPresentationOpen(true)}
            sx={{ opacity: 0, '&:hover': { opacity: 0.5 } }}
            title={t('app.presentation')}
          >
            <TbPresentation size={24} />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '50px',
              padding: '2px',
              cursor: 'pointer',
              mr: '30px',
            }}
            onClick={toggleMode}
          >
            <Box sx={{
              width: 29,
              height: 29,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: themeMode === 'light' ? 'rgba(255,215,0,0.12)' : 'transparent',
              border: themeMode === 'light' ? '1px solid rgba(255,215,0,0.3)' : '1px solid transparent',
              color: themeMode === 'light' ? '#fff' : 'rgba(255,255,255,0.35)',
              transition: 'all 0.2s ease',
            }}>
              <IoSunnyOutline size={14} />
            </Box>
            <Box sx={{
              width: 29,
              height: 29,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: themeMode === 'dark' ? 'rgba(255,215,0,0.12)' : 'transparent',
              border: themeMode === 'dark' ? '1px solid rgba(255,215,0,0.3)' : '1px solid transparent',
              color: themeMode === 'dark' ? 'gold' : 'rgba(255,255,255,0.35)',
              transition: 'all 0.2s ease',
            }}>
              <IoMoonOutline size={14} />
            </Box>
          </Box>
          <Typography variant="subtitle1" sx={{ mr: 2, opacity: 0.8 }}>
            [{currentProject || t('app.selectProject')}]
          </Typography>
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
            sessionId={sessionId}
            onCopySessionId={handleCopySessionId}
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
            codingAgent={codingAgent}
          />
        </Toolbar>
      </AppBar>
      )}

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {hashRoute === 'techradar' ? (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <TechnologyRadarPage />
          </Box>
        ) : showWelcomePage ? (
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
            left={<ChatPane messages={messages} structuredMessages={structuredMessages} onSendMessage={handleSendMessage} onAbort={handleAbort} streaming={streaming} mode={mode} onModeChange={setMode} aiModel={aiModel} onAiModelChange={setAiModel} showBackgroundInfo={showBackgroundInfo} onShowBackgroundInfoChange={handleShowBackgroundInfoChange} projectExists={projectExists} projectName={currentProject} onSessionChange={handleSessionChange} hasActiveSession={sessionId !== ''} hasSessions={hasSessions} onShowWelcomePage={() => setShowWelcomePage(true)} uiConfig={uiConfig} codingAgent={codingAgent} sessionId={sessionId} hideHeader={isMinimalistic} />}
            right={<ArtifactsPane files={files} projectName={currentProject} sessionId={sessionId} showBackgroundInfo={showBackgroundInfo} projectExists={projectExists} onClearPreview={() => setFiles([])} onCloseTab={handleCloseTab} previewersConfig={previewersConfig} autoFilePreviewExtensions={uiConfig?.autoFilePreviewExtensions} onUpdateViewerState={updateViewerState} />}
          />
        )}
      </Box>

      <Drawer
        anchor="right"
        open={schedulingOpen}
        onClose={() => {
          setSchedulingOpen(false);
          refreshTaskCount();
        }}
        sx={{
          '& .MuiDrawer-paper': {
            width: '500px',
            maxWidth: '90vw',
          },
        }}
      >
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <SchedulingOverview
            open={schedulingOpen}
            onClose={() => {
              setSchedulingOpen(false);
              refreshTaskCount();
            }}
            project={currentProject}
            showBackgroundInfo={showBackgroundInfo}
          />
        </Box>
      </Drawer>

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
        message={t('app.sessionIdCopied')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />

      {/* Language switch toast */}
      <Snackbar
        open={langToast.open}
        autoHideDuration={2000}
        onClose={() => setLangToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setLangToast(prev => ({ ...prev, open: false }))}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {langToast.language}
        </Alert>
      </Snackbar>

      {/* UX mode switch toast */}
      <Snackbar
        open={uxToast.open}
        autoHideDuration={2000}
        onClose={() => setUxToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setUxToast(prev => ({ ...prev, open: false }))}
          severity="info"
          variant="filled"
          sx={{ width: '100%' }}
        >
          UX: {uxToast.mode}
        </Alert>
      </Snackbar>

      {/* Knowledge-acquired toast */}
      <Snackbar
        open={knowledgeToast.open}
        autoHideDuration={10000}
        onClose={() => setKnowledgeToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setKnowledgeToast(prev => ({ ...prev, open: false }))}
          severity="success"
          variant="filled"
          sx={{ width: '100%', fontWeight: 600 }}
        >
          {knowledgeToast.message}
        </Alert>
      </Snackbar>

      {/* Context Manager Dialog */}
      <ContextManager
        open={contextManagerOpen}
        onClose={() => setContextManagerOpen(false)}
        projectName={currentProject}
        allTags={allTags}
        onContextChange={handleContextChange}
      />

      {/* Keyboard Shortcuts Overlay */}
      <KeyboardShortcutsOverlay
        open={shortcutsOverlayOpen}
        onClose={() => setShortcutsOverlayOpen(false)}
        shortcuts={keyboardShortcuts}
      />

      {/* Service Control Drawer */}
      <ServiceControlDrawer
        open={serviceControlOpen}
        onClose={() => setServiceControlOpen(false)}
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

      {/* HITL Protocol Verification Modal */}
      <HITLApprovalModal
        open={!!pendingHITL}
        hitlRequest={pendingHITL}
        onRespond={handleHITLResponse}
        onClose={() => setPendingHITL(null)}
      />
    </Box>
    </MuxSSEProvider>
  );
}
