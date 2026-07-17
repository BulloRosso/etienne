import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from './contexts/ProjectContext.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { useThemeMode } from './contexts/ThemeContext.jsx';
import { claudeEventBus, ClaudeEvents } from './eventBus';
import { useClaudeEvent } from './useClaudeEvent';
import { buildExtensionMap, hasPreviewExtension as hasPreviewExtensionPure } from './components/viewerRegistry.jsx';
import { agentBus } from './services/agentBus';
import AppGates from './app/AppGates';
import AppLayout from './app/AppLayout';
import { apiFetch } from './services/api';
import { filePreviewHandler } from './services/FilePreviewHandler';
import useTabStore from './stores/useTabStore';
import useMultiplexSSE from './hooks/useMultiplexSSE';
import useStreamingSessions from './hooks/useStreamingSessions';
import { useUxMode } from './contexts/UxModeContext.jsx';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import useHashRoute from './hooks/useHashRoute';
import { formatTime, extractRelativePath } from './utils/paths';
import { fetchFileContent, mergeFile } from './features/workspace/fileApi';
import useClaudeStream from './features/chat/useClaudeStream';
import useChatSession from './features/chat/useChatSession';
import useHitlDialogs from './features/hitl/useHitlDialogs';
import useGlobalInterceptorEvents from './features/interceptors/useGlobalInterceptorEvents';
import useProjectInterceptorEvents from './features/interceptors/useProjectInterceptorEvents';
import useProjectSwitching from './features/workspace/useProjectSwitching';

