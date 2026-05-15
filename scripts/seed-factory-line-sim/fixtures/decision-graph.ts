/**
 * Hand-authored decision graphs for factory-line-sim.
 *
 * Each graph matches DecisionGraph from
 * backend/src/ontology-core/interfaces/decision-graph.interface.ts and
 * targets entity ids that exist in fixtures/ontology.ts. With four graphs
 * sharing the Machine entities, the Decision Support Studio's Ontology
 * view shows CNC-5AX as a hub with multiple incoming graph references.
 *
 * Stories:
 *   1. coolant-degradation-response — coolant_temp_high + surface defects
 *      → notify shift lead to do an unscheduled coolant check
 *   2. chip-evacuation-response — bin_full + conveyor_jam_detected
 *      → halt CNC-5AX, inspect tools used since the last bin-empty
 *   3. tool-wear-preemptive-swap — tool_change_overdue + IT7 order running
 *      → swap before resuming (tighter tolerance, last 10% of tool life
 *      causes most dimensional drift)
 *   4. vision-recalibration — camera_focus_drift on QA-INSP
 *      → schedule recalibration before reject rate masks an upstream issue
 */

import { TODAY } from './mission';

export const COOLANT_DECISION_GRAPH = {
  id: 'coolant-degradation-response',
  title: 'Coolant degradation response',
  description:
    'Trigger when coolant_temp_high MQTT events coincide with a surface-finish defect spike on QA-INSP. Suggest unscheduled coolant check rather than waiting for the scheduled change.',
  project: 'factory-line-sim',
  createdAt: `${TODAY}T08:00:00Z`,
  updatedAt: `${TODAY}T08:00:00Z`,
  chatContextSummary:
    'Operator chat session traced PO-1003 surface defects to elevated coolant temperature on the same afternoon. Operator decided to add unscheduled coolant test for future occurrences instead of waiting for the 120-hour change cycle.',
  conditions: [
    {
      id: 'cond-coolant-high',
      targetEntityType: 'Machine',
      targetEntityId: 'CNC-5AX',
      property: 'coolant_temperature',
      operator: 'gt' as const,
      value: '65',
      description: 'Coolant temperature above 65 °C threshold',
      zeromqEvent: 'cnc-5ax/telemetry/coolant_temp_high',
    },
    {
      id: 'cond-surface-defects',
      targetEntityType: 'QualityWindow',
      targetEntityId: 'QA-INSP',
      property: 'surface_defect_count_last_4h',
      operator: 'gt' as const,
      value: '3',
      description: 'More than 3 surface_finish/staining defects logged at QA-INSP in last 4h',
    },
  ],
  actions: [
    {
      id: 'act-notify-operator',
      name: 'Notify operator: unscheduled coolant check',
      description:
        'Raise an immediate operator notification suggesting they pause the run and verify coolant temperature, pH, and concentration before continuing the IT7 portion of the order.',
      targetEntityType: 'Operator',
      targetEntityId: 'cell-a-shift-lead',
      actionType: 'notify',
      parameters: {
        channel: 'shop_floor_screen',
        priority: 'high',
        message:
          'Coolant temp + surface defects rising — pause CNC-5AX, verify coolant before resuming.',
      },
      preconditions: ['cond-coolant-high', 'cond-surface-defects'],
      status: 'pending' as const,
      zeromqEmit: 'line/notifications/operator',
    },
  ],
  nodes: [
    {
      id: 'node-trigger',
      type: 'trigger' as const,
      label: 'Coolant temperature event',
      description: 'cnc-5ax/telemetry/coolant_temp_high MQTT event fires',
      entityType: 'Machine',
      entityId: 'CNC-5AX',
      conditionId: 'cond-coolant-high',
    },
    {
      id: 'node-check-quality',
      type: 'condition' as const,
      label: 'Recent surface-defect spike?',
      description: 'Check last 4 h of QA-INSP for >3 surface_finish or surface_staining defects',
      entityType: 'QualityWindow',
      entityId: 'QA-INSP',
      conditionId: 'cond-surface-defects',
    },
    {
      id: 'node-action',
      type: 'action' as const,
      label: 'Suggest coolant check',
      description: 'Push notification to Cell A shift lead',
      entityType: 'Operator',
      entityId: 'cell-a-shift-lead',
      actionId: 'act-notify-operator',
    },
    {
      id: 'node-outcome',
      type: 'outcome' as const,
      label: 'Operator pauses, checks coolant, decides',
      description:
        'Operator either swaps coolant (best case, prevents further defects) or accepts risk and continues. Outcome logged to status JSON.',
    },
  ],
  edges: [
    { id: 'e1', source: 'node-trigger', target: 'node-check-quality', label: 'fired' },
    { id: 'e2', source: 'node-check-quality', target: 'node-action', label: 'true' },
    { id: 'e3', source: 'node-action', target: 'node-outcome', label: 'sent' },
  ],
};

