import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Box,
  Button,
  TextField,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Chip,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import { Close, Add, ExpandMore, ExpandLess } from '@mui/icons-material';
import Fab from '@mui/material/Fab';
import { TbCalendarTime } from 'react-icons/tb';
import { IoIosTimer } from 'react-icons/io';
import { IoClose } from 'react-icons/io5';
import { AiOutlineDelete } from 'react-icons/ai';
import Editor from '@monaco-editor/react';
import BackgroundInfo from './BackgroundInfo';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

const timezones = [
  'UTC',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney'
];

const getWeekdays = (t) => [
  { label: t('scheduling.weekdayMon'), value: 1 },
  { label: t('scheduling.weekdayTue'), value: 2 },
  { label: t('scheduling.weekdayWed'), value: 3 },
  { label: t('scheduling.weekdayThu'), value: 4 },
  { label: t('scheduling.weekdayFri'), value: 5 },
  { label: t('scheduling.weekdaySat'), value: 6 },
  { label: t('scheduling.weekdaySun'), value: 0 }
];

// Helper functions to convert between cron and user-friendly format
const isOneTimeCron = (cronExpression) => {
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) return false;
  const [, , dayOfMonth, month, dayOfWeek] = parts;
  return dayOfMonth !== '*' && month !== '*' && dayOfWeek === '*';
};

