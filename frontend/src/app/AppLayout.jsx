// AppLayout — the main application JSX tree (sidebar / appbar / chat+workbench /
// drawers / toasts / dialogs). (Phase 6 of the App.jsx decomposition.)
//
// To avoid a 50-prop signature, related values are passed as grouped objects:
//   chat     — messages + streaming state and handlers
//   tabs     — preview/artifacts state
//   project  — current project + switching handlers
//   ui       — uiConfig, theme, welcome/route flags, agent metadata
//   overlays — toasts, modals, drawers and their setters
//   sidebar  — minimalistic-sidebar inputs
// hitl is spread straight into <HitlDialogs/>.

import React, { useState } from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton, Modal, TextField, Tooltip, Snackbar, Alert, Button, Drawer } from '@mui/material';
import { TbCalendarTime, TbPresentation, TbWorld } from 'react-icons/tb';
import { IoInformationCircle, IoSunnyOutline, IoMoonOutline } from 'react-icons/io5';
import { PiChats } from 'react-icons/pi';

import { MuxSSEProvider } from '../contexts/MuxSSEContext';
import ChatPane from '../components/ChatPane';
import ArtifactsPane from '../components/ArtifactsPane';
import SplitLayout from '../components/SplitLayout';
import ProjectMenu from '../components/ProjectMenu';
import BudgetIndicator from '../components/BudgetIndicator';
import SchedulingOverview from '../components/SchedulingOverview';
import WelcomePage from '../components/WelcomePage';
import WelcomePageMenu from '../components/WelcomePageMenu';
import ContextSwitcher from '../components/ContextSwitcher';
import ContextManager from '../components/ContextManager';
import AppTypeModalHost from '../components/AppTypeModalHost';
import ExportComplianceModal from '../components/ExportComplianceModal';
import HealthBanner from '../components/HealthBanner';
import MinimalisticSidebar from '../components/MinimalisticSidebar';
import KeyboardShortcutsOverlay from '../components/KeyboardShortcutsOverlay';
import ServiceControlDrawer from '../components/ServiceControlDrawer';
import AskExpert from '../components/AskExpert';
import TechnologyRadarPage from '../pages/TechnologyRadarPage';
import HitlDialogs from '../features/hitl/HitlDialogs';

