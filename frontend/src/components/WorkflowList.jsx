import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  CircularProgress,
  Stack,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  MoreVert,
  Add,
  PlayArrow,
  DeleteOutline,
  ExpandMore,
  ChevronRight,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

function classify(w) {
  if (w.isFinal) return 'done';
  if (w.isWaiting) return 'waiting';
  return 'running';
}

const GROUP_ORDER = ['running', 'waiting', 'done'];
const GROUP_LABELS = {
  running: 'Running',
  waiting: 'Waiting',
  done: 'Done',
};

/**
 * Left-pane workflow list with context menu for per-workflow actions and a
 * "create new" button in the header.
 *
 * Props:
 *   workflows, selectedWorkflowId, onSelect, loading, error
 *   onCreate           — open create dialog
 *   onProgress(w)      — open progress dialog for workflow w
 *   onDelete(w)        — open delete confirmation for workflow w
 */
export default function WorkflowList({
  workflows,
  selectedWorkflowId,
  onSelect,
  loading,
  error,
  onCreate,
  onProgress,
  onDelete,
}) {
  const { t } = useTranslation(['workflowVisualizer']);
  const [menuAnchor, setMenuAnchor] = useState(null); // { type: 'el', el } | { type: 'pos', top, left }
  const [menuWorkflow, setMenuWorkflow] = useState(null);
  const [expanded, setExpanded] = useState({ running: true, waiting: true, done: false });

  const groups = useMemo(() => {
    const buckets = { running: [], waiting: [], done: [] };
    for (const w of workflows || []) {
      buckets[classify(w)].push(w);
    }
    return buckets;
  }, [workflows]);

  const openMenu = (event, workflow) => {
    event.stopPropagation();
    event.preventDefault();
    setMenuAnchor({ type: 'el', el: event.currentTarget });
    setMenuWorkflow(workflow);
  };

  const openMenuFromContextMenu = (event, workflow) => {
    event.preventDefault();
    setMenuAnchor({ type: 'pos', top: event.clientY, left: event.clientX });
    setMenuWorkflow(workflow);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuWorkflow(null);
  };

  const handleProgress = () => {
    if (menuWorkflow && onProgress) onProgress(menuWorkflow);
    closeMenu();
  };

  const handleDelete = () => {
    if (menuWorkflow && onDelete) onDelete(menuWorkflow);
    closeMenu();
  };

  const canProgress = menuWorkflow && !menuWorkflow.isFinal;

  const header = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        px: 0.5,
        py: 0.25,
        paddingTop: '3.5px',
        paddingBottom: '3.5px',
        borderBottom: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      <Tooltip title="Create new workflow">
        <span>
          <IconButton
            size="small"
            onClick={onCreate}
            disabled={!onCreate}
            sx={{ p: 0.5 }}
            aria-label="Create new workflow"
          >
            <Add fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );

  let body;
  if (loading) {
    body = (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 1 }}>
        <CircularProgress size={20} />
      </Box>
    );
  } else if (error) {
    body = (
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="error">{error}</Typography>
      </Box>
    );
  } else if (!workflows || workflows.length === 0) {
    body = (
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {t('workflowVisualizer:noWorkflows')}
        </Typography>
      </Box>
    );
  } else {
    body = (
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            left: '50%',
            bottom: '40px',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: 220,
            height: '33.3%',
            backgroundImage: 'url(/active-hypothesis-workflows.png)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center bottom',
            opacity: 0.5,
            pointerEvents: 'none',
            zIndex: 0,
          },
        }}
      >
        {GROUP_ORDER.map((key) => {
          const items = groups[key];
          if (!items.length) return null;
          const isOpen = expanded[key];
          return (
            <Box key={key} sx={{ mb: 1 }}>
              <Box
                role="button"
                tabIndex={0}
                onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25,
                  px: 0.75,
                  pt: 1,
                  pb: 0.5,
                  cursor: 'pointer',
                  userSelect: 'none',
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
              >
                {isOpen ? (
                  <ExpandMore sx={{ fontSize: 16, color: 'text.secondary' }} />
                ) : (
                  <ChevronRight sx={{ fontSize: 16, color: 'text.secondary' }} />
                )}
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    letterSpacing: 0.5,
                  }}
                >
                  {GROUP_LABELS[key]} ({items.length})
                </Typography>
              </Box>
              {isOpen && (
              <List dense disablePadding>
                {items.map((w, idx) => (
                  <ListItemButton
                    key={w.id}
                    selected={w.id === selectedWorkflowId}
                    onClick={() => onSelect(w.id)}
                    onContextMenu={(e) => openMenuFromContextMenu(e, w)}
                    sx={{
                      py: 0.5,
                      pl: 1.5,
                      pr: 0.5,
                      backgroundColor: idx % 2 === 1 ? 'action.hover' : 'transparent',
                    }}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" noWrap title={w.name}>
                          {w.name}
                        </Typography>
                      }
                      secondary={
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: '3px', ml: '3px' }}>
                          <Chip
                            label={w.stateLabel || w.currentState}
                            size="small"
                            variant="outlined"
                            color={key === 'done' ? 'success' : key === 'waiting' ? 'warning' : 'primary'}
                            sx={{ height: 18, fontSize: 10, borderWidth: 2, '& .MuiChip-label': { mt: '2px', ml: '3px' } }}
                          />
                        </Stack>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => openMenu(e, w)}
                      aria-label="actions"
                      sx={{ ml: 0.5 }}
                    >
                      <MoreVert fontSize="small" />
                    </IconButton>
                  </ListItemButton>
                ))}
              </List>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'background.paper' }}>
      {header}
      {body}
      <Menu
        anchorReference={menuAnchor?.type === 'pos' ? 'anchorPosition' : 'anchorEl'}
        anchorEl={menuAnchor?.type === 'el' ? menuAnchor.el : undefined}
        anchorPosition={
          menuAnchor?.type === 'pos' ? { top: menuAnchor.top, left: menuAnchor.left } : undefined
        }
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
      >
        <MenuItem onClick={handleProgress} disabled={!canProgress}>
          <PlayArrow fontSize="small" sx={{ mr: 1 }} />
          Progress to next state…
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <DeleteOutline fontSize="small" sx={{ mr: 1 }} />
          Delete workflow…
        </MenuItem>
      </Menu>
    </Box>
  );
}