// ── 2. Chip-evacuation response ─────────────────────────────────────
export const CHIP_EVAC_DECISION_GRAPH = {
  id: 'chip-evacuation-response',
  title: 'Chip-evacuation response',
  description:
    'When the chip bin overflows or the conveyor jams on CNC-5AX, halt the run and inspect every tool used since the previous bin-empty. Re-circulating chips damage tool edges and produce next-day dimensional + edge defects.',
  project: 'factory-line-sim',
  createdAt: `${TODAY}T08:00:00Z`,
  updatedAt: `${TODAY}T08:00:00Z`,
  chatContextSummary:
    'PO-1005 dimensional cluster traced to a chip-evacuation jam on 2026-05-11. Operator inspected tools at EOD and found T07 chipped — too late to save 6 parts. Pattern: catch the jam, inspect immediately, do not let the run continue blindly.',
  conditions: [
    {
      id: 'cond-bin-full',
      targetEntityType: 'Machine',
      targetEntityId: 'CNC-5AX',
      property: 'chip_bin_fill_pct',
      operator: 'gte' as const,
      value: '100',
      description: 'Chip bin at or over capacity',
      zeromqEvent: 'cnc-5ax/chip-evacuation/bin_full',
    },
    {
      id: 'cond-conveyor-jam',
      targetEntityType: 'Machine',
      targetEntityId: 'CNC-5AX',
      property: 'conveyor_torque_alarm',
      operator: 'eq' as const,
      value: 'true',
      description: 'Conveyor torque alarm tripped',
      zeromqEvent: 'cnc-5ax/chip-evacuation/conveyor_jam_detected',
    },
  ],
  actions: [
    {
      id: 'act-halt-and-inspect',
      name: 'Halt CNC-5AX and inspect tools',
      description:
        'Pause the running program at the next safe stop, empty the chip bin, and visually inspect every tool used since the last bin-empty event. Flag any with chip damage for replacement.',
      targetEntityType: 'Operator',
      targetEntityId: 'cell-a-shift-lead',
      actionType: 'notify',
      parameters: {
        channel: 'shop_floor_screen',
        priority: 'critical',
        message: 'Chip jam — halt CNC-5AX, empty bin, inspect tools used since last empty.',
      },
      preconditions: ['cond-bin-full', 'cond-conveyor-jam'],
      status: 'pending' as const,
      zeromqEmit: 'line/notifications/operator',
    },
  ],
  nodes: [
    { id: 'node-trigger', type: 'trigger' as const,
      label: 'Bin full / conveyor jam',
      description: 'bin_full or conveyor_jam_detected MQTT event fires',
      entityType: 'Machine', entityId: 'CNC-5AX', conditionId: 'cond-bin-full' },
    { id: 'node-check-jam', type: 'condition' as const,
      label: 'Conveyor torque tripped?',
      description: 'Confirm conveyor_jam_detected within last 60 s',
      entityType: 'Machine', entityId: 'CNC-5AX', conditionId: 'cond-conveyor-jam' },
    { id: 'node-action', type: 'action' as const,
      label: 'Halt + inspect tools',
      description: 'Push critical notification to Cell A shift lead',
      entityType: 'Operator', entityId: 'cell-a-shift-lead', actionId: 'act-halt-and-inspect' },
    { id: 'node-outcome', type: 'outcome' as const,
      label: 'Operator halts run, inspects, swaps damaged tool',
      description: 'Best case: damaged tool found and swapped before next part. Worst case: run continues after bin empty without inspection.' },
  ],
  edges: [
    { id: 'e1', source: 'node-trigger', target: 'node-check-jam', label: 'fired' },
    { id: 'e2', source: 'node-check-jam', target: 'node-action', label: 'true' },
    { id: 'e3', source: 'node-action', target: 'node-outcome', label: 'sent' },
  ],
};