export default function AppLayout({
  t,
  mux,
  isMinimalistic,
  themeMode,
  toggleMode,
  keyboardShortcuts,
  chat,
  tabs,
  project,
  ui,
  overlays,
  sidebar,
  hitl,
}) {
  const { currentProject } = project;
  const { uiConfig } = ui;

  // Leaf state owned entirely by this subtree (Phase 7 — pushed down from App).
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationText, setPresentationText] = useState('');
  const [contextManagerOpen, setContextManagerOpen] = useState(false);

  return (
    <MuxSSEProvider mux={mux}>
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: isMinimalistic ? 'row' : 'column' }}>
      {ui.firstRunStatus?.lastReportSummary && ui.firstRunStatus.lastReportSummary.overall !== 'pass' && (
        <HealthBanner
          summary={ui.firstRunStatus.lastReportSummary}
          onResolve={ui.onResolveHealth}
        />
      )}
      {isMinimalistic && (
        <MinimalisticSidebar
          onNewChat={() => project.onSessionChange(null)}
          onProjectChange={project.onProjectChange}
          onLoadChat={project.onLoadChat}
          currentProject={currentProject}
          sessionId={chat.sessionId}
          streaming={chat.streaming}
          streamingSessionIds={new Set(sidebar.activeSessionIds)}
          onCopySessionId={project.onCopySessionId}
          budgetSettings={sidebar.budgetSettings}
          onBudgetSettingsChange={sidebar.onBudgetSettingsChange}
          onTasksChange={sidebar.onTasksChange}
          showBackgroundInfo={ui.showBackgroundInfo}
          onUIConfigChange={ui.onUIConfigChange}
          codingAgent={ui.codingAgent}
          allTags={sidebar.allTags}
          agentClass={ui.agentClass}
          keyboardShortcuts={keyboardShortcuts}
          collapsed={sidebar.collapsed}
          onCollapse={sidebar.onCollapse}
          onExpand={sidebar.onExpand}
          hasPublicWebsite={sidebar.hasPublicWebsite}
          wikiEntryPath={sidebar.wikiEntryPath}
          cheatsheetPath={sidebar.cheatsheetPath}
          applicationBadgeCounts={sidebar.applicationBadgeCounts}
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
              budgetSettings={sidebar.budgetSettings}
              onSettingsChange={sidebar.onBudgetSettingsChange}
              showBackgroundInfo={ui.showBackgroundInfo}
              mux={mux}
            />
          )}
          {ui.hasTasks && currentProject && (
            <IconButton
              color="inherit"
              onClick={() => setSchedulingOpen(true)}
              sx={{ ml: 3 }}
              title={t('app.scheduledTasks')}
            >
              <TbCalendarTime size={24} />
            </IconButton>
          )}
          {sidebar.hasPublicWebsite && currentProject && (
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
          {currentProject && chat.sessionId && (
            <ContextSwitcher
              projectName={currentProject}
              sessionId={chat.sessionId}
              activeContextId={ui.activeContextId}
              onContextChange={ui.onContextChange}
              onManageContexts={() => setContextManagerOpen(true)}
              sx={{ mr: 2 }}
            />
          )}
          <ProjectMenu
            currentProject={currentProject}
            sessionId={chat.sessionId}
            onCopySessionId={project.onCopySessionId}
            onProjectChange={project.onProjectChange}
            budgetSettings={sidebar.budgetSettings}
            onBudgetSettingsChange={sidebar.onBudgetSettingsChange}
            onTasksChange={sidebar.onTasksChange}
            showBackgroundInfo={ui.showBackgroundInfo}
            onUIConfigChange={ui.onUIConfigChange}
            codingAgent={ui.codingAgent}
          />
        </Toolbar>
      </AppBar>
      )}

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {ui.hashRoute === 'techradar' ? (
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <TechnologyRadarPage />
          </Box>
        ) : ui.showWelcomePage ? (
          <WelcomePage
            welcomeConfig={uiConfig?.welcomePage}
            onSendMessage={(message) => {
              ui.setShowWelcomePage(false);
              chat.onSendMessage(message);
            }}
            onReturnToDefault={() => ui.setShowWelcomePage(false)}
          />
        ) : (
          <SplitLayout
            left={ui.showWelcomeMenu && ui.welcomeMenuConfig ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Slim title bar with Messages toggle so the user can leave the scene */}
                <Box sx={{
                  height: '48px',
                  minHeight: '48px',
                  backgroundColor: themeMode === 'dark' ? '#383838' : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  px: 2,
                  borderBottom: themeMode === 'dark' ? '1px solid #555' : '1px solid #e0e0e0',
                }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {uiConfig?.appBar?.title || currentProject}
                  </Typography>
                  <IconButton
                    onClick={() => ui.setShowWelcomeMenu(false)}
                    title={t('chatPane:backToMessages')}
                    size="small"
                    sx={{ ml: 'auto', color: themeMode === 'dark' ? '#fff' : '#333' }}
                  >
                    <PiChats size={18} />
                  </IconButton>
                </Box>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <WelcomePageMenu config={ui.welcomeMenuConfig} projectName={currentProject} />
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {chat.retryAvailable && (
                  <Alert
                    severity="warning"
                    sx={{ mx: 2, mb: 1 }}
                    onClose={chat.onDismissRetry}
                    action={
                      <Button size="small" color="inherit" onClick={chat.onRetry}>
                        {t('chatPane:retry', 'Retry')}
                      </Button>
                    }
                  >
                    {chat.retryAvailable.reason || t('chatPane:lastRequestFailed', 'The last request failed.')}
                  </Alert>
                )}
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ChatPane messages={chat.messages} structuredMessages={chat.structuredMessages} contextState={chat.contextState} onSendMessage={chat.onSendMessage} onAbort={chat.onAbort} streaming={chat.streaming} mode={chat.mode} onModeChange={chat.onModeChange} aiModel={chat.aiModel} onAiModelChange={chat.onAiModelChange} showBackgroundInfo={ui.showBackgroundInfo} onShowBackgroundInfoChange={ui.onShowBackgroundInfoChange} projectExists={project.projectExists} projectName={currentProject} onSessionChange={project.onSessionChange} hasActiveSession={chat.sessionId !== ''} hasSessions={chat.hasSessions} onShowWelcomePage={() => ui.setShowWelcomePage(true)} uiConfig={uiConfig} codingAgent={ui.codingAgent} sessionId={chat.sessionId} hideHeader={isMinimalistic} hasWelcomeMenu={Boolean(ui.welcomeMenuConfig)} welcomeMenuActive={false} onShowWelcomeMenu={() => ui.setShowWelcomeMenu(true)} onHideWelcomeMenu={() => ui.setShowWelcomeMenu(false)} />
                </Box>
              </Box>
            )}
            right={<ArtifactsPane files={tabs.files} projectName={currentProject} sessionId={chat.sessionId} showBackgroundInfo={ui.showBackgroundInfo} projectExists={project.projectExists} onClearPreview={() => tabs.setFiles([])} onCloseTab={tabs.onCloseTab} previewersConfig={tabs.previewersConfig} autoFilePreviewExtensions={uiConfig?.autoFilePreviewExtensions} onUpdateViewerState={tabs.onUpdateViewerState} />}
          />
        )}
      </Box>

      <Drawer
        anchor="right"
        open={schedulingOpen}
        onClose={() => {
          setSchedulingOpen(false);
          sidebar.onTasksChange();
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
              sidebar.onTasksChange();
            }}
            project={currentProject}
            showBackgroundInfo={ui.showBackgroundInfo}
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
        open={overlays.snackbarOpen}
        autoHideDuration={2000}
        onClose={() => overlays.setSnackbarOpen(false)}
        message={t('app.sessionIdCopied')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />

      {/* Language switch toast */}
      <Snackbar
        open={overlays.langToast.open}
        autoHideDuration={2000}
        onClose={() => overlays.setLangToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => overlays.setLangToast(prev => ({ ...prev, open: false }))}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {overlays.langToast.language}
        </Alert>
      </Snackbar>

      {/* UX mode switch toast */}
      <Snackbar
        open={overlays.uxToast.open}
        autoHideDuration={2000}
        onClose={() => overlays.setUxToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => overlays.setUxToast(prev => ({ ...prev, open: false }))}
          severity="info"
          variant="filled"
          sx={{ width: '100%' }}
        >
          UX: {overlays.uxToast.mode}
        </Alert>
      </Snackbar>

      {/* Knowledge-acquired toast */}
      <Snackbar
        open={overlays.knowledgeToast.open}
        autoHideDuration={10000}
        onClose={() => overlays.setKnowledgeToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => overlays.setKnowledgeToast(prev => ({ ...prev, open: false }))}
          severity="success"
          variant="filled"
          sx={{ width: '100%', fontWeight: 600 }}
        >
          {overlays.knowledgeToast.message}
        </Alert>
      </Snackbar>

      {/* Context Manager Dialog */}
      <ContextManager
        open={contextManagerOpen}
        onClose={() => setContextManagerOpen(false)}
        projectName={currentProject}
        allTags={sidebar.allTags}
        onContextChange={ui.onContextChange}
      />

      {/* Keyboard Shortcuts Overlay */}
      <KeyboardShortcutsOverlay
        open={overlays.shortcutsOverlayOpen}
        onClose={() => overlays.setShortcutsOverlayOpen(false)}
        shortcuts={keyboardShortcuts}
      />

      {/* Ask the expert modal (mounted at App level so the sidebar can trigger it from anywhere) */}
      <AskExpert
        open={overlays.askExpertModalApp.open}
        onClose={() => overlays.setAskExpertModalApp({ open: false, bubbleText: '' })}
        bubbleText={overlays.askExpertModalApp.bubbleText}
        projectName={currentProject}
      />

      {/* Service Control Drawer */}
      <ServiceControlDrawer
        open={overlays.serviceControlOpen}
        onClose={() => overlays.setServiceControlOpen(false)}
      />

      {/* Human-in-the-loop dialogs (elicitation, permission, question, plan, pairing, HITL) */}
      <HitlDialogs currentProject={currentProject} {...hitl} />

      {/* Application-type modal host (sandboxed MCP UI resources) */}
      <AppTypeModalHost />

      {/* Compliance-matrix Export modal — opened by the cockpit's
          open-export postMessage. Mounted at the App root so it works
          regardless of which artifact tab is active. */}
      {overlays.exportModalState.open && (
        <ExportComplianceModal
          open={overlays.exportModalState.open}
          projectName={overlays.exportModalState.projectName}
          initialRfp={overlays.exportModalState.rfp}
          rfps={overlays.exportModalState.rfps}
          onClose={() => overlays.setExportModalState({ open: false, projectName: null, rfp: null, rfps: [] })}
        />
      )}
    </Box>
    </MuxSSEProvider>
  );
}
