/**
 * Update React component files to use i18next namespaces.
 *
 * For each component:
 * 1. Updates useTranslation() → useTranslation([...namespaces])
 * 2. Updates t('prefix.key') → t('prefix:key') for component-specific (non-shared) prefixes
 * 3. Shared prefix keys stay unchanged (accessed via common namespace / defaultNS)
 *
 * Usage: node scripts/update-components-i18n.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', 'frontend', 'src');

// Shared prefixes — these go into common.json, so their t() keys stay unchanged
const SHARED_PREFIXES = new Set([
  'common', 'app', 'conversationSearch', 'donClippo', 'imapInbox',
  'markdownViewer', 'mcpToolsSelector', 'projectMenu', 'researchDocument',
  'serviceSettings', 'sessionPane', 'shortcuts', 'sidebar', 'skillCatalog',
  'skills', 'teamUp', 'timeline',
]);

// Component file → [list of prefixes used]
const COMPONENT_MAP = {
  'components/A2AAgentsIndicator.jsx':        ['a2aAgentsIndicator'],
  'components/A2AAgentsSelector.jsx':         ['a2aAgentsSelector'],
  'components/A2ASettings.jsx':               ['a2aSettings', 'common', 'skills'],
  'components/AgentPersonaPersonality.jsx':    ['agentPersona', 'common'],
  'components/ArtifactsForSession.jsx':        ['artifactsForSession'],
  'components/ArtifactsPane.jsx':              ['artifacts'],
  'components/AskUserQuestionModal.jsx':       ['askUserQuestion', 'common'],
  'components/AttachmentSaveModal.jsx':        ['imapInbox'],
  'components/BudgetIndicator.jsx':            ['budgetIndicator'],
  'components/BudgetOverview.jsx':             ['budgetOverview'],
  'components/BudgetSettings.jsx':             ['budgetSettings', 'common'],
  'components/ChangePasswordDialog.jsx':       ['changePassword', 'common'],
  'components/ChatInput.jsx':                  ['chatInput'],
  'components/ChatMessage.jsx':                ['chatMessage'],
  'components/ChatPane.jsx':                   ['chatPane', 'common'],
  'components/CheckpointsPane.jsx':            ['checkpoints', 'common'],
  'components/CodingAgentConfigDialog.jsx':    ['codingAgentConfig', 'common'],
  'components/ColumnSettingsDialog.jsx':       ['columnSettings', 'common'],
  'components/ComplianceGuidelineViewer.jsx':  ['common', 'complianceGuidelineViewer'],
  'components/ComplianceReleaseWizard.jsx':    ['common', 'complianceWizard', 'researchDocument'],
  'components/conditionmonitoring/ActionsTab.jsx':    ['actionsTab', 'common'],
  'components/conditionmonitoring/EventLogTab.jsx':   ['eventLogTab'],
  'components/conditionmonitoring/ExamplesTab.jsx':   ['examplesTab'],
  'components/conditionmonitoring/RulesTab.jsx':      ['common', 'rulesTab'],
  'components/conditionmonitoring/UseCasesTab.jsx':   ['useCasesTab'],
  'components/conditionmonitoring/WebHooksTab.jsx':   ['common', 'webHooksTab'],
  'components/ConnectivitySettings.jsx':       ['connectivity'],
  'components/ContextManager.jsx':             ['common', 'contextManager'],
  'components/ContextSwitcher.jsx':            ['common', 'contextSwitcher'],
  'components/ConversationSearch.jsx':         ['conversationSearch', 'sessionPane'],
  'components/CreateFromTextDialog.jsx':       ['common', 'createFromText'],
  'components/CreateProjectWizard.jsx':        ['common', 'wizard'],
  'components/CustomUI.jsx':                   ['common', 'customUI'],
  'components/DashboardGrid.jsx':              ['app', 'dashboard', 'projectMenu', 'teamUp'],
  'components/DocxViewer.jsx':                 ['common'],
  'components/DonClippoModal.jsx':             ['common', 'donClippo'],
  'components/ElicitationModal.jsx':           ['common', 'elicitation'],
  'components/EventHandling.jsx':              ['common', 'eventHandling'],
  'components/ExcelViewer.jsx':                ['excelViewer'],
  'components/FilesPanel.jsx':                 ['filesPanel', 'imapInbox', 'sidebar'],
  'components/Filesystem.jsx':                 ['common', 'filesystem'],
  'components/FileTreeVirtualList.jsx':        ['fileTreeVirtualList'],
  'components/GraphViewer.jsx':                ['graphViewer'],
  'components/GuardrailsSettings.jsx':         ['common', 'guardrails'],
  'components/HealthToast.jsx':                ['healthToast'],
  'components/HITLApprovalModal.jsx':          ['common', 'hitl'],
  'components/ImageGalleryModal.jsx':          ['markdownViewer'],
  'components/ImageViewer.jsx':                ['common', 'imageViewer'],
  'components/IMAPInboxViewer.jsx':            ['imapInbox'],
  'components/Interceptors.jsx':               ['interceptors'],
  'components/IssueManager.jsx':               ['issues'],
  'components/JSONViewer.jsx':                 ['jsonViewer'],
  'components/KeyboardShortcutsOverlay.jsx':   ['shortcuts'],
  'components/KnowledgeGraphBrowser.jsx':      ['common', 'knowledgeGraph'],
  'components/LiveEventsTab.jsx':              ['liveEvents'],
  'components/LoginDialog.jsx':                ['common', 'login'],
  'components/MarkdownViewer.jsx':             ['common', 'markdownViewer'],
  'components/McpAppRenderer.jsx':             ['mcpAppRenderer'],
  'components/MCPServerConfiguration.jsx':     ['common', 'mcpServer', 'mcpToolsSelector'],
  'components/McpToolsIndicator.jsx':          ['common', 'donClippo', 'mcpToolsIndicator', 'skillCatalog'],
  'components/McpToolsSelector.jsx':           ['common', 'mcpToolsSelector', 'skillCatalog'],
  'components/MemoryPanel.jsx':                ['common', 'memoryPanel'],
  'components/MermaidViewer.jsx':              ['mermaidViewer'],
  'components/MinimalisticSidebar.jsx':        ['conversationSearch', 'sidebar'],
  'components/Mission.jsx':                    ['common', 'mission'],
  'components/MQTTSettings.jsx':               ['common', 'mqttSettings'],
  'components/NotificationMenu.jsx':           ['notificationMenu'],
  'components/OfferGeneratorModal.jsx':        ['common', 'offerGenerator'],
  'components/Onboarding.jsx':                 ['onboarding'],
  'components/PairingRequestModal.jsx':        ['common', 'pairingRequest'],
  'components/PdfViewer.jsx':                  ['common'],
  'components/PermissionList.jsx':             ['common', 'permissionList'],
  'components/PermissionModal.jsx':            ['common', 'permission'],
  'components/PlanApprovalModal.jsx':          ['common', 'planApproval'],
  'components/PowerUpSection.jsx':             ['skills'],
  'components/PreviewersManager.jsx':          ['common', 'previewersManager'],
  'components/ProjectListModal.jsx':           ['sidebar'],
  'components/ProjectMenu.jsx':                ['common', 'projectMenu'],
  'components/PromptEditor.jsx':               ['common', 'promptEditor'],
  'components/RequirementsViewer.jsx':         ['reqViewer'],
  'components/ResearchDocument.jsx':           ['common', 'researchDocument'],
  'components/ResponsePane.tsx':               ['responsePane'],
  'components/SchedulingOverview.jsx':         ['common', 'scheduling'],
  'components/Scrapbook.jsx':                  ['common', 'scrapbook'],
  'components/ScrapbookNode.jsx':              ['scrapbookNode'],
  'components/ScrapbookNodeEdit.jsx':          ['common', 'scrapbookNodeEdit'],
  'components/ScrapbookTopics.jsx':            ['common', 'scrapbookTopics'],
  'components/ServiceControlDrawer.jsx':       ['serviceControl', 'serviceSettings'],
  'components/ServiceSettings.jsx':            ['common', 'serviceSettings'],
  'components/SessionPane.jsx':                ['common', 'sessionPane'],
  'components/SettingsModal.jsx':              ['common', 'projectMenu', 'shortcuts', 'sidebar'],
  'components/SkillCatalog.jsx':               ['common', 'skillCatalog'],
  'components/SkillIndicator.jsx':             ['donClippo', 'skillIndicator'],
  'components/SkillsSelector.jsx':             ['skillsSelector'],
  'components/SkillsSettings.jsx':             ['common', 'skills'],
  'components/StickyNoteNode.jsx':             ['common', 'stickyNote'],
  'components/Strategy.jsx':                   ['common', 'strategy'],
  'components/StructuredMessage.jsx':          ['structuredMessage', 'timeline'],
  'components/SubagentConfiguration.jsx':      ['common', 'subagent'],
  'components/TagManager.jsx':                 ['common', 'tagManager'],
  'components/TeamUpDialog.jsx':               ['common', 'teamUp'],
  'components/TodoWriteTimeline.jsx':          ['todoWriteTimeline'],
  'components/TokenConsumptionPane.tsx':       ['tokenConsumption'],
  'components/ToolCallTimeline.jsx':           ['timeline', 'toolCallTimeline'],
  'components/UserOrders.jsx':                 ['userOrders'],
  'components/VectorStoreItems.jsx':           ['vectorStore'],
  'components/WelcomePage.jsx':                ['welcome'],
  'components/WorkflowVisualizer.jsx':         ['workflowVisualizer'],
  'App.jsx':                                   ['app', 'shortcuts'],
};

let filesUpdated = 0;
let filesSkipped = 0;
let errors = [];

for (const [relPath, prefixes] of Object.entries(COMPONENT_MAP)) {
  const filePath = path.join(SRC_DIR, relPath);

  if (!fs.existsSync(filePath)) {
    errors.push(`File not found: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // --- Step 1: Determine which namespaces this component needs ---
  // Non-shared prefixes become their own namespace; shared ones are in 'common'
  const componentNamespaces = new Set();
  for (const p of prefixes) {
    if (SHARED_PREFIXES.has(p)) {
      componentNamespaces.add('common');
    } else {
      componentNamespaces.add(p);
    }
  }

  // Build the namespace array: put component-specific first, then 'common'
  const nsArray = [...componentNamespaces].filter(n => n !== 'common');
  nsArray.sort();
  if (componentNamespaces.has('common')) {
    nsArray.push('common');
  }

  // --- Step 2: Update useTranslation() call ---
  // Handle both: const { t } = useTranslation() and const { t, i18n } = useTranslation()
  const useTransRegex = /useTranslation\(\s*\)/g;

  if (nsArray.length === 1 && nsArray[0] === 'common') {
    // Only uses common — keep useTranslation() as-is (common is defaultNS)
    // No namespace argument needed
  } else {
    const nsArg = JSON.stringify(nsArray);
    const newContent = content.replace(useTransRegex, `useTranslation(${nsArg})`);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  }

  // --- Step 3: Update t() calls for component-specific prefixes ---
  // For non-shared prefixes: t('prefix.key') → t('prefix:key')
  // For shared prefixes: leave unchanged (they're in common namespace, accessed via dot notation)
  for (const p of prefixes) {
    if (SHARED_PREFIXES.has(p)) continue; // shared → stays as t('prefix.key')

    // Replace t('prefix.key') and t("prefix.key") and t(`prefix.key`)
    // Also handle t('prefix.key', ...) with additional args
    const patterns = [
      new RegExp(`t\\('${p}\\.`, 'g'),
      new RegExp(`t\\("${p}\\.`, 'g'),
      new RegExp(`t\\(\`${p}\\.`, 'g'),
    ];
    const replacements = [
      `t('${p}:`,
      `t("${p}:`,
      `t(\`${p}:`,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const newContent = content.replace(patterns[i], replacements[i]);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    filesUpdated++;
    console.log(`  Updated: ${relPath} → namespaces: [${nsArray.join(', ')}]`);
  } else {
    filesSkipped++;
    console.log(`  Skipped (no changes): ${relPath}`);
  }
}

console.log(`\nDone. ${filesUpdated} files updated, ${filesSkipped} files unchanged.`);
if (errors.length > 0) {
  console.log('\nErrors:');
  for (const e of errors) console.log(`  ${e}`);
}
