/**
 * Migration script: Split monolithic i18n JSON files into per-component namespace files.
 *
 * Usage:  node scripts/split-i18n.mjs
 *
 * Input:  frontend/public/i18n/{en,de,it,zh}.json   (flat key format: "prefix.key": "value")
 * Output: frontend/public/i18n/{en,de,it,zh}/{namespace}.json
 *
 * Shared prefixes (used by >1 component) are merged into common.json.
 * Component-specific prefixes get their own file with the prefix stripped from keys.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const I18N_DIR = path.resolve(__dirname, '..', 'frontend', 'public', 'i18n');
const LANGUAGES = ['en', 'de', 'it', 'zh'];

// ---------------------------------------------------------------------------
// Component-to-prefix mapping (extracted from codebase analysis)
// ---------------------------------------------------------------------------
const COMPONENT_PREFIXES = {
  'App.jsx':                       ['app', 'shortcuts'],
  'A2AAgentsIndicator.jsx':        ['a2aAgentsIndicator'],
  'A2AAgentsSelector.jsx':         ['a2aAgentsSelector'],
  'A2ASettings.jsx':               ['a2aSettings', 'common', 'skills'],
  'AgentPersonaPersonality.jsx':   ['agentPersona', 'common'],
  'ArtifactsForSession.jsx':       ['artifactsForSession'],
  'ArtifactsPane.jsx':             ['artifacts'],
  'AskUserQuestionModal.jsx':      ['askUserQuestion', 'common'],
  'AttachmentSaveModal.jsx':       ['imapInbox'],
  'BudgetIndicator.jsx':           ['budgetIndicator'],
  'BudgetOverview.jsx':            ['budgetOverview'],
  'BudgetSettings.jsx':            ['budgetSettings', 'common'],
  'ChangePasswordDialog.jsx':      ['changePassword', 'common'],
  'ChatInput.jsx':                 ['chatInput'],
  'ChatMessage.jsx':               ['chatMessage'],
  'ChatPane.jsx':                  ['chatPane', 'common'],
  'CheckpointsPane.jsx':           ['checkpoints', 'common'],
  'CodingAgentConfigDialog.jsx':   ['codingAgentConfig', 'common'],
  'ColumnSettingsDialog.jsx':      ['columnSettings', 'common'],
  'ComplianceGuidelineViewer.jsx': ['common', 'complianceGuidelineViewer'],
  'ComplianceReleaseWizard.jsx':   ['common', 'complianceWizard', 'researchDocument'],
  'ActionsTab.jsx':                ['actionsTab', 'common'],
  'EventLogTab.jsx':               ['eventLogTab'],
  'ExamplesTab.jsx':               ['examplesTab'],
  'RulesTab.jsx':                  ['common', 'rulesTab'],
  'UseCasesTab.jsx':               ['useCasesTab'],
  'WebHooksTab.jsx':               ['common', 'webHooksTab'],
  'ConnectivitySettings.jsx':      ['connectivity'],
  'ContextManager.jsx':            ['common', 'contextManager'],
  'ContextSwitcher.jsx':           ['common', 'contextSwitcher'],
  'ConversationSearch.jsx':        ['conversationSearch', 'sessionPane'],
  'CreateFromTextDialog.jsx':      ['common', 'createFromText'],
  'CreateProjectWizard.jsx':       ['common', 'wizard'],
  'CustomUI.jsx':                  ['common', 'customUI'],
  'DashboardGrid.jsx':             ['app', 'dashboard', 'projectMenu', 'teamUp'],
  'DocxViewer.jsx':                ['common'],
  'DonClippoModal.jsx':            ['common', 'donClippo'],
  'ElicitationModal.jsx':          ['common', 'elicitation'],
  'EventHandling.jsx':             ['common', 'eventHandling'],
  'ExcelViewer.jsx':               ['excelViewer'],
  'FilesPanel.jsx':                ['filesPanel', 'imapInbox', 'sidebar'],
  'Filesystem.jsx':                ['common', 'filesystem'],
  'FileTreeVirtualList.jsx':       ['fileTreeVirtualList'],
  'GraphViewer.jsx':               ['graphViewer'],
  'GuardrailsSettings.jsx':        ['common', 'guardrails'],
  'HealthToast.jsx':               ['healthToast'],
  'HITLApprovalModal.jsx':         ['common', 'hitl'],
  'ImageGalleryModal.jsx':         ['markdownViewer'],
  'ImageViewer.jsx':               ['common', 'imageViewer'],
  'IMAPInboxViewer.jsx':           ['imapInbox'],
  'Interceptors.jsx':              ['interceptors'],
  'IssueManager.jsx':              ['issues'],
  'JSONViewer.jsx':                ['jsonViewer'],
  'KeyboardShortcutsOverlay.jsx':  ['shortcuts'],
  'KnowledgeGraphBrowser.jsx':     ['common', 'knowledgeGraph'],
  'LiveEventsTab.jsx':             ['liveEvents'],
  'LoginDialog.jsx':               ['common', 'login'],
  'MarkdownViewer.jsx':            ['common', 'markdownViewer'],
  'McpAppRenderer.jsx':            ['mcpAppRenderer'],
  'MCPServerConfiguration.jsx':    ['common', 'mcpServer', 'mcpToolsSelector'],
  'McpToolsIndicator.jsx':         ['common', 'donClippo', 'mcpToolsIndicator', 'skillCatalog'],
  'McpToolsSelector.jsx':          ['common', 'mcpToolsSelector', 'skillCatalog'],
  'MemoryPanel.jsx':               ['common', 'memoryPanel'],
  'MermaidViewer.jsx':             ['mermaidViewer'],
  'MinimalisticSidebar.jsx':       ['conversationSearch', 'sidebar'],
  'Mission.jsx':                   ['common', 'mission'],
  'MQTTSettings.jsx':              ['common', 'mqttSettings'],
  'NotificationMenu.jsx':          ['notificationMenu'],
  'OfferGeneratorModal.jsx':       ['common', 'offerGenerator'],
  'Onboarding.jsx':                ['onboarding'],
  'PairingRequestModal.jsx':       ['common', 'pairingRequest'],
  'PdfViewer.jsx':                 ['common'],
  'PermissionList.jsx':            ['common', 'permissionList'],
  'PermissionModal.jsx':           ['common', 'permission'],
  'PlanApprovalModal.jsx':         ['common', 'planApproval'],
  'PowerUpSection.jsx':            ['skills'],
  'PreviewersManager.jsx':         ['common', 'previewersManager'],
  'ProjectListModal.jsx':          ['sidebar'],
  'ProjectMenu.jsx':               ['common', 'projectMenu'],
  'PromptEditor.jsx':              ['common', 'promptEditor'],
  'RequirementsViewer.jsx':        ['reqViewer'],
  'ResearchDocument.jsx':          ['common', 'researchDocument'],
  'ResponsePane.tsx':              ['responsePane'],
  'SchedulingOverview.jsx':        ['common', 'scheduling'],
  'Scrapbook.jsx':                 ['common', 'scrapbook'],
  'ScrapbookNode.jsx':             ['scrapbookNode'],
  'ScrapbookNodeEdit.jsx':         ['common', 'scrapbookNodeEdit'],
  'ScrapbookTopics.jsx':           ['common', 'scrapbookTopics'],
  'ServiceControlDrawer.jsx':      ['serviceControl', 'serviceSettings'],
  'ServiceSettings.jsx':           ['common', 'serviceSettings'],
  'SessionPane.jsx':               ['common', 'sessionPane'],
  'SettingsModal.jsx':             ['common', 'projectMenu', 'shortcuts', 'sidebar'],
  'SkillCatalog.jsx':              ['common', 'skillCatalog'],
  'SkillIndicator.jsx':            ['donClippo', 'skillIndicator'],
  'SkillsSelector.jsx':            ['skillsSelector'],
  'SkillsSettings.jsx':            ['common', 'skills'],
  'StickyNoteNode.jsx':            ['common', 'stickyNote'],
  'Strategy.jsx':                  ['common', 'strategy'],
  'StructuredMessage.jsx':         ['structuredMessage', 'timeline'],
  'SubagentConfiguration.jsx':     ['common', 'subagent'],
  'TagManager.jsx':                ['common', 'tagManager'],
  'TeamUpDialog.jsx':              ['common', 'teamUp'],
  'TodoWriteTimeline.jsx':         ['todoWriteTimeline'],
  'TokenConsumptionPane.tsx':      ['tokenConsumption'],
  'ToolCallTimeline.jsx':          ['timeline', 'toolCallTimeline'],
  'UserOrders.jsx':                ['userOrders'],
  'VectorStoreItems.jsx':          ['vectorStore'],
  'WelcomePage.jsx':               ['welcome'],
  'WorkflowVisualizer.jsx':        ['workflowVisualizer'],
};

// ---------------------------------------------------------------------------
// Determine which prefixes are shared (used by >1 component)
// ---------------------------------------------------------------------------
function computeSharedPrefixes() {
  const prefixToComponents = {};
  for (const [comp, prefixes] of Object.entries(COMPONENT_PREFIXES)) {
    for (const p of prefixes) {
      if (!prefixToComponents[p]) prefixToComponents[p] = [];
      prefixToComponents[p].push(comp);
    }
  }

  const shared = new Set();
  for (const [prefix, comps] of Object.entries(prefixToComponents)) {
    if (comps.length > 1) {
      shared.add(prefix);
    }
  }
  // 'common' is always shared
  shared.add('common');
  return shared;
}

// ---------------------------------------------------------------------------
// Split one language file
// ---------------------------------------------------------------------------
function splitLanguageFile(lang, sharedPrefixes) {
  const inputPath = path.join(I18N_DIR, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const keys = Object.keys(data);

  // Group by prefix
  const groups = {};  // prefix -> { strippedKey: value }
  let orphanCount = 0;

  for (const fullKey of keys) {
    const dotIndex = fullKey.indexOf('.');
    if (dotIndex === -1) {
      // No prefix — goes into common
      if (!groups['common']) groups['common'] = {};
      groups['common'][fullKey] = data[fullKey];
      orphanCount++;
      continue;
    }
    const prefix = fullKey.substring(0, dotIndex);
    const remainder = fullKey.substring(dotIndex + 1);

    if (sharedPrefixes.has(prefix)) {
      // Shared prefix → goes into common.json, keeps the full key
      if (!groups['common']) groups['common'] = {};
      groups['common'][fullKey] = data[fullKey];
    } else {
      // Component-specific → separate file, strip prefix
      if (!groups[prefix]) groups[prefix] = {};
      groups[prefix][remainder] = data[fullKey];
    }
  }

  // Write output files
  const outDir = path.join(I18N_DIR, lang);
  fs.mkdirSync(outDir, { recursive: true });

  let totalOutputKeys = 0;
  const namespaces = [];

  for (const [ns, translations] of Object.entries(groups)) {
    const outPath = path.join(outDir, `${ns}.json`);
    const sorted = {};
    for (const k of Object.keys(translations).sort()) {
      sorted[k] = translations[k];
    }
    fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    const count = Object.keys(sorted).length;
    totalOutputKeys += count;
    namespaces.push({ ns, count });
  }

  // Validation
  const inputKeyCount = keys.length;
  if (totalOutputKeys !== inputKeyCount) {
    console.error(`  ERROR: Key count mismatch for ${lang}! Input: ${inputKeyCount}, Output: ${totalOutputKeys}`);
    process.exit(1);
  }

  return { inputKeyCount, namespaces, orphanCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const sharedPrefixes = computeSharedPrefixes();

console.log('Shared prefixes (→ common.json):');
console.log('  ' + [...sharedPrefixes].sort().join(', '));
console.log();

for (const lang of LANGUAGES) {
  console.log(`Processing ${lang}.json ...`);
  const { inputKeyCount, namespaces, orphanCount } = splitLanguageFile(lang, sharedPrefixes);
  console.log(`  ${inputKeyCount} keys → ${namespaces.length} namespace files`);
  if (orphanCount > 0) {
    console.log(`  ${orphanCount} key(s) without prefix → common.json`);
  }
  for (const { ns, count } of namespaces.sort((a, b) => a.ns.localeCompare(b.ns))) {
    console.log(`    ${ns}.json: ${count} keys`);
  }
  console.log();
}

// Print the full namespace list for i18n.js config
const allNamespaces = new Set();
for (const lang of LANGUAGES) {
  const outDir = path.join(I18N_DIR, lang);
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.json')) allNamespaces.add(f.replace('.json', ''));
  }
}
console.log('All namespaces for i18n.js config:');
console.log(JSON.stringify([...allNamespaces].sort(), null, 2));
