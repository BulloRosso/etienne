import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'de', 'it', 'zh'],
    ns: [
      'common',
      'a2aAgentsIndicator', 'a2aAgentsSelector', 'a2aSettings',
      'actionsTab', 'agentPersona', 'artifacts', 'artifactsForSession',
      'askUserQuestion', 'autoFilePreview',
      'budgetIndicator', 'budgetOverview', 'budgetSettings',
      'changePassword', 'chatInput', 'chatMessage', 'chatPane',
      'checkpoints', 'codingAgentConfig', 'columnSettings',
      'complianceGuidelineViewer', 'complianceWizard', 'configuration',
      'connectivity', 'contextManager', 'contextSwitcher', 'createFromText',
      'customUI',
      'dashboard',
      'elicitation', 'eventHandling', 'eventLogTab', 'examplesTab', 'excelViewer',
      'filesPanel', 'filesystem', 'fileTreeVirtualList',
      'graphViewer', 'guardrails',
      'healthToast',
      'imageViewer', 'interceptors', 'issues',
      'jsonViewer',
      'knowledgeGraph',
      'liveEvents', 'login',
      'mcpAppRenderer', 'mcpServer', 'mcpToolsIndicator',
      'memoryPanel', 'mermaidViewer', 'mission', 'mqttSettings',
      'notificationMenu',
      'offerGenerator', 'onboarding',
      'pairingRequest', 'permission', 'permissionList', 'planApproval',
      'previewersManager', 'promptEditor',
      'reqViewer', 'responsePane', 'rulesTab',
      'scheduling', 'scrapbook', 'scrapbookNode', 'scrapbookNodeEdit',
      'scrapbookTopics', 'serviceControl',
      'skillIndicator', 'skillsSelector',
      'stickyNote', 'strategy', 'streamingTimeline', 'structuredMessage',
      'subagent',
      'tagManager', 'todoWriteTimeline', 'tokenConsumption', 'toolCallTimeline',
      'useCasesTab', 'userOrders',
      'vectorStore',
      'webHooksTab', 'welcome', 'wizard', 'workflowVisualizer',
    ],
    defaultNS: 'common',
    fallbackNS: 'common',
    backend: {
      loadPath: '/i18n/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nLanguageOverride',
      caches: [],
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: true,
    },
  });

export default i18n;
