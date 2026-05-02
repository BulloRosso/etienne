import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  CircularProgress,
  Button,
  Collapse,
} from '@mui/material';
import {
  FolderOutlined,
  ExpandMore,
  ChevronRight,
  Inbox as InboxIcon,
  Send as SendIcon,
  Drafts as DraftsIcon,
  Delete as TrashIcon,
  Folder as FolderIcon,
  AttachFile,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { AiOutlinePaperClip } from 'react-icons/ai';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';
import AttachmentSaveModal from './AttachmentSaveModal';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

/** Pick an icon based on IMAP folder flags */
function getFolderIcon(flags) {
  if (!flags) return <FolderIcon fontSize="small" />;
  const f = flags.map((s) => s.toLowerCase());
  if (f.some((s) => s.includes('inbox'))) return <InboxIcon fontSize="small" />;
  if (f.some((s) => s.includes('sent'))) return <SendIcon fontSize="small" />;
  if (f.some((s) => s.includes('drafts'))) return <DraftsIcon fontSize="small" />;
  if (f.some((s) => s.includes('trash') || s.includes('junk'))) return <TrashIcon fontSize="small" />;
  return <FolderOutlined fontSize="small" />;
}

/** Recursive folder tree item */
function FolderTreeItem({ folder, selectedFolder, onSelect, depth = 0 }) {
  const [expanded, setExpanded] = useState(folder.path === 'INBOX');
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <>
      <ListItemButton
        onClick={() => onSelect(folder.path)}
        selected={selectedFolder === folder.path}
        sx={{
          borderRadius: 1,
          py: 0.5,
          pl: 1 + depth * 2,
          minHeight: 36,
        }}
      >
        {hasChildren && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            sx={{ p: 0, mr: 0.5 }}
          >
            {expanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
          </IconButton>
        )}
        {!hasChildren && depth > 0 && <Box sx={{ width: 24, mr: 0.5 }} />}
        <ListItemIcon sx={{ minWidth: 28 }}>{getFolderIcon(folder.flags)}</ListItemIcon>
        <ListItemText
          primary={folder.name}
          primaryTypographyProps={{
            fontSize: '0.85rem',
            fontWeight: folder.path === 'INBOX' ? 600 : 400,
            noWrap: true,
          }}
        />
      </ListItemButton>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              folder={child}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </Collapse>
      )}
    </>
  );
}

/**
 * IMAP Inbox Viewer — renders as a tab panel in the preview pane.
 *
 * Props:
 *   servicePath  – e.g. "#imap/inbox" or "#imap" — the path after # determines the initial folder
 *   projectName  – current project name
 */
