import React from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Menu,
  MenuItem
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  MoreVert as MoreVertIcon,
  AccountTree as WorkflowIcon
} from '@mui/icons-material';
import { BiMessageEdit } from 'react-icons/bi';
import { IoMdNotificationsOutline, IoMdNotificationsOff } from 'react-icons/io';
import { useTranslation } from 'react-i18next';

const RulesTab = ({
  rules,
  prompts,
  getGroupStyle,
  onOpenRuleDialog,
  onToggleRule,
  onDeleteRule,
  ruleMenuAnchor,
  setRuleMenuAnchor,
  selectedRuleForMenu,
  setSelectedRuleForMenu
}) => {
  const { t } = useTranslation();
  return (
    <Box>
      {rules.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="body2" sx={{ marginLeft: '20px' }} color="text.secondary">
            {t('rulesTab.manageRules')}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => onOpenRuleDialog()}
            sx={{ textTransform: 'none' }}
          >
            {t('rulesTab.newRule')}
          </Button>
        </Box>
      )}

      {rules.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <IoMdNotificationsOff style={{ fontSize: 48, color: '#ccc', marginBottom: 12, opacity: 0.5 }} />
          <Typography variant="body1" color="text.secondary" gutterBottom>
            {t('rulesTab.noRulesConfigured')}
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            {t('rulesTab.createFirstRuleHint')}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => onOpenRuleDialog()}
            sx={{ textTransform: 'none' }}
          >
            {t('rulesTab.createFirstRule')}
          </Button>
        </Box>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.paper' }}>
                  <TableCell sx={{ width: 50 }}></TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('rulesTab.columnName')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('rulesTab.columnType')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('rulesTab.columnEventGroup')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('rulesTab.columnAction')}</TableCell>
                  <TableCell sx={{ width: 60, textAlign: 'center', fontWeight: 600 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule, idx) => {
                  const eventGroup = rule.condition.event?.group || (rule.condition.type === 'email-semantic' ? 'Email' : null);
                  const groupStyle = eventGroup ? getGroupStyle(eventGroup) : null;
                  const GroupIcon = groupStyle?.icon;
                  const actionPrompt = rule.action.type === 'prompt' ? prompts.find(p => p.id === rule.action.promptId) : null;
                  const isWorkflowAction = rule.action.type === 'workflow_event';
                  return (
                    <TableRow
                      key={rule.id}
                      sx={{
                        bgcolor: idx % 2 === 0 ? 'transparent' : 'grey.50',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <TableCell sx={{ textAlign: 'center' }}>
                        {rule.enabled ? (
                          <IoMdNotificationsOutline style={{ fontSize: 20, color: '#4caf50' }} />
                        ) : (
                          <IoMdNotificationsOff style={{ fontSize: 20, color: '#ccc' }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>
                        {rule.name}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={rule.condition.type}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {groupStyle && GroupIcon ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <GroupIcon sx={{ fontSize: 16, color: groupStyle.color }} />
                            <Typography variant="body2" color="text.secondary">
                              {eventGroup}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {isWorkflowAction ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <WorkflowIcon sx={{ fontSize: 16, color: '#ff9800' }} />
                            <Typography variant="body2" color="text.secondary">
                              {rule.action.workflowId}
                            </Typography>
                            <Chip label={rule.action.event} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <BiMessageEdit style={{ fontSize: 16, color: '#9c27b0' }} />
                            <Typography variant="body2" color="text.secondary">
                              {actionPrompt?.title || rule.action.promptId}
                            </Typography>
                          </Box>
                        )}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            setRuleMenuAnchor(e.currentTarget);
                            setSelectedRuleForMenu(rule);
                          }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Menu
            anchorEl={ruleMenuAnchor}
            open={Boolean(ruleMenuAnchor)}
            onClose={() => {
              setRuleMenuAnchor(null);
              setSelectedRuleForMenu(null);
            }}
          >
            <MenuItem
              onClick={() => {
                onToggleRule(selectedRuleForMenu);
                setRuleMenuAnchor(null);
                setSelectedRuleForMenu(null);
              }}
            >
              {selectedRuleForMenu?.enabled ? <PauseIcon fontSize="small" sx={{ mr: 1 }} /> : <PlayIcon fontSize="small" sx={{ mr: 1 }} />}
              {selectedRuleForMenu?.enabled ? t('common.disable') : t('common.enable')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                onOpenRuleDialog(selectedRuleForMenu);
                setRuleMenuAnchor(null);
                setSelectedRuleForMenu(null);
              }}
            >
              <EditIcon fontSize="small" sx={{ mr: 1 }} />
              {t('common.edit')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                onDeleteRule(selectedRuleForMenu?.id);
                setRuleMenuAnchor(null);
                setSelectedRuleForMenu(null);
              }}
              sx={{ color: 'error.main' }}
            >
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              {t('common.delete')}
            </MenuItem>
          </Menu>
        </>
      )}
    </Box>
  );
};

export default RulesTab;