// ── 3. Tool-wear preemptive swap ────────────────────────────────────
export const TOOL_WEAR_DECISION_GRAPH = {
  id: 'tool-wear-preemptive-swap',
  title: 'Tool-wear preemptive swap',
  description:
    'When tool_change_overdue fires AND the running production order requires IT7 tolerance, swap the tool BEFORE resuming. The last 10% of nominal tool life is where dimensional drift accelerates — fine for IT8 but unacceptable for IT7.',
  project: 'factory-line-sim',
  createdAt: `${TODAY}T08:00:00Z`,
  updatedAt: `${TODAY}T08:00:00Z`,
  chatContextSummary:
    'Tool-life policy says swap at 90% on IT7 orders. The MQTT event fires at 100%, which is too late on a tight tolerance. This rule closes the gap.',
  conditions: [
    {
      id: 'cond-tool-overdue',
      targetEntityType: 'Tool',
      targetEntityId: 'T12',
      property: 'cycles_used',
      operator: 'gte' as const,
      value: '900',
      description: 'Tool at or above 90% of cycle limit (overdue for IT7 work)',
      zeromqEvent: 'cnc-5ax/maintenance/tool_change_overdue',
    },
    {
      id: 'cond-it7-running',
      targetEntityType: 'ProductionOrder',
      property: 'tolerance_grade',
      operator: 'eq' as const,
      value: 'IT7',
      description: 'Currently-running order requires IT7 tolerance',
    },
  ],
  actions: [
    {
      id: 'act-swap-tool',
      name: 'Swap tool before resuming',
      description:
        'Pause at next safe stop, swap the flagged tool, log the swap in the day status JSON, then resume.',
      targetEntityType: 'Operator',
      targetEntityId: 'cell-a-shift-lead',
      actionType: 'notify',
      parameters: {
        channel: 'shop_floor_screen',
        priority: 'high',
        message: 'IT7 order + tool ≥90% life — swap before resuming.',
      },
      preconditions: ['cond-tool-overdue', 'cond-it7-running'],
      status: 'pending' as const,
      zeromqEmit: 'line/notifications/operator',
    },
  ],
  nodes: [
    { id: 'node-trigger', type: 'trigger' as const,
      label: 'Tool overdue event',
      description: 'tool_change_overdue MQTT event fires',
      entityType: 'Tool', entityId: 'T12', conditionId: 'cond-tool-overdue' },
    { id: 'node-check-tolerance', type: 'condition' as const,
      label: 'Order is IT7?',
      description: 'Check tolerance_grade of the currently-running production order',
      entityType: 'ProductionOrder', conditionId: 'cond-it7-running' },
    { id: 'node-action', type: 'action' as const,
      label: 'Swap tool',
      description: 'Push notification to Cell A shift lead',
      entityType: 'Operator', entityId: 'cell-a-shift-lead', actionId: 'act-swap-tool' },
    { id: 'node-outcome', type: 'outcome' as const,
      label: 'Tool swapped, run continues with fresh edge',
      description: 'IT7 tolerance preserved across the run; no late-life dimensional drift.' },
  ],
  edges: [
    { id: 'e1', source: 'node-trigger', target: 'node-check-tolerance', label: 'fired' },
    { id: 'e2', source: 'node-check-tolerance', target: 'node-action', label: 'IT7' },
    { id: 'e3', source: 'node-check-tolerance', target: 'node-outcome', label: 'IT8 — defer' },
    { id: 'e4', source: 'node-action', target: 'node-outcome', label: 'sent' },
  ],
};

// ── 4. Vision recalibration ─────────────────────────────────────────
export const VISION_RECAL_DECISION_GRAPH = {
  id: 'vision-recalibration',
  title: 'Vision system recalibration',
  description:
    'When camera_focus_drift fires on QA-INSP, schedule a recalibration before the reject rate spikes and masks (or fakes) an upstream signal. False rejects waste good parts; false passes ship bad ones.',
  project: 'factory-line-sim',
  createdAt: `${TODAY}T08:00:00Z`,
  updatedAt: `${TODAY}T08:00:00Z`,
  chatContextSummary:
    'Vision calibration drifts after ~1000 cycles. Without a proactive recalibration, a sudden reject-rate spike on QA-INSP can be misread as an upstream CNC-5AX issue and waste hours of investigation.',
  conditions: [
    {
      id: 'cond-focus-drift',
      targetEntityType: 'Machine',
      targetEntityId: 'QA-INSP',
      property: 'blur_score',
      operator: 'gt' as const,
      value: '5.0',
      description: 'Camera blur score above acceptance threshold',
      zeromqEvent: 'qa-insp/telemetry/camera_focus_drift',
    },
  ],
  actions: [
    {
      id: 'act-schedule-recal',
      name: 'Schedule QA-INSP recalibration',
      description:
        'Run program CAL-9000 at next idle window. Block new inspection items until calibration passes; re-route them to the buffer rack.',
      targetEntityType: 'Operator',
      targetEntityId: 'cell-b-shift-lead',
      actionType: 'notify',
      parameters: {
        channel: 'shop_floor_screen',
        priority: 'medium',
        message: 'QA-INSP focus drift — recalibrate before next batch.',
      },
      preconditions: ['cond-focus-drift'],
      status: 'pending' as const,
      zeromqEmit: 'line/notifications/operator',
    },
  ],
  nodes: [
    { id: 'node-trigger', type: 'trigger' as const,
      label: 'Camera focus drift',
      description: 'camera_focus_drift MQTT event fires',
      entityType: 'Machine', entityId: 'QA-INSP', conditionId: 'cond-focus-drift' },
    { id: 'node-action', type: 'action' as const,
      label: 'Schedule recalibration',
      description: 'Notify Cell B shift lead',
      entityType: 'Operator', entityId: 'cell-b-shift-lead', actionId: 'act-schedule-recal' },
    { id: 'node-outcome', type: 'outcome' as const,
      label: 'CAL-9000 run, focus restored',
      description: 'Reject rate returns to baseline; future reject spikes are trustworthy upstream signals.' },
  ],
  edges: [
    { id: 'e1', source: 'node-trigger', target: 'node-action', label: 'fired' },
    { id: 'e2', source: 'node-action', target: 'node-outcome', label: 'sent' },
  ],
};

/** All decision graphs the seed should persist. */
export const DECISION_GRAPHS = [
  COOLANT_DECISION_GRAPH,
  CHIP_EVAC_DECISION_GRAPH,
  TOOL_WEAR_DECISION_GRAPH,
  VISION_RECAL_DECISION_GRAPH,
];
