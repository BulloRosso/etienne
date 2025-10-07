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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Chip,
  Alert,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { Close, Add, Delete, Edit, ExpandMore, ExpandLess } from '@mui/icons-material';
import Editor from '@monaco-editor/react';

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

const weekdays = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 }
];

// Helper functions to convert between cron and user-friendly format
const parseCronExpression = (cronExpression) => {
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) {
    return { hour: '09', minute: '00', selectedDays: [1, 2, 3, 4, 5] };
  }

  const [minute, hour, , , dayOfWeek] = parts;

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
    selectedDays
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

const formatScheduleDisplay = (cronExpression) => {
  const { hour, minute, selectedDays } = parseCronExpression(cronExpression);

  let daysText = 'Every day';
  if (selectedDays.length < 7) {
    if (selectedDays.length === 5 && selectedDays.every(d => d >= 1 && d <= 5)) {
      daysText = 'Weekdays';
    } else if (selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)) {
      daysText = 'Weekends';
    } else {
      const dayNames = selectedDays.map(d => weekdays.find(w => w.value === d)?.label).join(', ');
      daysText = dayNames;
    }
  }

  return `${daysText} at ${hour}:${minute}`;
};

export default function SchedulingOverview({ open, onClose, project }) {
  const [currentTab, setCurrentTab] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(new Set());

  // Form state - user-friendly inputs
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    prompt: '',
    timeZone: 'Europe/Berlin'
  });
  const [scheduleHour, setScheduleHour] = useState('09');
  const [scheduleMinute, setScheduleMinute] = useState('00');
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri by default

  useEffect(() => {
    if (open) {
      loadTasks();
      loadHistory();
    }
  }, [open, project]);

  const loadTasks = async () => {
    try {
      const response = await fetch(`/api/scheduler/${project}/tasks`);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch(`/api/scheduler/${project}/history`);
      const data = await response.json();
      setHistory(data.history || []);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
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
    setShowTaskForm(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    const { hour, minute, selectedDays: days } = parseCronExpression(task.cronExpression);
    setFormData({
      id: task.id,
      name: task.name,
      prompt: task.prompt,
      timeZone: task.timeZone || 'UTC'
    });
    setScheduleHour(hour);
    setScheduleMinute(minute);
    setSelectedDays(days);
    setShowTaskForm(true);
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await fetch(`/api/scheduler/${project}/task/${taskId}`, {
        method: 'DELETE'
      });
      await loadTasks();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleSaveTask = async () => {
    try {
      const cronExpression = buildCronExpression(scheduleHour, scheduleMinute, selectedDays);
      const taskData = {
        ...formData,
        cronExpression
      };

      if (editingTask) {
        // Update existing task
        await fetch(`/api/scheduler/${project}/task/${editingTask.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(taskData)
        });
      } else {
        // Create new task
        await fetch(`/api/scheduler/${project}/task`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(taskData)
        });
      }

      await loadTasks();
      setShowTaskForm(false);
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Scheduled Tasks 
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <Tabs value={currentTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tab label="Task Definitions" />
        <Tab label="History" />
      </Tabs>

      <DialogContent sx={{ minHeight: 400 }}>
        {/* Task Definitions Tab */}
        {currentTab === 0 && (
          <Box>
            {!showTaskForm ? (
              <>
                <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleAddTask}
                  >
                    Add Task
                  </Button>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Schedule</TableCell>
                        <TableCell>Timezone</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tasks.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                            No scheduled tasks. Click "Add Task" to create one.
                          </TableCell>
                        </TableRow>
                      ) : (
                        tasks.map((task) => (
                          <TableRow key={task.id}>
                            <TableCell>{task.name}</TableCell>
                            <TableCell>{formatScheduleDisplay(task.cronExpression)}</TableCell>
                            <TableCell>{task.timeZone || 'UTC'}</TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => handleEditTask(task)}>
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={() => handleDeleteTask(task.id)} color="error">
                                <Delete fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="h6">
                  {editingTask ? 'Edit Task' : 'New Task'}
                </Typography>

                <TextField
                  label="Task Name"
                  fullWidth
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />

                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Prompt</Typography>
                  <Box sx={{ border: '1px solid #ddd', borderRadius: 1, overflow: 'hidden' }}>
                    <Editor
                      height="200px"
                      defaultLanguage="markdown"
                      value={formData.prompt}
                      onChange={(value) => setFormData({ ...formData, prompt: value || '' })}
                      theme="light"
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
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Schedule</Typography>

                  {/* Time input */}
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <TextField
                      label="Hour"
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
                      label="Minute"
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
                        Time: {scheduleHour}:{scheduleMinute}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Weekday selector */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>Days of the week:</Typography>
                    <ToggleButtonGroup
                      value={selectedDays}
                      onChange={handleDayToggle}
                      aria-label="weekdays"
                    >
                      {weekdays.map((day) => (
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
                      Weekdays
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedDays([0, 6])}
                    >
                      Weekends
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                    >
                      Every Day
                    </Button>
                  </Box>

                  {/* Preview */}
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.100', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Preview: {formatScheduleDisplay(buildCronExpression(scheduleHour, scheduleMinute, selectedDays))}
                    </Typography>
                  </Box>
                </Box>

                <FormControl fullWidth>
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={formData.timeZone}
                    label="Timezone"
                    onChange={(e) => setFormData({ ...formData, timeZone: e.target.value })}
                  >
                    {timezones.map((tz) => (
                      <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                  <Button onClick={() => setShowTaskForm(false)}>Cancel</Button>
                  <Button
                    variant="contained"
                    onClick={handleSaveTask}
                    disabled={!formData.name || !formData.prompt || selectedDays.length === 0}
                  >
                    Save
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* History Tab */}
        {currentTab === 1 && (
          <Box>
            {history.length === 0 ? (
              <Alert severity="info">No execution history yet.</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Timestamp</TableCell>
                      <TableCell>Task Name</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Response</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map((entry, index) => (
                      <React.Fragment key={index}>
                        <TableRow>
                          <TableCell>{formatDate(entry.timestamp)}</TableCell>
                          <TableCell>{entry.name}</TableCell>
                          <TableCell>
                            <Chip
                              label={entry.isError ? 'Error' : 'Success'}
                              color={entry.isError ? 'error' : 'success'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 400 }}>
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
                            <TableCell colSpan={5} sx={{ py: 0, fontSize: '0.75rem', color: 'text.secondary' }}>
                              Duration: {entry.duration}ms
                              {entry.inputTokens && ` | Input tokens: ${entry.inputTokens}`}
                              {entry.outputTokens && ` | Output tokens: ${entry.outputTokens}`}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
