import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Divider, Link, Tooltip, Drawer } from '@mui/material';
import { AddOutlined, Close as CloseIcon } from '@mui/icons-material';
import { RiChatNewLine } from 'react-icons/ri';
import { GiSettingsKnobs } from 'react-icons/gi';
import { GrChatOption } from 'react-icons/gr';
import { PiBell } from 'react-icons/pi';
import { FolderOutlined } from '@mui/icons-material';
import { IoSunnyOutline, IoMoonOutline } from 'react-icons/io5';
import { GoSidebarCollapse } from 'react-icons/go';
import { LiaHatCowboySideSolid } from 'react-icons/lia';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import SettingsModal from './SettingsModal';
import ProjectListModal from './ProjectListModal';
import CreateProjectWizard from './CreateProjectWizard';
import SessionPane from './SessionPane';
import NotificationMenu from './NotificationMenu';
import Strategy from './Strategy';
import SkillIndicator from './SkillIndicator';
import McpToolsIndicator from './McpToolsIndicator';

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 300;

function truncateWords(text, maxWords = 5) {
  if (!text) return '';
  return text.split(/\s+/).slice(0, maxWords).join(' ');
}

function OverflowTooltip({ title, children, ...tooltipProps }) {
  const [open, setOpen] = React.useState(false);
  const handleOpen = (e) => {
    const textEl = e.currentTarget.querySelector('.MuiListItemText-primary');
    if (textEl && textEl.scrollWidth > textEl.clientWidth) setOpen(true);
  };
  const handleClose = () => setOpen(false);
  return (
    <Tooltip {...tooltipProps} title={title} open={open} onClose={handleClose}>
      <span onMouseEnter={handleOpen} onMouseLeave={handleClose}>
        {children}
      </span>
    </Tooltip>
  );
}

