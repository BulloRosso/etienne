import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, CircularProgress, Alert, IconButton, Tooltip,
  ToggleButtonGroup, ToggleButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import * as d3 from 'd3';
import {
  parseISO, format, addDays, differenceInCalendarDays,
  startOfWeek, startOfMonth, endOfMonth,
  eachWeekOfInterval, eachMonthOfInterval, eachDayOfInterval,
  min as dateMin, max as dateMax,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LABEL_WIDTH = 260;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 48;
const BAR_HEIGHT = 22;
const BAR_RADIUS = 4;
const PADDING_DAYS = 7;

const DAY_PX = { days: 30, weeks: 12, months: 4 };

const THEME = {
  light: {
    bg: '#ffffff',
    headerBg: '#f5f5f5',
    gridLine: '#e8e8e8',
    gridLineMajor: '#bdbdbd',
    todayLine: '#f44336',
    rowEven: '#fafafa',
    rowOdd: '#ffffff',
    text: '#212121',
    textSecondary: '#757575',
    depLine: '#9e9e9e',
    labelHover: '#f0f0f0',
    dateLabelBg: 'rgba(0,0,0,0.75)',
    dateLabelText: '#ffffff',
  },
  dark: {
    bg: '#121212',
    headerBg: '#1a1a1a',
    gridLine: '#2a2a2a',
    gridLineMajor: '#444444',
    todayLine: '#ef5350',
    rowEven: '#1e1e1e',
    rowOdd: '#181818',
    text: '#e0e0e0',
    textSecondary: '#9e9e9e',
    depLine: '#777777',
    labelHover: '#2a2a2a',
    dateLabelBg: 'rgba(255,255,255,0.85)',
    dateLabelText: '#121212',
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Flatten the nested task tree into a list, respecting collapsed state. */
function flattenTasks(tasks, depth = 0) {
  const result = [];
  for (const task of tasks) {
    const hasChildren = task.subtasks && task.subtasks.length > 0;
    result.push({ ...task, depth, hasChildren });
    if (hasChildren && !task.collapsed) {
      result.push(...flattenTasks(task.subtasks, depth + 1));
    }
  }
  return result;
}

/** Collect every task id → task (flat, ignoring collapsed). */
function buildTaskMap(tasks, map = new Map()) {
  for (const task of tasks) {
    map.set(task.id, task);
    if (task.subtasks?.length) buildTaskMap(task.subtasks, map);
  }
  return map;
}

/** Deep-clone task tree and update a single task by id. */
function updateTaskInTree(tasks, taskId, patch) {
  return tasks.map(t => {
    if (t.id === taskId) return { ...t, ...patch };
    if (t.subtasks?.length) {
      return { ...t, subtasks: updateTaskInTree(t.subtasks, taskId, patch) };
    }
    return t;
  });
}

/** Remove a task from the tree by id (also removes from subtasks). */
function removeTaskFromTree(tasks, taskId) {
  return tasks
    .filter(t => t.id !== taskId)
    .map(t => {
      if (t.subtasks?.length) {
        return { ...t, subtasks: removeTaskFromTree(t.subtasks, taskId) };
      }
      return t;
    });
}

/** Toggle collapsed flag on a task. */
function toggleCollapsed(tasks, taskId) {
  return tasks.map(t => {
    if (t.id === taskId) return { ...t, collapsed: !t.collapsed };
    if (t.subtasks?.length) {
      return { ...t, subtasks: toggleCollapsed(t.subtasks, taskId) };
    }
    return t;
  });
}

/** Reorder a task within its sibling list. Works at any nesting level.
 *  dragId = task being dragged, dropId = task it's dropped onto.
 *  Places dragId directly before dropId in the same array. If they're at
 *  different depths or in different parent arrays, the drag task is moved
 *  to the same level/parent as the drop target. */
function reorderTasks(tasks, dragId, dropId) {
  // First remove the dragged task from wherever it lives (preserving its data)
  let draggedTask = null;
  function extractTask(list) {
    return list.reduce((acc, t) => {
      if (t.id === dragId) {
        draggedTask = t;
        return acc;
      }
      if (t.subtasks?.length) {
        return [...acc, { ...t, subtasks: extractTask(t.subtasks) }];
      }
      return [...acc, t];
    }, []);
  }
  const withoutDrag = extractTask(tasks);
  if (!draggedTask) return tasks;

  // Now insert before the drop target
  function insertBefore(list) {
    const result = [];
    for (const t of list) {
      if (t.id === dropId) {
        result.push(draggedTask);
      }
      if (t.subtasks?.length) {
        result.push({ ...t, subtasks: insertBefore(t.subtasks) });
      } else {
        result.push(t);
      }
    }
    return result;
  }
  const reordered = insertBefore(withoutDrag);

  // Edge case: if dropId wasn't found (e.g. it was the dragged task itself), return unchanged
  const flatCount = (arr) => arr.reduce((n, t) => n + 1 + (t.subtasks ? flatCount(t.subtasks) : 0), 0);
  if (flatCount(reordered) < flatCount(tasks)) return tasks;

  return reordered;
}

/** Add a userEdited entry, avoiding duplicates for the same taskId + field combo within the same second. */
function addUserEdit(existing = [], taskId, field, oldValue, newValue) {
  const entry = {
    taskId,
    field,
    oldValue,
    newValue,
    timestamp: new Date().toISOString(),
  };
  return [...existing, entry];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GanttDiagram({ filename, projectName }) {
  const { t } = useTranslation(['ganttDiagram']);
  const { mode: themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const colors = isDark ? THEME.dark : THEME.light;

  // Data state
  const [ganttData, setGanttData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // View state
  const [viewMode, setViewMode] = useState('weeks');

  // Modal state: task name edit
  const [nameModalTask, setNameModalTask] = useState(null); // { id, name }
  const [nameModalValue, setNameModalValue] = useState('');

  // Modal state: bar date edit
  const [dateModalTask, setDateModalTask] = useState(null); // { id, startDate, endDate }
  const [dateModalStart, setDateModalStart] = useState('');
  const [dateModalEnd, setDateModalEnd] = useState('');

  // Modal state: new task
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskStart, setNewTaskStart] = useState('');
  const [newTaskEnd, setNewTaskEnd] = useState('');
  const [newTaskParent, setNewTaskParent] = useState('');

  // Drag-to-reorder state
  const [dragOverId, setDragOverId] = useState(null);
  const dragTaskIdRef = useRef(null);

  // Refs
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);

  // Flat task list
  const flatTasks = useMemo(
    () => (ganttData ? flattenTasks(ganttData.tasks) : []),
    [ganttData],
  );

  // Task map (all tasks including collapsed subtasks)
  const taskMap = useMemo(
    () => (ganttData ? buildTaskMap(ganttData.tasks) : new Map()),
    [ganttData],
  );

  /* ---- Load data ------------------------------------------------- */

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}?v=${refreshKey}`,
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      const parsed = JSON.parse(text);
      setGanttData(parsed);
      if (parsed.settings?.viewMode) setViewMode(parsed.settings.viewMode);
    } catch (err) {
      console.error('[GanttDiagram] load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filename, projectName, refreshKey]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ---- Save data ------------------------------------------------- */

  const saveData = useCallback(async (data) => {
    try {
      setSaving(true);
      await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/save/${filename}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: JSON.stringify(data, null, 2) }),
        },
      );
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      console.error('[GanttDiagram] save error:', err);
    } finally {
      setSaving(false);
    }
  }, [projectName, filename]);

  const debouncedSave = useCallback((data) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveData(data), 800);
  }, [saveData]);

  /* ---- Collapse toggle ------------------------------------------- */

  const handleToggleCollapse = useCallback((taskId) => {
    setGanttData(prev => {
      const updated = { ...prev, tasks: toggleCollapsed(prev.tasks, taskId) };
      debouncedSave(updated);
      return updated;
    });
  }, [debouncedSave]);

  /* ---- Task name edit modal -------------------------------------- */

  const handleOpenNameModal = useCallback((task) => {
    setNameModalTask(task);
    setNameModalValue(task.name);
  }, []);

  const handleSaveName = useCallback(() => {
    if (!nameModalTask || nameModalValue.trim() === '') return;
    const newName = nameModalValue.trim();
    if (newName === nameModalTask.name) {
      setNameModalTask(null);
      return;
    }
    setGanttData(prev => {
      const updated = {
        ...prev,
        tasks: updateTaskInTree(prev.tasks, nameModalTask.id, { name: newName }),
        userEdited: addUserEdit(prev.userEdited, nameModalTask.id, 'name', nameModalTask.name, newName),
      };
      debouncedSave(updated);
      return updated;
    });
    setNameModalTask(null);
  }, [nameModalTask, nameModalValue, debouncedSave]);

  const handleDeleteTask = useCallback(() => {
    if (!nameModalTask) return;
    setGanttData(prev => {
      const updated = {
        ...prev,
        tasks: removeTaskFromTree(prev.tasks, nameModalTask.id),
        userEdited: addUserEdit(prev.userEdited, nameModalTask.id, 'deleted', nameModalTask.name, null),
      };
      debouncedSave(updated);
      return updated;
    });
    setNameModalTask(null);
  }, [nameModalTask, debouncedSave]);

  /* ---- Bar date edit modal --------------------------------------- */

  const handleOpenDateModal = useCallback((task) => {
    setDateModalTask(task);
    setDateModalStart(task.startDate);
    setDateModalEnd(task.endDate);
  }, []);

  const handleSaveDates = useCallback(() => {
    if (!dateModalTask || !dateModalStart || !dateModalEnd) return;
    if (dateModalStart >= dateModalEnd) return;
    if (dateModalStart === dateModalTask.startDate && dateModalEnd === dateModalTask.endDate) {
      setDateModalTask(null);
      return;
    }
    setGanttData(prev => {
      let edits = prev.userEdited || [];
      if (dateModalStart !== dateModalTask.startDate) {
        edits = addUserEdit(edits, dateModalTask.id, 'startDate', dateModalTask.startDate, dateModalStart);
      }
      if (dateModalEnd !== dateModalTask.endDate) {
        edits = addUserEdit(edits, dateModalTask.id, 'endDate', dateModalTask.endDate, dateModalEnd);
      }
      const updated = {
        ...prev,
        tasks: updateTaskInTree(prev.tasks, dateModalTask.id, {
          startDate: dateModalStart,
          endDate: dateModalEnd,
        }),
        userEdited: edits,
      };
      debouncedSave(updated);
      return updated;
    });
    setDateModalTask(null);
  }, [dateModalTask, dateModalStart, dateModalEnd, debouncedSave]);

  /* ---- New task modal -------------------------------------------- */

  const handleOpenNewTask = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const nextWeek = format(addDays(new Date(), 7), 'yyyy-MM-dd');
    setNewTaskName('');
    setNewTaskStart(today);
    setNewTaskEnd(nextWeek);
    setNewTaskParent('');
    setNewTaskOpen(true);
  }, []);

  const handleCreateTask = useCallback(() => {
    if (!newTaskName.trim() || !newTaskStart || !newTaskEnd) return;
    if (newTaskStart >= newTaskEnd) return;

    const newId = `t-${Date.now()}`;
    const newTask = {
      id: newId,
      name: newTaskName.trim(),
      startDate: newTaskStart,
      endDate: newTaskEnd,
      color: '#546E7A',
      dependencies: [],
      subtasks: [],
    };

    setGanttData(prev => {
      let updatedTasks;
      if (newTaskParent) {
        // Add as subtask of selected parent
        updatedTasks = updateTaskInTree(prev.tasks, newTaskParent, {
          subtasks: [...(taskMap.get(newTaskParent)?.subtasks || []), newTask],
          collapsed: false,
        });
      } else {
        // Add at top level
        updatedTasks = [...prev.tasks, newTask];
      }
      const updated = {
        ...prev,
        tasks: updatedTasks,
        userEdited: addUserEdit(prev.userEdited, newId, 'created', null, newTaskName.trim()),
      };
      debouncedSave(updated);
      return updated;
    });
    setNewTaskOpen(false);
  }, [newTaskName, newTaskStart, newTaskEnd, newTaskParent, taskMap, debouncedSave]);

  /* ---- Drag-to-reorder handlers --------------------------------- */

  const handleDragStart = useCallback((e, taskId) => {
    dragTaskIdRef.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }, []);

  const handleDragOver = useCallback((e, taskId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(taskId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e, dropTaskId) => {
    e.preventDefault();
    setDragOverId(null);
    const dragId = dragTaskIdRef.current;
    if (!dragId || dragId === dropTaskId) return;

    setGanttData(prev => {
      const updated = {
        ...prev,
        tasks: reorderTasks(prev.tasks, dragId, dropTaskId),
        userEdited: addUserEdit(prev.userEdited, dragId, 'reorder', null, `before:${dropTaskId}`),
      };
      debouncedSave(updated);
      return updated;
    });
    dragTaskIdRef.current = null;
  }, [debouncedSave]);

  const handleDragEnd = useCallback(() => {
    setDragOverId(null);
    dragTaskIdRef.current = null;
  }, []);

  /* ---- ResizeObserver -------------------------------------------- */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- claudeHook listener -------------------------------------- */

  useEffect(() => {
    const handler = (event) => {
      if (event.type === 'claudeHook' && event.detail) {
        const { file } = event.detail;
        if (file && filename && file.endsWith(filename)) {
          setRefreshKey(k => k + 1);
        }
      }
    };
    window.addEventListener('claudeHook', handler);
    return () => window.removeEventListener('claudeHook', handler);
  }, [filename]);

  /* ---- D3 rendering --------------------------------------------- */

  useEffect(() => {
    if (!ganttData || !svgRef.current || flatTasks.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const dayPx = DAY_PX[viewMode];

    // Compute date range from ALL tasks (not just visible)
    const allTasks = [...taskMap.values()];
    const allStarts = allTasks.map(t => parseISO(t.startDate));
    const allEnds = allTasks.map(t => parseISO(t.endDate));
    const minDate = addDays(dateMin(allStarts), -PADDING_DAYS);
    const maxDate = addDays(dateMax(allEnds), PADDING_DAYS);
    const totalDays = differenceInCalendarDays(maxDate, minDate);
    const timelineWidth = totalDays * dayPx;

    const svgWidth = timelineWidth;
    const svgHeight = HEADER_HEIGHT + flatTasks.length * ROW_HEIGHT + 20;

    svg.attr('width', svgWidth).attr('height', svgHeight);

    // Time scale
    const xScale = d3.scaleTime()
      .domain([minDate, maxDate])
      .range([0, timelineWidth]);

    // --- Defs (arrowhead) ---
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'gantt-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', colors.depLine);

    // --- Row backgrounds ---
    const rowsG = svg.append('g').attr('class', 'rows');
    flatTasks.forEach((_, i) => {
      rowsG.append('rect')
        .attr('x', 0).attr('y', HEADER_HEIGHT + i * ROW_HEIGHT)
        .attr('width', svgWidth).attr('height', ROW_HEIGHT)
        .attr('fill', i % 2 === 0 ? colors.rowEven : colors.rowOdd);
    });

    // --- Grid lines ---
    const gridG = svg.append('g').attr('class', 'grid');
    const headerG = svg.append('g').attr('class', 'header');

    // Header background
    headerG.append('rect')
      .attr('x', 0).attr('y', 0)
      .attr('width', svgWidth).attr('height', HEADER_HEIGHT)
      .attr('fill', colors.headerBg);

    if (viewMode === 'days') {
      const days = eachDayOfInterval({ start: minDate, end: maxDate });
      days.forEach(day => {
        const x = xScale(day);
        gridG.append('line')
          .attr('x1', x).attr('y1', HEADER_HEIGHT)
          .attr('x2', x).attr('y2', svgHeight)
          .attr('stroke', day.getDay() === 1 ? colors.gridLineMajor : colors.gridLine)
          .attr('stroke-width', day.getDay() === 1 ? 1 : 0.5);
        headerG.append('text')
          .attr('x', x + dayPx / 2).attr('y', 32)
          .attr('text-anchor', 'middle')
          .attr('fill', colors.textSecondary)
          .attr('font-size', 10)
          .text(format(day, 'd'));
      });
      const months = eachMonthOfInterval({ start: minDate, end: maxDate });
      months.forEach(month => {
        const monthEnd = endOfMonth(month);
        const mStart = month < minDate ? minDate : month;
        const mEnd = monthEnd > maxDate ? maxDate : monthEnd;
        const x = (xScale(mStart) + xScale(mEnd)) / 2;
        headerG.append('text')
          .attr('x', x).attr('y', 14)
          .attr('text-anchor', 'middle')
          .attr('fill', colors.text)
          .attr('font-size', 11)
          .attr('font-weight', 600)
          .text(format(month, 'MMM yyyy'));
      });
    } else if (viewMode === 'weeks') {
      const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });
      weeks.forEach(week => {
        const x = xScale(week);
        gridG.append('line')
          .attr('x1', x).attr('y1', HEADER_HEIGHT)
          .attr('x2', x).attr('y2', svgHeight)
          .attr('stroke', colors.gridLine)
          .attr('stroke-width', 0.5);
        headerG.append('text')
          .attr('x', x + 4).attr('y', 32)
          .attr('text-anchor', 'start')
          .attr('fill', colors.textSecondary)
          .attr('font-size', 10)
          .text(format(week, 'MMM d'));
      });
      const months = eachMonthOfInterval({ start: minDate, end: maxDate });
      months.forEach(month => {
        const x = xScale(month);
        gridG.append('line')
          .attr('x1', x).attr('y1', HEADER_HEIGHT)
          .attr('x2', x).attr('y2', svgHeight)
          .attr('stroke', colors.gridLineMajor)
          .attr('stroke-width', 1);
        headerG.append('text')
          .attr('x', x + 4).attr('y', 14)
          .attr('text-anchor', 'start')
          .attr('fill', colors.text)
          .attr('font-size', 11)
          .attr('font-weight', 600)
          .text(format(month, 'MMM yyyy'));
      });
    } else {
      const months = eachMonthOfInterval({ start: minDate, end: maxDate });
      months.forEach(month => {
        const x = xScale(month);
        gridG.append('line')
          .attr('x1', x).attr('y1', HEADER_HEIGHT)
          .attr('x2', x).attr('y2', svgHeight)
          .attr('stroke', colors.gridLineMajor)
          .attr('stroke-width', 1);
        headerG.append('text')
          .attr('x', x + 4).attr('y', 28)
          .attr('text-anchor', 'start')
          .attr('fill', colors.text)
          .attr('font-size', 11)
          .attr('font-weight', 600)
          .text(format(month, 'MMM yyyy'));
      });
    }

    // --- Today marker ---
    const today = new Date();
    if (today >= minDate && today <= maxDate) {
      const todayX = xScale(today);
      gridG.append('line')
        .attr('x1', todayX).attr('y1', 0)
        .attr('x2', todayX).attr('y2', svgHeight)
        .attr('stroke', colors.todayLine)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3');
      headerG.append('text')
        .attr('x', todayX).attr('y', 44)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.todayLine)
        .attr('font-size', 9)
        .attr('font-weight', 700)
        .text(t('today'));
    }

    // --- Dependency arrows ---
    const depsG = svg.append('g').attr('class', 'dependencies');
    const flatIndexMap = new Map(flatTasks.map((ft, i) => [ft.id, i]));

    flatTasks.forEach(task => {
      if (!task.dependencies?.length) return;
      const targetIdx = flatIndexMap.get(task.id);
      if (targetIdx == null) return;

      task.dependencies.forEach(depId => {
        const sourceTask = taskMap.get(depId);
        const sourceIdx = flatIndexMap.get(depId);
        if (!sourceTask || sourceIdx == null) return;

        const sourceX = xScale(parseISO(sourceTask.endDate));
        const sourceY = HEADER_HEIGHT + sourceIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const targetX = xScale(parseISO(task.startDate));
        const targetY = HEADER_HEIGHT + targetIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

        const midX = sourceX + 12;

        depsG.append('path')
          .attr('d', `M${sourceX},${sourceY} H${midX} V${targetY} H${targetX}`)
          .attr('fill', 'none')
          .attr('stroke', colors.depLine)
          .attr('stroke-width', 1.5)
          .attr('marker-end', 'url(#gantt-arrow)');
      });
    });

    // --- Task bars ---
    const barsG = svg.append('g').attr('class', 'bars');

    // Group for drag date labels (rendered on top of everything)
    const labelsG = svg.append('g').attr('class', 'drag-labels');

    flatTasks.forEach((task, i) => {
      const barX = xScale(parseISO(task.startDate));
      const barW = Math.max(xScale(parseISO(task.endDate)) - barX, 4);
      const barY = HEADER_HEIGHT + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
      const isParent = task.hasChildren;

      const barGroup = barsG.append('g').attr('class', 'bar-group');

      // Main bar
      const bar = barGroup.append('rect')
        .attr('x', barX).attr('y', barY)
        .attr('width', barW).attr('height', BAR_HEIGHT)
        .attr('rx', BAR_RADIUS).attr('ry', BAR_RADIUS)
        .attr('fill', task.color || '#546E7A')
        .attr('opacity', isParent ? 0.85 : 1)
        .style('cursor', 'grab');

      // Duration label inside bar (if wide enough)
      const days = differenceInCalendarDays(parseISO(task.endDate), parseISO(task.startDate));
      if (barW > 40) {
        barGroup.append('text')
          .attr('x', barX + barW / 2).attr('y', barY + BAR_HEIGHT / 2 + 4)
          .attr('text-anchor', 'middle')
          .attr('fill', '#ffffff')
          .attr('font-size', 10)
          .attr('font-weight', 500)
          .attr('pointer-events', 'none')
          .text(`${days}d`);
      }

      // Drag date label elements (hidden until drag)
      let startLabel = null;
      let endLabel = null;

      // --- Drag behavior ---
      let hasDragged = false;

      const dragBehavior = d3.drag()
        .on('start', function (event) {
          hasDragged = false;
          const localX = event.x - barX;
          let mode = 'move';
          if (localX < barW * 0.2) mode = 'resize-left';
          else if (localX > barW * 0.8) mode = 'resize-right';

          d3.select(this).attr('opacity', 0.6);
          this.__dragState = {
            mode,
            startMouseX: event.x,
            origStartDate: parseISO(task.startDate),
            origEndDate: parseISO(task.endDate),
            taskId: task.id,
          };

          // Create date label elements
          const state = this.__dragState;
          if (mode === 'resize-left' || mode === 'move') {
            startLabel = labelsG.append('g').attr('class', 'date-label-start');
            startLabel.append('rect')
              .attr('rx', 3).attr('ry', 3)
              .attr('height', 16)
              .attr('fill', colors.dateLabelBg);
            startLabel.append('text')
              .attr('font-size', 9).attr('font-weight', 600)
              .attr('fill', colors.dateLabelText)
              .attr('dy', 12);
          }
          if (mode === 'resize-right' || mode === 'move') {
            endLabel = labelsG.append('g').attr('class', 'date-label-end');
            endLabel.append('rect')
              .attr('rx', 3).attr('ry', 3)
              .attr('height', 16)
              .attr('fill', colors.dateLabelBg);
            endLabel.append('text')
              .attr('font-size', 9).attr('font-weight', 600)
              .attr('fill', colors.dateLabelText)
              .attr('dy', 12);
          }
        })
        .on('drag', function (event) {
          const state = this.__dragState;
          if (!state) return;
          hasDragged = true;
          const dx = event.x - state.startMouseX;
          const daysDelta = Math.round(dx / dayPx);

          let newStart, newEnd;
          if (state.mode === 'move') {
            newStart = addDays(state.origStartDate, daysDelta);
            newEnd = addDays(state.origEndDate, daysDelta);
          } else if (state.mode === 'resize-left') {
            newStart = addDays(state.origStartDate, daysDelta);
            newEnd = state.origEndDate;
            if (newStart >= newEnd) newStart = addDays(newEnd, -1);
          } else {
            newStart = state.origStartDate;
            newEnd = addDays(state.origEndDate, daysDelta);
            if (newEnd <= newStart) newEnd = addDays(newStart, 1);
          }

          const nx = xScale(newStart);
          const nw = Math.max(xScale(newEnd) - nx, 4);
          d3.select(this).attr('x', nx).attr('width', nw);

          // Update date labels (3px below bar, 5px horizontal spacing from edges)
          const labelY = barY + BAR_HEIGHT + 3;
          if (startLabel) {
            const txt = format(newStart, 'MMM d');
            const textWidth = txt.length * 6 + 6;
            startLabel.select('rect')
              .attr('x', nx - 5 - textWidth).attr('y', labelY)
              .attr('width', textWidth);
            startLabel.select('text').text(txt)
              .attr('x', nx - 5 - textWidth + 3).attr('y', labelY);
          }
          if (endLabel) {
            const endX = nx + nw;
            const txt = format(newEnd, 'MMM d');
            const textWidth = txt.length * 6 + 6;
            endLabel.select('rect')
              .attr('x', endX + 5).attr('y', labelY)
              .attr('width', textWidth);
            endLabel.select('text').text(txt)
              .attr('x', endX + 5 + 3).attr('y', labelY);
          }
        })
        .on('end', function (event) {
          const state = this.__dragState;
          d3.select(this).attr('opacity', task.hasChildren ? 0.85 : 1);

          // Remove date labels
          if (startLabel) { startLabel.remove(); startLabel = null; }
          if (endLabel) { endLabel.remove(); endLabel = null; }

          if (!state) return;

          const dx = event.x - state.startMouseX;
          const daysDelta = Math.round(dx / dayPx);

          // If no actual drag happened, treat as click → open date modal
          if (!hasDragged || daysDelta === 0) {
            if (!hasDragged) {
              handleOpenDateModal(task);
            }
            // Reset bar position
            d3.select(this).attr('x', barX).attr('width', barW);
            this.__dragState = null;
            return;
          }

          let newStart, newEnd;
          if (state.mode === 'move') {
            newStart = addDays(state.origStartDate, daysDelta);
            newEnd = addDays(state.origEndDate, daysDelta);
          } else if (state.mode === 'resize-left') {
            newStart = addDays(state.origStartDate, daysDelta);
            newEnd = state.origEndDate;
            if (newStart >= newEnd) newStart = addDays(newEnd, -1);
          } else {
            newStart = state.origStartDate;
            newEnd = addDays(state.origEndDate, daysDelta);
            if (newEnd <= newStart) newEnd = addDays(newStart, 1);
          }

          const newStartStr = format(newStart, 'yyyy-MM-dd');
          const newEndStr = format(newEnd, 'yyyy-MM-dd');

          setGanttData(prev => {
            let edits = prev.userEdited || [];
            if (newStartStr !== task.startDate) {
              edits = addUserEdit(edits, state.taskId, 'startDate', task.startDate, newStartStr);
            }
            if (newEndStr !== task.endDate) {
              edits = addUserEdit(edits, state.taskId, 'endDate', task.endDate, newEndStr);
            }
            const updated = {
              ...prev,
              tasks: updateTaskInTree(prev.tasks, state.taskId, {
                startDate: newStartStr,
                endDate: newEndStr,
              }),
              userEdited: edits,
            };
            debouncedSave(updated);
            return updated;
          });

          this.__dragState = null;
        });

      bar.call(dragBehavior);

      // Cursor hint on hover for resize zones
      bar.on('mousemove', function (event) {
        const rect = this.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const width = rect.width;
        if (localX < width * 0.2 || localX > width * 0.8) {
          d3.select(this).style('cursor', 'col-resize');
        } else {
          d3.select(this).style('cursor', 'grab');
        }
      });
    });

  }, [ganttData, flatTasks, taskMap, viewMode, colors, themeMode, debouncedSave, t, handleOpenDateModal]);

  /* ---- Render ---------------------------------------------------- */

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography variant="body2">{t('loading')}</Typography>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ m: 2 }}>{t('errorLoading', { error })}</Alert>;
  }

  if (!ganttData || flatTasks.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">{t('noTasks')}</Typography>
      </Box>
    );
  }

  const svgHeight = HEADER_HEIGHT + flatTasks.length * ROW_HEIGHT + 20;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: colors.bg }}>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5,
        borderBottom: `1px solid ${colors.gridLine}`, minHeight: 40, flexShrink: 0,
      }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: colors.text, mr: 1 }}>
          {ganttData.title || filename}
        </Typography>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, fontSize: 11 } }}
        >
          <ToggleButton value="days">{t('viewDays')}</ToggleButton>
          <ToggleButton value="weeks">{t('viewWeeks')}</ToggleButton>
          <ToggleButton value="months">{t('viewMonths')}</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        {saving && <CircularProgress size={14} />}
        {savedFlash && !saving && (
          <Chip label={t('saved')} size="small" color="success" variant="outlined"
            sx={{ height: 20, fontSize: 11 }} />
        )}

        <Tooltip title={t('reload')}>
          <IconButton size="small" onClick={() => setRefreshKey(k => k + 1)} sx={{ mr: '4px' }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Main content: label panel + timeline */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: task labels */}
        <Box sx={{
          width: LABEL_WIDTH, minWidth: LABEL_WIDTH, flexShrink: 0,
          borderRight: `1px solid ${colors.gridLine}`,
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          {/* Header with add button */}
          <Box sx={{
            height: HEADER_HEIGHT, borderBottom: `1px solid ${colors.gridLine}`,
            bgcolor: colors.headerBg, display: 'flex', alignItems: 'center', pl: 1,
          }}>
            <Tooltip title={t('newTask')}>
              <IconButton size="small" onClick={handleOpenNewTask} sx={{ color: colors.textSecondary }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {flatTasks.map((task, i) => (
            <Box
              key={task.id}
              draggable
              onDragStart={(e) => handleDragStart(e, task.id)}
              onDragOver={(e) => handleDragOver(e, task.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, task.id)}
              onDragEnd={handleDragEnd}
              sx={{
                height: ROW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                pl: 1 + task.depth * 2,
                pr: 1,
                bgcolor: i % 2 === 0 ? colors.rowEven : colors.rowOdd,
                '&:hover': { bgcolor: colors.labelHover },
                cursor: 'grab',
                borderBottom: `1px solid ${colors.gridLine}`,
                borderTop: dragOverId === task.id ? `2px solid ${colors.todayLine}` : '2px solid transparent',
                opacity: dragTaskIdRef.current === task.id ? 0.5 : 1,
                transition: 'border-top 0.1s ease',
              }}
              onClick={() => handleOpenNameModal(task)}
            >
              {task.hasChildren ? (
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); handleToggleCollapse(task.id); }}
                  sx={{ p: 0, mr: 0.5, color: colors.textSecondary }}
                >
                  {task.collapsed
                    ? <ChevronRightIcon sx={{ fontSize: 16 }} />
                    : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                </IconButton>
              ) : (
                <Box sx={{ width: 20 }} />
              )}

              <Box
                sx={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  bgcolor: task.color || '#546E7A', mr: 1,
                }}
              />

              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontSize: 12, color: colors.text, flex: 1,
                  fontWeight: task.hasChildren ? 600 : 400,
                }}
                title={task.name}
              >
                {task.name}
              </Typography>

              <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: 10, ml: 0.5, flexShrink: 0 }}>
                {differenceInCalendarDays(parseISO(task.endDate), parseISO(task.startDate))}d
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Right: scrollable SVG timeline */}
        <Box ref={containerRef} sx={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <svg ref={svgRef} style={{ display: 'block', minHeight: svgHeight }} />
        </Box>
      </Box>

      {/* Task Name Edit Modal */}
      <Dialog open={!!nameModalTask} onClose={() => setNameModalTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>{t('editTaskName')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={nameModalValue}
            onChange={(e) => setNameModalValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
          <Button
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleDeleteTask}
            size="small"
          >
            {t('deleteTask')}
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => setNameModalTask(null)} size="small">{t('cancel')}</Button>
            <Button onClick={handleSaveName} variant="contained" size="small">{t('save')}</Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Bar Date Edit Modal */}
      <Dialog open={!!dateModalTask} onClose={() => setDateModalTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {t('editTaskDates')}{dateModalTask ? `: ${dateModalTask.name}` : ''}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={t('startDate')}
              type="date"
              size="small"
              fullWidth
              value={dateModalStart}
              onChange={(e) => setDateModalStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t('endDate')}
              type="date"
              size="small"
              fullWidth
              value={dateModalEnd}
              onChange={(e) => setDateModalEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ min: dateModalStart }}
            />
            {dateModalStart && dateModalEnd && dateModalStart < dateModalEnd && (
              <Typography variant="caption" color="text.secondary">
                {t('duration')}: {differenceInCalendarDays(parseISO(dateModalEnd), parseISO(dateModalStart))} {t('daysUnit')}
              </Typography>
            )}
            {dateModalStart && dateModalEnd && dateModalStart >= dateModalEnd && (
              <Typography variant="caption" color="error">
                {t('invalidDateRange')}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setDateModalTask(null)} size="small">{t('cancel')}</Button>
          <Button
            onClick={handleSaveDates}
            variant="contained"
            size="small"
            disabled={!dateModalStart || !dateModalEnd || dateModalStart >= dateModalEnd}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* New Task Modal */}
      <Dialog open={newTaskOpen} onClose={() => setNewTaskOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>{t('newTask')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              autoFocus
              label={t('taskName')}
              size="small"
              fullWidth
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask(); }}
            />
            <TextField
              label={t('startDate')}
              type="date"
              size="small"
              fullWidth
              value={newTaskStart}
              onChange={(e) => setNewTaskStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t('endDate')}
              type="date"
              size="small"
              fullWidth
              value={newTaskEnd}
              onChange={(e) => setNewTaskEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ min: newTaskStart }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>{t('parentTask')}</InputLabel>
              <Select
                value={newTaskParent}
                onChange={(e) => setNewTaskParent(e.target.value)}
                label={t('parentTask')}
              >
                <MenuItem value="">{t('noParent')}</MenuItem>
                {[...taskMap.values()].map(task => (
                  <MenuItem key={task.id} value={task.id}>{task.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {newTaskStart && newTaskEnd && newTaskStart < newTaskEnd && (
              <Typography variant="caption" color="text.secondary">
                {t('duration')}: {differenceInCalendarDays(parseISO(newTaskEnd), parseISO(newTaskStart))} {t('daysUnit')}
              </Typography>
            )}
            {newTaskStart && newTaskEnd && newTaskStart >= newTaskEnd && (
              <Typography variant="caption" color="error">
                {t('invalidDateRange')}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setNewTaskOpen(false)} size="small">{t('cancel')}</Button>
          <Button
            onClick={handleCreateTask}
            variant="contained"
            size="small"
            disabled={!newTaskName.trim() || !newTaskStart || !newTaskEnd || newTaskStart >= newTaskEnd}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