export default function IMAPInboxViewer({ servicePath, projectName }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';

  // Parse initial folder from service path: #imap/inbox → "inbox", #imap → "INBOX"
  const initialFolder = useMemo(() => {
    if (!servicePath) return 'INBOX';
    const withoutHash = servicePath.replace(/^#imap\/?/, '');
    return withoutHash || 'INBOX';
  }, [servicePath]);

  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(initialFolder);
  const [messages, setMessages] = useState([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedMessage, setSelectedMessage] = useState(null);

  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState(null);

  // Attachment save modal
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveAttachment, setSaveAttachment] = useState(null);

  // Vertical splitter between row 1 (folders+messages) and row 2 (preview)
  const containerRef = useRef(null);
  const [topHeight, setTopHeight] = useState(() => {
    const saved = localStorage.getItem('imapSplitHeight');
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return !isNaN(parsed) && parsed >= 100 && parsed <= 800 ? parsed : 250;
  });
  const [isSplitDragging, setIsSplitDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem('imapSplitHeight', topHeight.toString());
  }, [topHeight]);

  const handleSplitMouseDown = (e) => {
    e.preventDefault();
    setIsSplitDragging(true);
  };

  useEffect(() => {
    if (!isSplitDragging) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const newHeight = e.clientY - containerTop;
      const containerHeight = containerRef.current.getBoundingClientRect().height;
      const minTop = 100;
      const minBottom = 150;
      if (newHeight >= minTop && newHeight <= containerHeight - minBottom) {
        setTopHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsSplitDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isSplitDragging]);

  const PAGE_SIZE = 50;

  // Fetch folders on mount
  useEffect(() => {
    setLoadingFolders(true);
    setError(null);
    apiFetch('/api/email/folders')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const sorted = (data.folders || []).sort((a, b) => {
            const aIsInbox = a.path.toUpperCase() === 'INBOX' ? 0 : 1;
            const bIsInbox = b.path.toUpperCase() === 'INBOX' ? 0 : 1;
            return aIsInbox - bIsInbox;
          });
          setFolders(sorted);
        } else {
          setError(data.error || t('imapInbox.errorLoadFailed'));
        }
      })
      .catch((err) => setError(err.message || t('imapInbox.errorLoadFailed')))
      .finally(() => setLoadingFolders(false));
  }, [t]);

  // Fetch messages when folder or page changes
  const fetchMessages = useCallback(
    (folder, pg, append = false) => {
      setLoadingMessages(true);
      setError(null);
      apiFetch(
        `/api/email/folders/${encodeURIComponent(folder)}/messages?page=${pg}&pageSize=${PAGE_SIZE}`,
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            const newMessages = data.messages || [];
            setMessages((prev) => (append ? [...prev, ...newMessages] : newMessages));
            setTotalMessages(data.total || 0);
            if (!append && newMessages.length > 0) {
              fetchFullMessage(folder, newMessages[0].uid);
            } else if (!append && newMessages.length === 0) {
              setSelectedMessage(null);
            }
          } else {
            setError(data.error || t('imapInbox.errorLoadFailed'));
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoadingMessages(false));
    },
    [t],
  );

  // Fetch messages on folder change
  useEffect(() => {
    setPage(1);
    setMessages([]);
    setSelectedMessage(null);
    fetchMessages(selectedFolder, 1);
  }, [selectedFolder, fetchMessages]);

  // Fetch full message
  const fetchFullMessage = useCallback((folder, uid) => {
    setLoadingPreview(true);
    apiFetch(`/api/email/messages/${uid}?folder=${encodeURIComponent(folder)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSelectedMessage({ ...data.message, uid, folder });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPreview(false));
  }, []);

  // Load more messages
  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMessages(selectedFolder, nextPage, true);
  }, [page, selectedFolder, fetchMessages]);

  const hasMore = messages.length < totalMessages;

  const borderColor = isDark ? '#555' : '#e0e0e0';
  const headerBg = isDark ? '#383838' : '#fff';

  return (
    <Box ref={containerRef} sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {error && (
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        </Box>
      )}

      {/* Row 1: Folders + Messages */}
      <Box
        sx={{
          display: 'flex',
          height: topHeight,
          minHeight: 100,
          flexShrink: 0,
        }}
      >
        {/* Folders panel */}
        <Box
          sx={{
            width: '30%',
            borderRight: `1px solid ${borderColor}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              px: 1.5,
              py: 1,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'text.secondary',
              fontSize: '0.7rem',
            }}
          >
            {t('imapInbox.folders')}
          </Typography>
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              px: 0.5,
              '&::-webkit-scrollbar': { width: '4px' },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: isDark ? '#555' : '#ccc',
                borderRadius: '2px',
              },
            }}
          >
            {loadingFolders ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : folders.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 2, display: 'block' }}>
                {t('imapInbox.noFolders')}
              </Typography>
            ) : (
              <List disablePadding>
                {folders.map((folder) => (
                  <FolderTreeItem
                    key={folder.path}
                    folder={folder}
                    selectedFolder={selectedFolder}
                    onSelect={setSelectedFolder}
                  />
                ))}
              </List>
            )}
          </Box>
        </Box>

        {/* Messages panel */}
        <Box
          sx={{
            width: '70%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              px: 1.5,
              py: 1,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'text.secondary',
              fontSize: '0.7rem',
            }}
          >
            {t('imapInbox.messages')}
            {totalMessages > 0 && ` (${totalMessages})`}
          </Typography>
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              px: 0.5,
              '&::-webkit-scrollbar': { width: '4px' },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: isDark ? '#555' : '#ccc',
                borderRadius: '2px',
              },
            }}
          >
            {loadingMessages && messages.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : messages.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 2, display: 'block' }}>
                {t('imapInbox.noMessages')}
              </Typography>
            ) : (
              <List disablePadding>
                {messages.map((msg) => {
                  const isUnread = !msg.flags?.some((f) => f.includes('Seen'));
                  const isSelected = selectedMessage?.uid === msg.uid;
                  return (
                    <ListItemButton
                      key={msg.uid}
                      onClick={() => fetchFullMessage(selectedFolder, msg.uid)}
                      selected={isSelected}
                      sx={{
                        borderRadius: 1,
                        py: 0.75,
                        px: 1.5,
                        mb: 0.25,
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                      }}
                    >
                      <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{
                            fontWeight: isUnread ? 700 : 400,
                            fontSize: '0.85rem',
                            flex: 1,
                            mr: 1,
                          }}
                        >
                          {msg.subject}
                        </Typography>
                        {msg.hasAttachments && <AttachFile sx={{ fontSize: 14, color: 'text.secondary' }} />}
                      </Box>
                      <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', mt: 0.25 }}>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, mr: 1 }}>
                          {msg.from}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {formatDate(msg.date)}
                        </Typography>
                      </Box>
                    </ListItemButton>
                  );
                })}
                {hasMore && (
                  <Box sx={{ textAlign: 'center', py: 1 }}>
                    <Button size="small" onClick={handleLoadMore} disabled={loadingMessages}>
                      {loadingMessages ? <CircularProgress size={16} /> : t('imapInbox.loadMore')}
                    </Button>
                  </Box>
                )}
              </List>
            )}
          </Box>
        </Box>
      </Box>

      {/* Vertical resize handle */}
      <Box
        onMouseDown={handleSplitMouseDown}
        sx={{
          height: '6px',
          cursor: 'row-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          bgcolor: isDark ? '#2c2c2c' : '#fafafa',
          '&:hover': {
            bgcolor: isDark ? '#383838' : '#eee',
          },
          ...(isSplitDragging && {
            bgcolor: isDark ? '#383838' : '#e0e0e0',
          }),
        }}
      >
        <Box sx={{
          height: '2px',
          width: '30px',
          borderTop: isDark ? '2px dotted #555' : '2px dotted #ccc',
        }} />
      </Box>

      {/* Row 2: Email preview */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 150, overflow: 'hidden' }}>
        {loadingPreview ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress size={28} />
          </Box>
        ) : !selectedMessage ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('imapInbox.selectMessage')}
            </Typography>
          </Box>
        ) : (
          <>
            {/* Message header */}
            <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${borderColor}`, bgcolor: headerBg }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {selectedMessage.subject}
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, mt: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  <strong>{t('imapInbox.from')}:</strong> {selectedMessage.from}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  <strong>{t('imapInbox.to')}:</strong> {selectedMessage.to}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  <strong>{t('imapInbox.date')}:</strong> {formatFullDate(selectedMessage.date)}
                </Typography>
              </Box>
            </Box>

            {/* Attachments bar */}
            {selectedMessage.attachments?.length > 0 && (
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  borderBottom: `1px solid ${borderColor}`,
                  flexWrap: 'wrap',
                  bgcolor: isDark ? '#333' : '#f5f5f5',
                }}
              >
                <AiOutlinePaperClip size={16} />
                <Typography variant="caption" sx={{ fontWeight: 600, mr: 0.5 }}>
                  {t('imapInbox.attachments')}:
                </Typography>
                {selectedMessage.attachments.map((att) => (
                  <Chip
                    key={att.index}
                    icon={<DownloadIcon sx={{ fontSize: 14 }} />}
                    label={`${att.filename} (${formatFileSize(att.size)})`}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setSaveAttachment(att);
                      setSaveModalOpen(true);
                    }}
                    sx={{
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      bgcolor: isDark ? '#444' : '#fff',
                      '& .MuiChip-icon': { ml: '8px' },
                      '&:hover': { borderColor: '#1976d2', backgroundColor: isDark ? '#1a3a5c !important' : '#e3f2fd !important' },
                    }}
                  />
                ))}
                {selectedMessage.attachments.length > 1 && (
                  <Chip
                    icon={<DownloadIcon sx={{ fontSize: 14 }} />}
                    label={t('imapInbox.downloadAll')}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setSaveAttachment({ _all: true, attachments: selectedMessage.attachments });
                      setSaveModalOpen(true);
                    }}
                    sx={{
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                      bgcolor: isDark ? '#444' : '#fff',
                      '& .MuiChip-icon': { ml: '8px' },
                      '&:hover': { borderColor: '#1976d2', backgroundColor: isDark ? '#1a3a5c !important' : '#e3f2fd !important' },
                    }}
                  />
                )}
              </Box>
            )}

            {/* Email body */}
            {selectedMessage.html ? (
              <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <iframe
                  srcDoc={isDark
                    ? `<style>html,body{background:#2c2c2c;color:#e0e0e0}a{color:#6ab0f3}</style>${selectedMessage.html}`
                    : selectedMessage.html
                  }
                  sandbox=""
                  title="Email preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    backgroundColor: isDark ? '#2c2c2c' : '#f0eee6',
                  }}
                />
              </Box>
            ) : (
              <Box sx={{
                flex: 1,
                overflow: 'auto',
                minHeight: 0,
                p: 2,
                '&::-webkit-scrollbar': { width: '4px' },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: isDark ? '#555' : '#ccc',
                  borderRadius: '2px',
                },
              }}>
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                    m: 0,
                  }}
                >
                  {selectedMessage.text || ''}
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Attachment save modal */}
      <AttachmentSaveModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        attachment={saveAttachment}
        uid={selectedMessage?.uid}
        folder={selectedMessage?.folder}
        currentProject={projectName}
      />
    </Box>
  );
}