export default function App() {
  const { t, i18n } = useTranslation();
  const { currentProject, projectExists, setProject, loading: projectLoading } = useProject();
  const { isAuthenticated, loading: authLoading, user, firstRunStatus, markFirstRunComplete } = useAuth();
  const [firstRunOverride, setFirstRunOverride] = useState(false);
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
  }, [isAuthenticated, currentProject]);

  const formatGreeting = (text) => agentName ? `**${agentName}**: ${text}` : text;

  const streamSessions = useStreamingSessions();
  // Chat-session state, refs, and abort handler live in useChatSession. Destructured
  // into the same identifiers App used before so existing call-sites are unchanged.
  const {
    messages, setMessages,
    structuredMessages, setStructuredMessages,
    contextState, setContextState,
    sessionId, setSessionId,
    currentSessionId, setCurrentSessionId,
    currentProcessId, setCurrentProcessId,
    retryAvailable, setRetryAvailable,
    esRef,
    currentMessageRef,
    currentUsageRef,
    activeToolCallsRef,
    currentSessionIdRef,
    lastSentRef,
    handleAbort,
  } = useChatSession({ streamSessions });
  const [files, setFiles] = useState([]);
  const { getTabPaths, setTabPaths } = useTabStore();
  const [hasSessions, setHasSessions] = useState(false); // Track if sessions exist
  const [mode, setMode] = useState('work'); // 'plan' or 'work'
  const [aiModel, setAiModel] = useState('anthropic'); // 'anthropic' or 'openai'
  const [budgetSettings, setBudgetSettings] = useState({ enabled: false, limit: 0 });
  const [hasTasks, setHasTasks] = useState(false);
  const [hasPublicWebsite, setHasPublicWebsite] = useState(false);
  const [wikiEntryPath, setWikiEntryPath] = useState(null);
  const [cheatsheetPath, setCheatsheetPath] = useState(null);
  const [askExpertUnackedCount, setAskExpertUnackedCount] = useState(0);
  const [showBackgroundInfo, setShowBackgroundInfo] = useState(() => {
    const saved = localStorage.getItem('showBackgroundInfo');
    return saved === 'true' ? true : false;
  });
  const [uiConfig, setUiConfig] = useState(null);
  const [showWelcomePage, setShowWelcomePage] = useState(false);
  const [welcomeMenuConfig, setWelcomeMenuConfig] = useState(null);
  const [showWelcomeMenu, setShowWelcomeMenu] = useState(false);
  const hashRoute = useHashRoute();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [langToast, setLangToast] = useState({ open: false, language: '' });
  const [uxToast, setUxToast] = useState({ open: false, mode: '' });
  const [shortcutsOverlayOpen, setShortcutsOverlayOpen] = useState(false);
  const [serviceControlOpen, setServiceControlOpen] = useState(false);
  const [knowledgeToast, setKnowledgeToast] = useState({ open: false, message: '' });
  // ── Compliance-matrix Export modal (opened by cockpit's open-export
  //    postMessage; rendered at the App root so it works regardless of
  //    which artifact tab is active). ──
  const [exportModalState, setExportModalState] = useState({ open: false, projectName: null, rfp: null, rfps: [] });
  const [activeContextId, setActiveContextId] = useState(null);
  const [contexts, setContexts] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showConfigurationRequired, setShowConfigurationRequired] = useState(null); // null = checking, true = show onboarding, false = show app
  const [codingAgent, setCodingAgent] = useState('anthropic'); // 'anthropic' | 'openai' | 'openai-agents' | 'pi-mono' | 'open-code' | 'kimi-code' — from CODING_AGENT env var
  const [previewersConfig, setPreviewersConfig] = useState([]);

  const mux = useMultiplexSSE(currentProject);

  // Human-in-the-loop dialogs (elicitation, permission, question, plan, HITL,
  // pairing) + their dedupe set live in useHitlDialogs. The interceptor effects
  // call openFromEvent; the pending-pairings fetch shares handledRequestIdsRef.
  const hitl = useHitlDialogs();
  const { openFromEvent: openHitlFromEvent, handledRequestIdsRef, setPendingPairing } = hitl;

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
      .map(([path, state]) => {
        const viewerName = state.viewerName;
        const catalog = viewerName ? agentBus.getCatalog(viewerName) : [];
        const recentEvents = viewerName ? agentBus.drainRecent(viewerName, path) : [];
        return {
          path,
          ...state,
          ...(catalog.length > 0 ? { agentbusCatalog: catalog } : {}),
          ...(recentEvents.length > 0 ? { agentbusRecentEvents: recentEvents } : {}),
        };
      });
  }, []);

  const refreshCheatsheetPath = useCallback(async () => {
    if (!currentProject || !user?.username) {
      setCheatsheetPath(null);
      return;
    }
    try {
      const res = await apiFetch(`/api/cheatsheet/${encodeURIComponent(currentProject)}`);
      if (!res.ok) {
        setCheatsheetPath(null);
        return;
      }
      const data = await res.json();
      setCheatsheetPath(data?.exists && data?.path ? data.path : null);
    } catch {
      setCheatsheetPath(null);
    }
  }, [currentProject, user?.username]);

  useClaudeEvent(
    ClaudeEvents.CHEATSHEET_UPDATED,
    () => { refreshCheatsheetPath(); },
    [refreshCheatsheetPath],
  );

  // Unacknowledged answer count for the sidebar "Ask the expert" badge.
  // Only meaningful for role 'guest' on the knowledge-transfer application type.
  const refreshAskExpertUnacked = useCallback(async () => {
    if (!currentProject || !user?.username || user?.role !== 'guest') {
      setAskExpertUnackedCount(0);
      return;
    }
    try {
      const res = await apiFetch(
        `/api/q-and-a/${encodeURIComponent(currentProject)}/unacknowledged-count`,
      );
      if (!res.ok) {
        setAskExpertUnackedCount(0);
        return;
      }
      const data = await res.json();
      setAskExpertUnackedCount(typeof data?.count === 'number' ? data.count : 0);
    } catch {
      setAskExpertUnackedCount(0);
    }
  }, [currentProject, user?.username, user?.role]);

  useEffect(() => {
    refreshAskExpertUnacked();
    if (!currentProject || user?.role !== 'guest') return undefined;
    const id = setInterval(refreshAskExpertUnacked, 10000);
    return () => clearInterval(id);
  }, [refreshAskExpertUnacked, currentProject, user?.role]);

  useClaudeEvent(
    ClaudeEvents.ASK_EXPERT_UPDATED,
    () => { refreshAskExpertUnacked(); },
    [refreshAskExpertUnacked],
  );

  // Ask the expert modal mounted at App level so it works even when no chat
  // session is open (ChatPane unmounted on the welcome page).
  const [askExpertModalApp, setAskExpertModalApp] = useState({ open: false, bubbleText: '' });
  useClaudeEvent(
    ClaudeEvents.ASK_EXPERT_REQUEST,
    (data) => {
      if (data?.projectName && currentProject && data.projectName !== currentProject) return;
      setAskExpertModalApp({ open: true, bubbleText: data?.bubbleText || '' });
    },
    [currentProject],
  );

  // Derived streaming state: true when the currently viewed session has an active stream.
  // Also matches 'pending_*' keys (stream registered but sessionId not yet known from backend).
  const streaming = streamSessions.activeSessionIds.includes(sessionId)
    || streamSessions.activeSessionIds.some(id => id.startsWith('pending_'));

  useEffect(() => () => {
    esRef.current?.close();
    streamSessions.closeAll();
  }, []);

  // Auto-prompt from viewers (e.g. Gantt drag emits a synthetic chat message
  // describing the move). Reuses handleSendMessage so the regular viewer-state
  // POST + SSE pipeline runs unchanged.
  // If detail.fresh === true, reset the current session first so the prompt
  // starts a brand-new chat (used by application-type sidebar subagent links).
  // The viewer-name + event-id metadata is forwarded so ChatMessage can render
  // a compact pill instead of the verbose chatTemplate (which is still sent to
  // the backend as the prompt — only the display is collapsed).
  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      const msg = detail.message;
      if (!msg) return;
      const opts = detail.source
        ? {
            source: 'viewer-auto',
            sourceMetadata: {
              viewerName: detail.source,
              eventId: detail.eventId,
              filename: detail.filename,
              viewerInstanceId: detail.viewerInstanceId,
            },
          }
        : undefined;
      if (detail.fresh) {
        handleSessionChange(null);
        requestAnimationFrame(() => handleSendMessage(msg, opts));
      } else {
        handleSendMessage(msg, opts);
      }
    };
    window.addEventListener('viewer-auto-prompt', handler);
    return () => window.removeEventListener('viewer-auto-prompt', handler);
  });

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

  // When Codex (OpenAI) is active, force mode to 'work' — plan mode is not supported.
  // (kimi-code keeps the toggle: Kimi has native plan mode via setPlanMode.)
  useEffect(() => {
    if (codingAgent === 'openai') {
      setMode('work');
    }
  }, [codingAgent]);

  // Fetch any existing pending pairings — only once authenticated, to avoid pre-login 401s.
  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated]);

  // Global interceptor events (pairing requests) via multiplexed SSE
  useGlobalInterceptorEvents({ mux, openHitlFromEvent });

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
      setWelcomeMenuConfig(null);
      setShowWelcomeMenu(false);
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

          // Portal redirect: if appDirectory is configured and we haven't redirected
          // this session yet, hand the browser off to the portal. The sessionStorage
          // flag is what lets the "Start Onboarding Agent" button get back here.
          // A trailing slash is appended automatically — Vite-served portals use a
          // base path (e.g. base:'/app/') and emit a notice on the slashless form.
          if (config?.appDirectory && !sessionStorage.getItem('portalRedirected')) {
            sessionStorage.setItem('portalRedirected', '1');
            const target = config.appDirectory.endsWith('/') ? config.appDirectory : config.appDirectory + '/';
            window.location.assign(target);
            return;
          }

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

        // Load welcome-menu (interactive scene) config — optional, per-project file.
        // When present, takes precedence over the legacy WelcomePage on project load.
        try {
          const menuUrl = new URL('/api/claude/getFile', window.location.origin);
          menuUrl.searchParams.set('project_dir', currentProject);
          menuUrl.searchParams.set('file_name', 'welcome/welcomepage.json');
          const menuRes = await apiFetch(menuUrl.toString());
          if (menuRes.ok) {
            const data = await menuRes.json();
            const parsed = JSON.parse(data.content);
            if (parsed && Array.isArray(parsed.hotspots)) {
              setWelcomeMenuConfig(parsed);
              setShowWelcomeMenu(true);
              setShowWelcomePage(false);
            } else {
              setWelcomeMenuConfig(null);
              setShowWelcomeMenu(false);
            }
          } else {
            setWelcomeMenuConfig(null);
            setShowWelcomeMenu(false);
          }
        } catch {
          setWelcomeMenuConfig(null);
          setShowWelcomeMenu(false);
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
        // and detect whether the project has a wiki/topics directory we can navigate to.
        try {
          const [webserverRes, filesRes] = await Promise.all([
            apiFetch('/api/process-manager/webserver'),
            apiFetch(`/api/claude/listFiles?project_dir=${encodeURIComponent(currentProject)}&sub_dir=.`),
          ]);
          const webserverData = await webserverRes.json();
          const filesData = await filesRes.json();
          const hasWebDir = Array.isArray(filesData) && filesData.some(f => f.name === 'web' && f.isDir);
          setHasPublicWebsite(webserverData.status === 'running' && hasWebDir);

          const hasWikiDir = Array.isArray(filesData) && filesData.some(f => f.name === 'wiki' && f.isDir);
          if (hasWikiDir) {
            try {
              const wikiRes = await apiFetch(`/api/claude/listFiles?project_dir=${encodeURIComponent(currentProject)}&sub_dir=${encodeURIComponent('wiki')}`);
              const wikiData = await wikiRes.json();
              const hasWikiIndex = Array.isArray(wikiData) && wikiData.some(f => !f.isDir && f.name === 'index.md');
              if (hasWikiIndex) {
                setWikiEntryPath('wiki/index.md');
              } else {
                const topicsRes = await apiFetch(`/api/claude/listFiles?project_dir=${encodeURIComponent(currentProject)}&sub_dir=${encodeURIComponent('wiki/topics')}`);
                const topicsData = await topicsRes.json();
                if (Array.isArray(topicsData) && topicsData.length > 0) {
                  const hasIndex = topicsData.some(f => !f.isDir && f.name === 'index.md');
                  if (hasIndex) {
                    setWikiEntryPath('wiki/topics/index.md');
                  } else {
                    const firstDoc = topicsData.find(f => !f.isDir);
                    setWikiEntryPath(firstDoc ? `wiki/topics/${firstDoc.name}` : null);
                  }
                } else {
                  setWikiEntryPath(null);
                }
              }
            } catch {
              setWikiEntryPath(null);
            }
          } else {
            setWikiEntryPath(null);
          }
        } catch {
          setHasPublicWebsite(false);
          setWikiEntryPath(null);
        }

        // Detect the user's per-user cheat sheet file (sidebar gating per PRD).
        refreshCheatsheetPath();
      } catch (error) {
        console.error('Failed to initialize project:', error);
        setUiConfig(null);
        setShowWelcomePage(false);
        setWelcomeMenuConfig(null);
        setShowWelcomeMenu(false);
      }
    };

    initializeProject();
  }, [currentProject]);

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

  // Check if a file path ends with a supported preview extension.
  // Thin wrapper that injects the current extension map into the pure helper.
  const hasPreviewExtension = useCallback(
    (filePath) => hasPreviewExtensionPure(filePath, autoPreviewExtensionMap),
    [autoPreviewExtensionMap],
  );

  // Fetch file content and add/update it in the files list. The network/retry
  // logic lives in fetchFileContent (features/workspace/fileApi.js); here we
  // just merge the result into React state.
  const fetchFile = useCallback(async (path, projectDir, retries = 3, delayMs = 500) => {
    const file = await fetchFileContent(path, projectDir, { retries, delayMs });
    if (file) {
      setFiles(arr => mergeFile(arr, file));
    }
  }, []);

  // Project interceptor events via multiplexed SSE — routed through the
  // interceptorEventHandlers registry. The api object is rebuilt each render and
  // the hook reads it via a ref, so handlers always see fresh state.
  useProjectInterceptorEvents({
    currentProject,
    mux,
    api: {
      currentProject,
      t,
      streamSessions,
      setStructuredMessages,
      setMessages,
      setKnowledgeToast,
      setHasSessions,
      getHasSessions: () => hasSessions,
      currentMessageRef,
      currentSessionIdRef,
      hasPreviewExtension,
      extractRelativePath,
      fetchFile,
      openHitlFromEvent,
      apiFetch,
    },
  });


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

  // Listen for postMessage actions from MCP App iframes (compliance-matrix
  // cockpit so far). Mounted here at the app root so they fire regardless
  // of which artifact tab is active — Filesystem can unmount between
  // tab switches, and we don't want the cockpit's host-bound buttons to
  // silently fail when it does.
  useEffect(() => {
    function handler(event) {
      if (event.data?.type !== 'compliance-cockpit-action') return;
      const { action, payload } = event.data;
      if (action === 'open-wiki-editor') {
        const slug = payload?.slug;
        if (slug && currentProject) {
          filePreviewHandler.handlePreview(`wiki/topics/${slug}.md`, currentProject);
        }
      } else if (action === 'open-host-preview') {
        const path = payload?.path;
        if (path && currentProject) {
          filePreviewHandler.handlePreview(path, currentProject);
        }
      } else if (action === 'open-external') {
        const url = payload?.url;
        if (url && /^https?:/i.test(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } else if (action === 'open-export') {
        // Open the export-compliance modal. The cockpit sends the
        // workspace project name (not the bid display label) so the
        // modal can fetch the project's filesystem. The cockpit also
        // forwards its active RFP (and the full registry) so the modal
        // can scope fill-back per-RFP and offer the right export modes
        // (DOCX comments vs XLSX answer column).
        setExportModalState({
          open: true,
          projectName: payload?.projectName || currentProject,
          rfp: payload?.rfp ?? null,
          rfps: Array.isArray(payload?.rfps) ? payload.rfps : [],
        });
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [currentProject]);

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

  // The streaming lifecycle (EventSource + SSE handler registry) lives in
  // useClaudeStream; App supplies the stable deps here and the per-call config
  // (project/mode/model/context) at call time so the hook stays stale-closure-free.
  const { sendMessage, reattachToStream } = useClaudeStream({
    streamSessions,
    esRef,
    currentMessageRef,
    currentUsageRef,
    activeToolCallsRef,
    setMessages,
    setStructuredMessages,
    setContextState,
    setSessionId,
    setCurrentProcessId,
    setHasSessions,
    hasPreviewExtension,
    fetchFile,
    setRetryAvailable,
    lastSentRef,
  });

  const handleSendMessage = useCallback((messageText, options = {}) => {
    const activeContext = activeContextId ? contexts.find(c => c.id === activeContextId) : null;
    return sendMessage(messageText, {
      currentProject,
      mode,
      aiModel,
      codingAgent,
      activeContext,
      autoPreviewExtensionMap,
      getViewerStates,
      options,
    });
  }, [sendMessage, activeContextId, contexts, currentProject, mode, aiModel, codingAgent, autoPreviewExtensionMap, getViewerStates]);

  // Re-send the last turn after a failure (Retry affordance). lastSentRef holds
  // the original text + config so the retried prompt is identical.
  const handleRetry = useCallback(() => {
    const last = lastSentRef.current;
    if (!last) return;
    setRetryAvailable(null);
    sendMessage(last.text, last.config);
  }, [sendMessage, lastSentRef, setRetryAvailable]);

  // Reattach to an in-flight stream after a page reload. On project open, if a
  // recent activeStream bookmark exists, replay its buffer (full, no lastEventId)
  // to rebuild the message + timeline, then continue live. A stale bookmark or a
  // finished run resolves cleanly (stream_not_found clears the bookmark).
  useEffect(() => {
    if (!currentProject) return;
    try {
      const raw = sessionStorage.getItem(`etienne.activeStream.${currentProject}`);
      if (!raw) return;
      const { processId, ts } = JSON.parse(raw);
      if (Date.now() - ts > 10 * 60 * 1000) { // stale bookmark
        sessionStorage.removeItem(`etienne.activeStream.${currentProject}`);
        return;
      }
      reattachToStream(processId, { currentProject, autoPreviewExtensionMap });
    } catch { /* ignore */ }
  }, [currentProject]); // eslint-disable-line react-hooks/exhaustive-deps

  // Project/session switching + workbench restore live in useProjectSwitching.
  // The hook also owns the loadSession window-event bridge.
  const {
    handleSessionChange,
    handleProjectChange,
    handleLoadChat,
  } = useProjectSwitching({
    currentProject,
    sessionId,
    streamSessions,
    isMinimalistic,
    setProject,
    formatGreeting,
    setMessages,
    setStructuredMessages,
    setContextState,
    setCurrentProcessId,
    setCurrentSessionId,
    setSessionId,
    currentMessageRef,
    esRef,
    setFiles,
    fetchFile,
    setHasSessions,
  });

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

  const handleOnboardingComplete = (projectName) => {
    // Onboarding is complete, hide it and load the new project
    setShowConfigurationRequired(false);
    setProject(projectName);
  };

  return (
    <AppGates
      servicesReady={servicesReady}
      setServicesReady={setServicesReady}
      authLoading={authLoading}
      isAuthenticated={isAuthenticated}
      firstRunStatus={firstRunStatus}
      firstRunOverride={firstRunOverride}
      markFirstRunComplete={markFirstRunComplete}
      setFirstRunOverride={setFirstRunOverride}
      showConfigurationRequired={showConfigurationRequired}
      onOnboardingComplete={handleOnboardingComplete}
      projectLoading={projectLoading}
    >
    <AppLayout
      t={t}
      mux={mux}
      isMinimalistic={isMinimalistic}
      themeMode={themeMode}
      toggleMode={toggleMode}
      keyboardShortcuts={keyboardShortcuts}
      chat={{
        messages,
        structuredMessages,
        contextState,
        sessionId,
        hasSessions,
        streaming,
        mode,
        onModeChange: setMode,
        aiModel,
        onAiModelChange: setAiModel,
        onSendMessage: handleSendMessage,
        onAbort: handleAbort,
        retryAvailable,
        onRetry: handleRetry,
        onDismissRetry: () => setRetryAvailable(null),
      }}
      tabs={{
        files,
        setFiles,
        onCloseTab: handleCloseTab,
        previewersConfig,
        onUpdateViewerState: updateViewerState,
      }}
      project={{
        currentProject,
        projectExists,
        onProjectChange: handleProjectChange,
        onSessionChange: handleSessionChange,
        onLoadChat: handleLoadChat,
        onCopySessionId: handleCopySessionId,
      }}
      ui={{
        uiConfig,
        firstRunStatus,
        onResolveHealth: () => setFirstRunOverride(true),
        showBackgroundInfo,
        onShowBackgroundInfoChange: handleShowBackgroundInfoChange,
        onUIConfigChange: (config) => {
          setUiConfig(config);
          if (config?.welcomePage && (config.welcomePage.message || config.welcomePage.quickActions?.length)) {
            setShowWelcomePage(true);
          }
        },
        codingAgent,
        agentClass,
        hasTasks,
        hashRoute,
        showWelcomePage,
        setShowWelcomePage,
        showWelcomeMenu,
        setShowWelcomeMenu,
        welcomeMenuConfig,
        activeContextId,
        onContextChange: handleContextChange,
      }}
      overlays={{
        snackbarOpen, setSnackbarOpen,
        langToast, setLangToast,
        uxToast, setUxToast,
        knowledgeToast, setKnowledgeToast,
        shortcutsOverlayOpen, setShortcutsOverlayOpen,
        askExpertModalApp, setAskExpertModalApp,
        serviceControlOpen, setServiceControlOpen,
        exportModalState, setExportModalState,
      }}
      sidebar={{
        activeSessionIds: streamSessions.activeSessionIds,
        budgetSettings,
        onBudgetSettingsChange: setBudgetSettings,
        onTasksChange: refreshTaskCount,
        allTags,
        collapsed: sidebarCollapsed,
        onCollapse: () => setSidebarCollapsed(true),
        onExpand: () => setSidebarCollapsed(false),
        hasPublicWebsite,
        wikiEntryPath,
        cheatsheetPath,
        applicationBadgeCounts: { 'ask-the-expert': askExpertUnackedCount },
      }}
      hitl={hitl}
    />
    </AppGates>
  );
}