const buildOneTimeCronExpression = (hour, minute, date) => {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${minute} ${hour} ${day} ${month} *`;
};

const parseCronExpression = (cronExpression, taskType) => {
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) {
    return { hour: '09', minute: '00', selectedDays: [1, 2, 3, 4, 5], isOneTime: false, scheduledDate: null };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const isOneTime = taskType === 'one-time' || isOneTimeCron(cronExpression);

  if (isOneTime) {
    const now = new Date();
    const scheduledDate = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(dayOfMonth), parseInt(hour), parseInt(minute));
    return {
      hour: hour.padStart(2, '0'),
      minute: minute.padStart(2, '0'),
      selectedDays: [],
      isOneTime: true,
      scheduledDate
    };
  }

  // Parse days
  let selectedDays = [];
  if (dayOfWeek === '*') {
    selectedDays = [0, 1, 2, 3, 4, 5, 6];
  } else {
    const dayParts = dayOfWeek.split(',');
    selectedDays = dayParts.map(d => {
      if (d.includes('-')) {
        const [start, end] = d.split('-').map(Number);
        const range = [];
        for (let i = start; i <= end; i++) {
          range.push(i === 7 ? 0 : i);
        }
        return range;
      }
      return Number(d) === 7 ? 0 : Number(d);
    }).flat();
  }

  return {
    hour: hour.padStart(2, '0'),
    minute: minute.padStart(2, '0'),
    selectedDays,
    isOneTime: false,
    scheduledDate: null
  };
};

const buildCronExpression = (hour, minute, selectedDays) => {
  let dayOfWeek = '*';

  if (selectedDays.length > 0 && selectedDays.length < 7) {
    // Sort days and handle Sunday (0) properly
    const sortedDays = [...selectedDays].sort((a, b) => a - b);

    // Check if it's a continuous range
    const isContinuous = sortedDays.every((day, index) => {
      if (index === 0) return true;
      return day === sortedDays[index - 1] + 1;
    });

    if (isContinuous && sortedDays.length > 1) {
      dayOfWeek = `${sortedDays[0]}-${sortedDays[sortedDays.length - 1]}`;
    } else {
      dayOfWeek = sortedDays.join(',');
    }
  }

  return `${minute} ${hour} * * ${dayOfWeek}`;
};

const formatScheduleDisplay = (cronExpression, taskType, t) => {
  const parsed = parseCronExpression(cronExpression, taskType);

  if (parsed.isOneTime && parsed.scheduledDate) {
    const dateStr = parsed.scheduledDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return t('scheduling.displayOnceOn', { date: dateStr, time: `${parsed.hour}:${parsed.minute}` });
  }

  const { hour, minute, selectedDays } = parsed;
  const weekdays = getWeekdays(t);
  let daysText = t('scheduling.displayEveryDay');
  if (selectedDays.length < 7) {
    if (selectedDays.length === 5 && selectedDays.every(d => d >= 1 && d <= 5)) {
      daysText = t('scheduling.displayWeekdays');
    } else if (selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)) {
      daysText = t('scheduling.displayWeekends');
    } else {
      const dayNames = selectedDays.map(d => weekdays.find(w => w.value === d)?.label).join(', ');
      daysText = dayNames;
    }
  }

  return t('scheduling.displayAtTime', { days: daysText, time: `${hour}:${minute}` });
};

export default function SchedulingOverview({ open, onClose, project, showBackgroundInfo }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const [activeTab, setActiveTab] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [expandedHistory, setExpandedHistory] = useState(new Set());

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    prompt: '',
    timeZone: 'Europe/Berlin'
  });
  const [scheduleHour, setScheduleHour] = useState('09');
  const [scheduleMinute, setScheduleMinute] = useState('00');
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]);
  const [taskType, setTaskType] = useState('recurring');
  const [scheduledDate, setScheduledDate] = useState('');

  useEffect(() => {
    if (open) {
      loadTasks();
      loadHistory();
    }
  }, [open, project]);

  const loadTasks = async () => {
    try {
      const response = await apiFetch(`/api/scheduler/${project}/tasks`);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await apiFetch(`/api/scheduler/${project}/history`);
      const data = await response.json();
      setHistory(data.history || []);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleAddTask = () => {
    setEditingTask(null);
    setFormData({
      id: `task_${Date.now()}`,
      name: '',
      prompt: '',
      timeZone: 'Europe/Berlin'
    });
    setScheduleHour('09');
    setScheduleMinute('00');
    setSelectedDays([1, 2, 3, 4, 5]);
    setTaskType('recurring');
    setScheduledDate('');
    setEditDialogOpen(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    const parsed = parseCronExpression(task.cronExpression, task.type);
    setFormData({
      id: task.id,
      name: task.name,
      prompt: task.prompt,
      timeZone: task.timeZone || 'UTC'
    });
    setScheduleHour(parsed.hour);
    setScheduleMinute(parsed.minute);

    if (parsed.isOneTime) {
      setTaskType('one-time');
      if (parsed.scheduledDate) {
        const d = parsed.scheduledDate;
        setScheduledDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      setSelectedDays([]);
    } else {
      setTaskType('recurring');
      setSelectedDays(parsed.selectedDays);
      setScheduledDate('');
    }

    setEditDialogOpen(true);
  };

  const handleDeleteTask = async (e, taskId) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/scheduler/${project}/task/${taskId}`, {
        method: 'DELETE'
      });
      await loadTasks();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleSaveTask = async () => {
    try {
      let cronExpression;
      if (taskType === 'one-time') {
        const date = new Date(scheduledDate);
        cronExpression = buildOneTimeCronExpression(scheduleHour, scheduleMinute, date);
      } else {
        cronExpression = buildCronExpression(scheduleHour, scheduleMinute, selectedDays);
      }

      const taskData = {
        ...formData,
        cronExpression,
        type: taskType
      };

      if (editingTask) {
        await apiFetch(`/api/scheduler/${project}/task/${editingTask.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(taskData)
        });
      } else {
        await apiFetch(`/api/scheduler/${project}/task`, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(taskData)
        });
      }

      await loadTasks();
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleDayToggle = (event, newDays) => {
    if (newDays.length > 0) {
      setSelectedDays(newDays);
    }
  };

  const toggleHistoryExpand = (index) => {
    const newExpanded = new Set(expandedHistory);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedHistory(newExpanded);
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const truncateResponse = (response, maxLength = 80) => {
    if (response.length <= maxLength) return response;
    return response.substring(0, maxLength) + '...';
  };

  const isTaskOneTime = (task) => task.type === 'one-time' || isOneTimeCron(task.cronExpression);

  return (
    <>
      {/* Drawer panel content */}
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 1
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: '14px' }}>
            <TbCalendarTime size={22} color={themeMode === 'dark' ? '#fff' : '#000'} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t('scheduling.title')}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <IoClose size={24} />
          </IconButton>
        </Box>

        {/* Tab Strip */}
        <Tabs
          value={activeTab}
          onChange={(e, v) => setActiveTab(v)}
          sx={{ borderBottom: '1px solid', borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0', px: 1, minHeight: 40 }}
          TabIndicatorProps={{ sx: { height: 2 } }}
        >
          <Tab label={t('scheduling.tabTasks')} sx={{ textTransform: 'none', minHeight: 40, py: 0 }} />
          <Tab label={t('scheduling.tabHistory')} sx={{ textTransform: 'none', minHeight: 40, py: 0 }} />
        </Tabs>

        {/* Tab 0: Task List */}
        {activeTab === 0 && (
          <>
            <Box sx={{
              flex: 1,
              overflow: 'auto',
              p: 2,
              position: 'relative',
              '&::after': {
                content: '""',
                position: 'absolute',
                left: '50%',
                bottom: 0,
                transform: 'translateX(-50%)',
                width: '100%',
                maxWidth: 220,
                height: '33.3%',
                backgroundImage: 'url(/feature-scheduled-tasks.png)',
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center bottom',
                opacity: 0.5,
                pointerEvents: 'none',
                zIndex: 0,
              }
            }}>
              <BackgroundInfo infoId="scheduled-input" showBackgroundInfo={showBackgroundInfo} />

              {tasks.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <Typography variant="body1">
                    {t('scheduling.emptyTitle')}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {t('scheduling.emptySubtitle')}
                  </Typography>
                </Box>
              ) : (
                <List sx={{ position: 'relative', zIndex: 1 }}>
                  {tasks.map((task) => (
                    <ListItem
                      key={task.id}
                      onClick={() => handleEditTask(task)}
                      sx={{
                        border: '1px solid',
                        borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0',
                        borderRadius: 1,
                        mb: 1,
                        backgroundColor: themeMode === 'dark' ? '#383838' : '#fafafa',
                        color: themeMode === 'dark' ? '#fff' : 'inherit',
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: themeMode === 'dark' ? '#444' : '#f5f5f5',
                          '& .delete-icon': {
                            opacity: 1
                          }
                        },
                        alignItems: 'flex-start',
                        flexDirection: 'column',
                        position: 'relative'
                      }}
                    >
                      <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                          {isTaskOneTime(task)
                            ? <IoIosTimer size={20} color={themeMode === 'dark' ? '#90caf9' : '#1976d2'} />
                            : <TbCalendarTime size={20} color={themeMode === 'dark' ? '#90caf9' : '#1976d2'} />
                          }
                        </ListItemIcon>
                        <ListItemText
                          primary={task.name}
                          secondary={
                            <Typography variant="caption" sx={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.6)' : 'text.secondary' }}>
                              {formatScheduleDisplay(task.cronExpression, task.type, t)}
                            </Typography>
                          }
                          primaryTypographyProps={{
                            variant: 'body2',
                            sx: { fontWeight: 500, color: themeMode === 'dark' ? '#fff' : 'inherit' }
                          }}
                          sx={{ pr: 5 }}
                        />
                        <IconButton
                          className="delete-icon"
                          onClick={(e) => handleDeleteTask(e, task.id)}
                          size="small"
                          sx={{
                            position: 'absolute',
                            right: 8,
                            top: 8,
                            opacity: 0,
                            transition: 'opacity 0.2s',
                            color: themeMode === 'dark' ? '#ef9a9a' : '#d32f2f',
                            '&:hover': {
                              backgroundColor: themeMode === 'dark' ? 'rgba(239, 154, 154, 0.12)' : 'rgba(211, 47, 47, 0.08)'
                            }
                          }}
                        >
                          <AiOutlineDelete size={20} />
                        </IconButton>
                      </Box>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            {/* Footer */}
            <Box sx={{
              p: 2,
              borderTop: '1px solid',
              borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0',
              backgroundColor: themeMode === 'dark' ? '#383838' : '#f5f5f5',
              display: 'flex',
              justifyContent: 'space-between',
              position: 'relative'
            }}>
              <Fab
                color="primary"
                size="small"
                onClick={handleAddTask}
                sx={{
                  position: 'absolute',
                  top: -20,
                  left: '50%',
                  transform: 'translateX(-50%)'
                }}
              >
                <Add />
              </Fab>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('scheduling.taskCount', { count: tasks.length })}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('scheduling.configFile')}
              </Typography>
            </Box>
          </>
        )}

        {/* Tab 1: History */}
        {activeTab === 1 && (
          <>
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {history.length === 0 ? (
                <Alert severity="info">{t('scheduling.historyNoHistory')}</Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('scheduling.historyColumnTimestamp')}</TableCell>
                        <TableCell>{t('scheduling.historyColumnTask')}</TableCell>
                        <TableCell>{t('scheduling.historyColumnStatus')}</TableCell>
                        <TableCell>{t('scheduling.historyColumnResponse')}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((entry, index) => (
                        <React.Fragment key={index}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{formatDate(entry.timestamp)}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>{entry.name}</TableCell>
                            <TableCell>
                              <Chip
                                label={entry.isError ? t('scheduling.historyStatusError') : t('scheduling.historyStatusOk')}
                                color={entry.isError ? 'error' : 'success'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 200, fontSize: '0.75rem' }}>
                              {expandedHistory.has(index) ? entry.response : truncateResponse(entry.response)}
                            </TableCell>
                            <TableCell>
                              {entry.response.length > 80 && (
                                <IconButton size="small" onClick={() => toggleHistoryExpand(index)}>
                                  {expandedHistory.has(index) ? <ExpandLess /> : <ExpandMore />}
                                </IconButton>
                              )}
                            </TableCell>
                          </TableRow>
                          {entry.duration !== undefined && (
                            <TableRow>
                              <TableCell colSpan={5} sx={{ py: 0, fontSize: '0.7rem', color: 'text.secondary' }}>
                                {t('scheduling.historyDuration', { duration: entry.duration })}
                                {entry.inputTokens && ` | ${t('scheduling.historyInputTokens', { tokens: entry.inputTokens })}`}
                                {entry.outputTokens && ` | ${t('scheduling.historyOutputTokens', { tokens: entry.outputTokens })}`}
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>

            {/* Footer */}
            {history.length > 0 && (
              <Box sx={{
                p: 2,
                borderTop: '1px solid',
                borderColor: themeMode === 'dark' ? '#555' : '#e0e0e0',
                backgroundColor: themeMode === 'dark' ? '#383838' : '#f5f5f5',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {t('scheduling.historyEntryCount', { count: history.length })}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {t('scheduling.historyConfigFile')}
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Edit/Add Task Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          {editingTask ? t('scheduling.editTitleEdit') : t('scheduling.editTitleNew')}
          <IconButton onClick={() => setEditDialogOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label={t('scheduling.editTaskName')}
              fullWidth
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('scheduling.editPrompt')}</Typography>
              <Box sx={{ border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
                <Editor
                  height="200px"
                  defaultLanguage="markdown"
                  value={formData.prompt}
                  onChange={(value) => setFormData({ ...formData, prompt: value || '' })}
                  theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'off',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false
                  }}
                />
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('scheduling.editSchedule')}</Typography>

              {/* Task type toggle */}
              <Box sx={{ mb: 2 }}>
                <ToggleButtonGroup
                  value={taskType}
                  exclusive
                  onChange={(e, newType) => { if (newType) setTaskType(newType); }}
                  size="small"
                >
                  <ToggleButton value="recurring">{t('scheduling.editRecurring')}</ToggleButton>
                  <ToggleButton value="one-time">{t('scheduling.editOneTime')}</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Time input */}
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                  label={t('scheduling.editHour')}
                  type="number"
                  value={scheduleHour}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                    setScheduleHour(val.toString().padStart(2, '0'));
                  }}
                  inputProps={{ min: 0, max: 23 }}
                  sx={{ width: 100 }}
                />
                <TextField
                  label={t('scheduling.editMinute')}
                  type="number"
                  value={scheduleMinute}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                    setScheduleMinute(val.toString().padStart(2, '0'));
                  }}
                  inputProps={{ min: 0, max: 59 }}
                  sx={{ width: 100 }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('scheduling.editTime', { hour: scheduleHour, minute: scheduleMinute })}
                  </Typography>
                </Box>
              </Box>

              {taskType === 'recurring' ? (
                <>
                  {/* Weekday selector */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>{t('scheduling.editDaysOfWeek')}</Typography>
                    <ToggleButtonGroup
                      value={selectedDays}
                      onChange={handleDayToggle}
                      aria-label="weekdays"
                    >
                      {getWeekdays(t).map((day) => (
                        <ToggleButton
                          key={day.value}
                          value={day.value}
                          aria-label={day.label}
                          sx={{ px: 2 }}
                        >
                          {day.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>

                  {/* Quick presets */}
                  <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                    >
                      {t('scheduling.editWeekdays')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedDays([0, 6])}
                    >
                      {t('scheduling.editWeekends')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                    >
                      {t('scheduling.editEveryDay')}
                    </Button>
                  </Box>
                </>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>{t('scheduling.editDate')}</Typography>
                  <TextField
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: new Date().toISOString().split('T')[0] }}
                    sx={{ width: 200 }}
                  />
                </Box>
              )}

              {/* Preview */}
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('scheduling.editPreview', { schedule: taskType === 'one-time' && scheduledDate
                    ? formatScheduleDisplay(buildOneTimeCronExpression(scheduleHour, scheduleMinute, new Date(scheduledDate)), 'one-time', t)
                    : formatScheduleDisplay(buildCronExpression(scheduleHour, scheduleMinute, selectedDays), 'recurring', t)
                  })}
                </Typography>
              </Box>
            </Box>

            <FormControl fullWidth>
              <InputLabel>{t('scheduling.editTimezone')}</InputLabel>
              <Select
                value={formData.timeZone}
                label={t('scheduling.editTimezone')}
                onChange={(e) => setFormData({ ...formData, timeZone: e.target.value })}
              >
                {timezones.map((tz) => (
                  <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
              <Button onClick={() => setEditDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button
                variant="contained"
                onClick={handleSaveTask}
                disabled={
                  !formData.name || !formData.prompt ||
                  (taskType === 'recurring' && selectedDays.length === 0) ||
                  (taskType === 'one-time' && !scheduledDate)
                }
              >
                {t('common.save')}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
