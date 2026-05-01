import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  DialogActions,
  Button,
  Drawer,
  MenuItem,
  ListItemText,
  TextField,
  Tabs,
  Tab
} from '@mui/material';
import { Close, AddOutlined } from '@mui/icons-material';
import { PiGraphLight } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';

import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import { filePreviewHandler } from '../services/FilePreviewHandler';
import DashboardGrid from './DashboardGrid';
import SchedulingOverview from './SchedulingOverview';
import GuardrailsSettings from './GuardrailsSettings';
import SubagentConfiguration from './SubagentConfiguration';
import MQTTSettings from './MQTTSettings';
import CustomUI from './CustomUI';
import KnowledgeGraphBrowser from './KnowledgeGraphBrowser';
import SkillsSettings from './SkillsSettings';
import SkillCatalog from './SkillCatalog';
import ContextManager from './ContextManager';
import EventHandling from './EventHandling';
import OntologyCoreEditor from './ontology-core/OntologyCoreEditor';
import ChangePasswordDialog from './ChangePasswordDialog';
import TeamUpDialog from './TeamUpDialog';
import AgentPersonaPersonality from './AgentPersonaPersonality';
import ServiceControlDrawer from './ServiceControlDrawer';
import IssueManager from './IssueManager';

export default function SettingsModal({
  open,
  onClose,
  currentProject,
  sessionId,
  onCopySessionId,
  budgetSettings,
  onBudgetSettingsChange,
  onTasksChange,
  showBackgroundInfo,
  onUIConfigChange,
  onProjectChange,
  codingAgent = 'anthropic',
  allTags = [],
  keyboardShortcuts = {},
}) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();

  // Sub-dialog states
  const [aboutOpen, setAboutOpen] = useState(false);
  const [budgetSettingsOpen, setBudgetSettingsOpen] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [guardrailsOpen, setGuardrailsOpen] = useState(false);
  const [subagentsOpen, setSubagentsOpen] = useState(false);
  const [externalEventsOpen, setExternalEventsOpen] = useState(false);
  const [customUIOpen, setCustomUIOpen] = useState(false);
  const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skillCatalogOpen, setSkillCatalogOpen] = useState(false);
  const [contextsOpen, setContextsOpen] = useState(false);
  const [conditionMonitoringOpen, setConditionMonitoringOpen] = useState(false);
  const [ontologyCoreOpen, setOntologyCoreOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [scrapbookListOpen, setScrapbookListOpen] = useState(false);
  const [scrapbooks, setScrapbooks] = useState([]);
  const [createScrapbookDialogOpen, setCreateScrapbookDialogOpen] = useState(false);
  const [newScrapbookName, setNewScrapbookName] = useState('');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [serviceControlOpen, setServiceControlOpen] = useState(false);
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [teamUpOpen, setTeamUpOpen] = useState(false);
  const [useGraphLayer, setUseGraphLayer] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);
  const [shortcutsTab, setShortcutsTab] = useState(0);

  const closeSettingsAndOpen = (setter) => {
    onClose();
    setter(true);
  };

  const handleDashboardItemClick = (itemId) => {
    switch (itemId) {
      case 'budget': closeSettingsAndOpen(setBudgetSettingsOpen); break;
      case 'scheduling': closeSettingsAndOpen(setSchedulingOpen); break;
      case 'guardrails': closeSettingsAndOpen(setGuardrailsOpen); break;
      case 'subagents': closeSettingsAndOpen(setSubagentsOpen); break;
      case 'customui': closeSettingsAndOpen(setCustomUIOpen); break;
      case 'knowledge': closeSettingsAndOpen(setKnowledgeGraphOpen); break;
      case 'skills': closeSettingsAndOpen(setSkillsOpen); break;
      case 'externalevents': closeSettingsAndOpen(setExternalEventsOpen); break;
      case 'contexts': closeSettingsAndOpen(setContextsOpen); break;
      case 'conditionmonitoring': closeSettingsAndOpen(setConditionMonitoringOpen); break;
      case 'issues': closeSettingsAndOpen(setIssuesOpen); break;
      case 'ontologycore': closeSettingsAndOpen(setOntologyCoreOpen); break;
      case 'scrapbook': fetchScrapbooks(); closeSettingsAndOpen(setScrapbookListOpen); break;
      case 'a2a': closeSettingsAndOpen(setTeamUpOpen); break;
      case 'skillstore': closeSettingsAndOpen(setSkillCatalogOpen); break;
      default: break;
    }
  };

  const fetchScrapbooks = async () => {
    if (!currentProject) return;
    try {
      const response = await apiFetch(`/api/workspace/${currentProject}/scrapbooks`);
      if (response.ok) {
        const data = await response.json();
        setScrapbooks(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch scrapbooks:', error);
    }
  };

  const handleOpenScrapbookFile = (scrapbook) => {
    filePreviewHandler.handlePreview(scrapbook.filename, currentProject);
    setScrapbookListOpen(false);
  };

  const handleCreateScrapbook = async () => {
    const name = newScrapbookName.trim();
    if (!name) return;
    try {
      const response = await apiFetch(`/api/workspace/${currentProject}/scrapbooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        const result = await response.json();
        setCreateScrapbookDialogOpen(false);
        setNewScrapbookName('');
        setScrapbookListOpen(false);
        handleOpenScrapbookFile(result);
      }
    } catch (error) {
      console.error('Failed to create scrapbook:', error);
    }
  };

  const handleBudgetToggle = async (event) => {
    const enabled = event.target.checked;
    try {
      const response = await apiFetch(`/api/budget-monitoring/${currentProject}/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled, limit: budgetSettings?.limit || 0 }),
      });
      if (response.ok && onBudgetSettingsChange) {
        onBudgetSettingsChange({ enabled, limit: budgetSettings?.limit || 0 });
      }
    } catch (error) {
      console.error('Failed to update budget settings:', error);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('sidebar.settings')}
          <IconButton onClick={onClose} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 0 }}>
          <DashboardGrid
            fluid
            hideHeader
            currentProject={currentProject}
            sessionId={sessionId}
            codingAgent={codingAgent}
            onCopySessionId={onCopySessionId}
            onItemClick={handleDashboardItemClick}
            onClose={onClose}
            onAboutClick={() => { onClose(); setAboutOpen(true); }}
            user={null}
            onLogout={() => {}}
            onSettingsClick={() => { onClose(); setChangePasswordOpen(true); }}
            onServiceControlClick={() => closeSettingsAndOpen(setServiceControlOpen)}
            onAgentPersonaClick={() => closeSettingsAndOpen(setPersonaDialogOpen)}
          />

          {/* Keyboard Shortcuts */}
          {Object.keys(keyboardShortcuts).length > 0 && (() => {
            const grouped = {};
            for (const [combo, shortcut] of Object.entries(keyboardShortcuts)) {
              const category = shortcut.category || t('shortcuts.categoryGeneral', 'General');
              if (!grouped[category]) grouped[category] = [];
              grouped[category].push({ combo, ...shortcut });
            }
            const categories = Object.keys(grouped);
            const activeCategory = categories[shortcutsTab] || categories[0];
            const activeItems = grouped[activeCategory] || [];
            return (
              <Box sx={{ mt: 3, px: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
                  {t('shortcuts.title', 'Keyboard Shortcuts')}
                </Typography>
                <Tabs
                  value={shortcutsTab < categories.length ? shortcutsTab : 0}
                  onChange={(_, v) => setShortcutsTab(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ minHeight: 36, mb: 1, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.82rem' } }}
                >
                  {categories.map((cat) => (
                    <Tab key={cat} label={cat} />
                  ))}
                </Tabs>
                {activeItems.map(({ combo, description }) => (
                  <Box
                    key={combo}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 0.5,
                      borderBottom: '1px solid',
                      borderColor: themeMode === 'dark' ? '#444' : '#f0f0f0',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                      {description}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 2 }}>
                      {combo.split('+').map((part, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <Typography variant="body2" sx={{ mx: 0.25, color: 'text.secondary', fontSize: '0.7rem' }}>
                              +
                            </Typography>
                          )}
                          <Box
                            component="kbd"
                            sx={{
                              display: 'inline-block',
                              px: 0.75,
                              py: 0.25,
                              mx: 0.25,
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              lineHeight: 1.4,
                              color: themeMode === 'dark' ? '#e0e0e0' : '#333',
                              backgroundColor: themeMode === 'dark' ? '#444' : '#f5f5f5',
                              border: '1px solid',
                              borderColor: themeMode === 'dark' ? '#666' : '#ccc',
                              borderRadius: '4px',
                              boxShadow: themeMode === 'dark' ? '0 1px 0 #333' : '0 1px 0 #bbb',
                              minWidth: '22px',
                              textAlign: 'center',
                              textTransform: part.toLowerCase() === 'ctrl' ? 'none' : 'uppercase',
                            }}
                          >
                            {part.toLowerCase() === 'ctrl' ? 'Ctrl' : part.toLowerCase() === 'shift' ? 'Shift' : part.toLowerCase() === 'alt' ? 'Alt' : part}
                          </Box>
                        </React.Fragment>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs — identical to ProjectMenu */}

      <AgentPersonaPersonality
        open={personaDialogOpen}
        onClose={() => setPersonaDialogOpen(false)}
        onInstalled={async (projectName) => {
          setPersonaDialogOpen(false);
          if (onProjectChange) onProjectChange(projectName);
        }}
      />

      <TeamUpDialog
        open={teamUpOpen}
        onClose={() => setTeamUpOpen(false)}
        onPaired={() => setTeamUpOpen(false)}
      />

      <Dialog open={aboutOpen} onClose={() => { setAboutOpen(false); setCurrentTab(0); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('projectMenu.aboutTitle')}
          <IconButton onClick={() => { setAboutOpen(false); setCurrentTab(0); }} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', minHeight: '400px', p: 2 }}>
            <Box sx={{ flex: '0 0 auto' }}>
              <img src="/etienne-logo.png" alt="Etienne Logo" style={{ height: '220px', width: 'auto' }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography><strong>{t('projectMenu.codingAgentHarness')}</strong><br />{t('projectMenu.intentionDescription')}</Typography>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetSettingsOpen} onClose={() => setBudgetSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('projectMenu.budgetMonitoringTitle')}
          <IconButton onClick={() => setBudgetSettingsOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            <FormControlLabel
              control={<Switch checked={budgetSettings?.enabled || false} onChange={handleBudgetToggle} />}
              label={t('projectMenu.enableBudgetMonitoring')}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {t('projectMenu.trackAICosts')}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBudgetSettingsOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor="right" open={schedulingOpen} onClose={() => { setSchedulingOpen(false); if (onTasksChange) onTasksChange(); }} sx={{ '& .MuiDrawer-paper': { width: '500px', maxWidth: '90vw' } }}>
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <SchedulingOverview open={schedulingOpen} onClose={() => { setSchedulingOpen(false); if (onTasksChange) onTasksChange(); }} project={currentProject} />
        </Box>
      </Drawer>

      <GuardrailsSettings open={guardrailsOpen} onClose={() => setGuardrailsOpen(false)} project={currentProject} showBackgroundInfo={showBackgroundInfo} />

      <Dialog open={subagentsOpen} onClose={() => setSubagentsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('projectMenu.subagentsConfigTitle')}
          <IconButton onClick={() => setSubagentsOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <SubagentConfiguration project={currentProject} codingAgent={codingAgent} />
        </DialogContent>
      </Dialog>

      <MQTTSettings open={externalEventsOpen} onClose={() => setExternalEventsOpen(false)} project={currentProject} />

      <Dialog open={customUIOpen} onClose={() => setCustomUIOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('projectMenu.customizeUITitle')}
          <IconButton onClick={() => setCustomUIOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <CustomUI project={currentProject} onSave={(config) => { if (onUIConfigChange) onUIConfigChange(config); setCustomUIOpen(false); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={knowledgeGraphOpen} onClose={() => setKnowledgeGraphOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PiGraphLight style={{ fontSize: '24px' }} />
            <span>{t('projectMenu.knowledgeBase')}</span>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControlLabel control={<Switch checked={useGraphLayer} onChange={(e) => setUseGraphLayer(e.target.checked)} size="small" />} label={t('projectMenu.useGraphLayer')} sx={{ m: 0 }} />
            <IconButton onClick={() => setKnowledgeGraphOpen(false)} size="small"><Close /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ height: '70vh', p: 2 }}>
          <KnowledgeGraphBrowser project={currentProject} useGraphLayer={useGraphLayer} />
        </DialogContent>
      </Dialog>

      <SkillsSettings open={skillsOpen} onClose={() => setSkillsOpen(false)} project={currentProject} />
      <SkillCatalog open={skillCatalogOpen} onClose={() => setSkillCatalogOpen(false)} />
      <ContextManager open={contextsOpen} onClose={() => setContextsOpen(false)} projectName={currentProject} allTags={allTags} onContextChange={() => {}} />

      <Dialog open={conditionMonitoringOpen} onClose={() => setConditionMonitoringOpen(false)} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '90vh', maxHeight: '90vh', ...(themeMode === 'dark' && { border: '1px solid #999' }) } }}>
        <EventHandling selectedProject={currentProject} onClose={() => setConditionMonitoringOpen(false)} />
      </Dialog>

      <Dialog open={ontologyCoreOpen} onClose={() => setOntologyCoreOpen(false)} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '90vh', maxHeight: '90vh', ...(themeMode === 'dark' && { border: '1px solid #999' }) } }}>
        <OntologyCoreEditor selectedProject={currentProject} onClose={() => setOntologyCoreOpen(false)} />
      </Dialog>

      <IssueManager open={issuesOpen} onClose={() => setIssuesOpen(false)} currentProject={currentProject} />

      <Dialog open={scrapbookListOpen} onClose={() => setScrapbookListOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('projectMenu.scrapbooksTitle')}</span>
          <IconButton onClick={() => setScrapbookListOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {scrapbooks.length > 0 ? scrapbooks.map((sb) => (
            <MenuItem key={sb.graphName} onClick={() => handleOpenScrapbookFile(sb)}>
              <ListItemText primary={sb.name} secondary={sb.filename} />
            </MenuItem>
          )) : (
            <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>{t('projectMenu.noScrapbooks')}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateScrapbookDialogOpen(true)} startIcon={<AddOutlined />} variant="contained">{t('projectMenu.createNew')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createScrapbookDialogOpen} onClose={() => setCreateScrapbookDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('projectMenu.newScrapbookTitle')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label={t('projectMenu.scrapbookNameLabel')} value={newScrapbookName} onChange={(e) => setNewScrapbookName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateScrapbook(); }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateScrapbookDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleCreateScrapbook} variant="contained" disabled={!newScrapbookName.trim()}>{t('common.create')}</Button>
        </DialogActions>
      </Dialog>

      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      <ServiceControlDrawer open={serviceControlOpen} onClose={() => setServiceControlOpen(false)} />
    </>
  );
}