export default function MinimalisticSidebar({
  onNewChat,
  onProjectChange,
  onLoadChat,
  currentProject,
  sessionId,
  streaming,
  onCopySessionId,
  budgetSettings,
  onBudgetSettingsChange,
  onTasksChange,
  showBackgroundInfo,
  onUIConfigChange,
  codingAgent,
  allTags,
  agentClass,
  onCollapse,
}) {
  const { t } = useTranslation();
  const { mode: themeMode, toggleMode } = useThemeMode();

  const [recentItems, setRecentItems] = useState({ projects: [], chats: [], notifications: [] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [existingProjects, setExistingProjects] = useState([]);
  const [projectSessions, setProjectSessions] = useState([]);
  const [sessionPaneOpen, setSessionPaneOpen] = useState(false);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [agentClassIcon, setAgentClassIcon] = useState(null);

  // Fetch agent class icon
  useEffect(() => {
    apiFetch('/api/persona-manager/agentclass-icon')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.image) {
          setAgentClassIcon(data.image);
        }
      })
      .catch(() => {});
  }, []);

  // Resizable width
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return !isNaN(parsed) && parsed >= SIDEBAR_MIN_WIDTH && parsed <= SIDEBAR_MAX_WIDTH
      ? parsed
      : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      if (!sidebarRef.current) return;
      const sidebarLeft = sidebarRef.current.getBoundingClientRect().left;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const fetchRecentItems = useCallback(() => {
    apiFetch('/api/recent-items')
      .then(res => res.json())
      .then(data => {
        setRecentItems({
          projects: data.projects || [],
          chats: data.chats || [],
          notifications: data.notifications || [],
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRecentItems();
  }, [fetchRecentItems]);

  // Refresh when project changes
  useEffect(() => {
    fetchRecentItems();
  }, [currentProject, fetchRecentItems]);

  // Fetch sessions for the current project
  const fetchProjectSessions = useCallback(() => {
    if (!currentProject) {
      setProjectSessions([]);
      return;
    }
    apiFetch(`/api/sessions/${encodeURIComponent(currentProject)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProjectSessions(data.sessions || []);
        }
      })
      .catch(() => setProjectSessions([]));
  }, [currentProject]);

  useEffect(() => {
    fetchProjectSessions();
  }, [fetchProjectSessions]);

  // Re-fetch sessions when sessionId changes (e.g. after project fully loads or new chat starts)
  useEffect(() => {
    fetchProjectSessions();
  }, [sessionId]);

  // Re-fetch sessions when streaming ends (session metadata is persisted after stream completes)
  const prevStreamingRef = useRef(streaming);
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      fetchProjectSessions();
    }
    prevStreamingRef.current = streaming;
  }, [streaming, fetchProjectSessions]);

  const handleNewProjectClick = () => {
    apiFetch('/api/claude/listProjects')
      .then(res => res.json())
      .then(data => setExistingProjects((data.projects || []).filter(p => !p.startsWith('.'))))
      .catch(() => setExistingProjects([]));
    setCreateProjectOpen(true);
  };

  const isDark = themeMode === 'dark';
  const sectionHeadingSx = {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'text.secondary',
    px: 2,
    pt: 2,
    pb: 0.5,
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', flexShrink: 0 }}>
      {/* Sidebar content */}
      <Box
        ref={sidebarRef}
        sx={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: isDark ? '#2c2c2c' : '#fafafa',
          overflowY: 'auto',
          overflowX: 'hidden',
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: isDark ? '#555' : '#ccc',
            borderRadius: '3px',
          },
        }}
      >
        {/* Agent Class Header — shown if agentClass or agentClassIcon is available */}
        {(agentClass || agentClassIcon) && (
          <Box sx={{
            height: '48px',
            minHeight: '48px',
            backgroundColor: isDark ? '#383838' : 'white',
            display: 'flex',
            alignItems: 'center',
            px: 2,
            borderBottom: isDark ? '1px solid #555' : '1px solid #e0e0e0',
          }}>
            {agentClassIcon && (
              <Box
                component="img"
                src={`data:image/png;base64,${agentClassIcon}`}
                alt="Agent Class"
                sx={{ height: 24, width: 24, objectFit: 'contain', flexShrink: 0 }}
              />
            )}
            {agentClass && (
              <Typography variant="subtitle2" sx={{
                color: 'text.secondary',
                fontWeight: 600,
                ml: agentClassIcon ? '10px' : 0,
              }}>
                {agentClass}
              </Typography>
            )}
            <IconButton
              onClick={onCollapse}
              size="small"
              sx={{ ml: 'auto', color: 'text.secondary' }}
            >
              <GoSidebarCollapse size={18} />
            </IconButton>
          </Box>
        )}

        {/* Section 1: Menu */}
        <Box sx={{ px: 1, pt: 1, pb: 1 }}>
          <List disablePadding>
            <ListItemButton onClick={onNewChat} sx={{ borderRadius: 1, py: 0.75 }}>
              <ListItemIcon sx={{ minWidth: 36 }}><RiChatNewLine size={18} /></ListItemIcon>
              <ListItemText primary={t('sidebar.newChat')} primaryTypographyProps={{ fontSize: '0.9rem' }} />
            </ListItemButton>
            {currentProject && (
              <ListItemButton onClick={() => setRoleDrawerOpen(true)} sx={{ borderRadius: 1, py: 0.75 }}>
                <ListItemIcon sx={{ minWidth: 36 }}><LiaHatCowboySideSolid size={21} /></ListItemIcon>
                <ListItemText primary={t('sidebar.agentRole')} primaryTypographyProps={{ fontSize: '0.9rem' }} />
              </ListItemButton>
            )}
            {currentProject && (
              <Box sx={{ ml: '50px', my: '8px' }}>
                <SkillIndicator projectName={currentProject} sessionId={sessionId} />
              </Box>
            )}
            {currentProject && (
              <Box sx={{ ml: '50px', my: '8px' }}>
                <McpToolsIndicator projectName={currentProject} sessionId={sessionId} />
              </Box>
            )}
            <ListItemButton onClick={() => setSettingsOpen(true)} sx={{ borderRadius: 1, py: 0.75 }}>
              <ListItemIcon sx={{ minWidth: 36 }}><GiSettingsKnobs size={18} /></ListItemIcon>
              <ListItemText primary={t('sidebar.settings')} primaryTypographyProps={{ fontSize: '0.9rem' }} />
            </ListItemButton>
          </List>
        </Box>

        <Divider />

        {/* Section 2: Projects */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
            <Typography sx={sectionHeadingSx}>{t('sidebar.projectsHeading')}</Typography>
            <IconButton size="small" onClick={handleNewProjectClick} sx={{ mt: 1 }}>
              <AddOutlined fontSize="small" />
            </IconButton>
          </Box>
          <List disablePadding sx={{ px: 1 }}>
            {recentItems.projects.slice(0, 3).map((proj) => (
              <ListItemButton
                key={proj.name}
                onClick={() => onProjectChange(proj.name)}
                selected={proj.name === currentProject}
                sx={{ borderRadius: 1, py: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}><FolderOutlined fontSize="small" /></ListItemIcon>
                <ListItemText primary={proj.name} primaryTypographyProps={{ fontSize: '0.875rem' }} />
              </ListItemButton>
            ))}
          </List>
          <Box sx={{ px: 2, pb: 1, textAlign: 'right' }}>
            <Link
              component="button"
              variant="caption"
              onClick={() => setProjectListOpen(true)}
              sx={{ cursor: 'pointer', color: 'primary.main', textDecoration: 'none' }}
            >
              {t('sidebar.moreProjects')}
            </Link>
          </Box>
        </Box>

        <Divider />

        {/* Section 3: Chats — up to 5 from current project, fill remaining with other projects */}
        <Box>
          <Typography sx={sectionHeadingSx}>{t('sidebar.chatsHeading')}</Typography>
          <List disablePadding sx={{ px: 1 }}>
            {(() => {
              const MAX_CHATS = 5;
              const currentProjectChats = projectSessions.slice(0, MAX_CHATS).map((session) => ({
                sessionId: session.sessionId,
                title: session.summary || session.sessionName || t('sidebar.untitledChat'),
                projectName: currentProject,
                isCrossProject: false,
              }));
              const remaining = MAX_CHATS - currentProjectChats.length;
              const currentSessionIds = new Set(projectSessions.map(s => s.sessionId));
              const crossProjectChats = remaining > 0
                ? recentItems.chats
                    .filter(c => c.projectName !== currentProject && !currentSessionIds.has(c.sessionId))
                    .slice(0, remaining)
                    .map(c => ({
                      sessionId: c.sessionId,
                      title: c.title || t('sidebar.untitledChat'),
                      projectName: c.projectName,
                      isCrossProject: true,
                    }))
                : [];
              const combinedChats = [...currentProjectChats, ...crossProjectChats];

              if (combinedChats.length === 0) {
                return (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
                    {t('sidebar.noRecentChats')}
                  </Typography>
                );
              }

              return combinedChats.map((chat) => (
                <OverflowTooltip
                  key={chat.sessionId}
                  title={chat.isCrossProject ? `${chat.title} (${chat.projectName})` : chat.title}
                  placement="right"
                  arrow
                >
                  <ListItemButton
                    onClick={() => onLoadChat(chat.sessionId, chat.projectName)}
                    selected={chat.sessionId === sessionId}
                    sx={{ borderRadius: 1, py: 0.5, opacity: chat.isCrossProject ? 0.7 : 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}><GrChatOption size={18} /></ListItemIcon>
                    <ListItemText
                      primary={truncateWords(chat.title)}
                      secondary={chat.isCrossProject ? chat.projectName : undefined}
                      primaryTypographyProps={{ fontSize: '0.875rem', noWrap: true }}
                      slotProps={{ secondary: { sx: { fontSize: '0.7rem', noWrap: true, opacity: 0.6 } } }}
                    />
                  </ListItemButton>
                </OverflowTooltip>
              ));
            })()}
          </List>
          {projectSessions.length > 5 && (
            <Box sx={{ px: 2, pb: 1, textAlign: 'right' }}>
              <Link
                component="button"
                variant="caption"
                onClick={() => setSessionPaneOpen(true)}
                sx={{ cursor: 'pointer', color: 'primary.main', textDecoration: 'none' }}
              >
                {t('sidebar.moreSessions')}
              </Link>
            </Box>
          )}
        </Box>

        {/* Section 4: Notifications (conditional) */}
        {recentItems.notifications.length > 0 && (
          <>
            <Divider />
            <Box>
              <Typography sx={sectionHeadingSx}>{t('sidebar.notificationsHeading')}</Typography>
              <List disablePadding sx={{ px: 1 }}>
                {recentItems.notifications.slice(0, 5).map((notif, idx) => (
                  <ListItemButton
                    key={idx}
                    sx={{
                      borderRadius: 1,
                      py: 0.5,
                      '& .notif-close': { opacity: 0 },
                      '&:hover .notif-close': { opacity: 1 },
                    }}
                    onClick={() => {
                      apiFetch(`/api/recent-items/notification/${idx}`, { method: 'DELETE' })
                        .then(() => fetchRecentItems())
                        .catch(() => {});
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}><PiBell size={18} /></ListItemIcon>
                    <ListItemText
                      primary={`${truncateWords(notif.text)} (${notif.projectName})`}
                      primaryTypographyProps={{ fontSize: '0.875rem', noWrap: true }}
                    />
                    <CloseIcon
                      className="notif-close"
                      sx={{
                        fontSize: 16,
                        color: 'error.main',
                        ml: 0.5,
                        flexShrink: 0,
                        transition: 'opacity 0.15s',
                      }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          </>
        )}

        {/* Dark mode toggle + notifications — pushed to bottom */}
        <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5, px: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              borderRadius: '50px',
              padding: '2px',
              cursor: 'pointer',
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
              backgroundColor: themeMode === 'light' ? 'rgba(25,118,210,0.12)' : 'transparent',
              border: themeMode === 'light' ? '1px solid rgba(25,118,210,0.3)' : '1px solid transparent',
              color: themeMode === 'light' ? '#1976d2' : 'rgba(255,255,255,0.35)',
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
              color: themeMode === 'dark' ? 'gold' : 'rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}>
              <IoMoonOutline size={14} />
            </Box>
          </Box>
          <NotificationMenu projectName={currentProject} />
        </Box>

        {/* Modals */}
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          currentProject={currentProject}
          sessionId={sessionId}
          onCopySessionId={onCopySessionId}
          budgetSettings={budgetSettings}
          onBudgetSettingsChange={onBudgetSettingsChange}
          onTasksChange={onTasksChange}
          showBackgroundInfo={showBackgroundInfo}
          onUIConfigChange={onUIConfigChange}
          onProjectChange={onProjectChange}
          codingAgent={codingAgent}
          allTags={allTags}
        />

        <ProjectListModal
          open={projectListOpen}
          onClose={() => setProjectListOpen(false)}
          currentProject={currentProject}
          onProjectChange={(name) => { onProjectChange(name); setProjectListOpen(false); }}
        />

        <CreateProjectWizard
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          existingProjects={existingProjects}
          onProjectCreated={async (projectName, guidanceDocuments) => {
            setCreateProjectOpen(false);
            onProjectChange(projectName, guidanceDocuments);
            fetchRecentItems();
          }}
        />

        <SessionPane
          open={sessionPaneOpen}
          onClose={() => { setSessionPaneOpen(false); fetchProjectSessions(); }}
          projectName={currentProject}
          onSessionSelect={(sid) => { onLoadChat(sid, currentProject); setSessionPaneOpen(false); fetchProjectSessions(); }}
          currentSessionId={sessionId}
        />

        <Drawer
          anchor="left"
          open={roleDrawerOpen}
          onClose={() => setRoleDrawerOpen(false)}
          sx={{
            '& .MuiDrawer-paper': {
              width: '500px',
              maxWidth: '90vw',
            },
          }}
        >
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <Strategy projectName={currentProject} showBackgroundInfo={showBackgroundInfo} />
          </Box>
        </Drawer>
      </Box>

      {/* Resize handle */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          width: '6px',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          bgcolor: isDark ? '#2c2c2c' : '#fafafa',
          '&:hover': {
            bgcolor: isDark ? '#383838' : '#eee',
          },
          ...(isDragging && {
            bgcolor: isDark ? '#383838' : '#e0e0e0',
          }),
        }}
      >
        <Box sx={{
          width: '2px',
          height: '30px',
          borderLeft: isDark ? '2px dotted #555' : '2px dotted #ccc',
        }} />
      </Box>
    </Box>
  );
}
