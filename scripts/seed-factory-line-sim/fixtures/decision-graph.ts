/**
 * Hand-authored decision graph for the coolant-degradation response.
 * Matches DecisionGraph from
 * backend/src/ontology-core/interfaces/decision-graph.interface.ts.
 *
 * Story: when coolant_temp_high fires AND surface defects in the past 4h
 * exceed 3, raise an action item suggesting an unscheduled coolant check.
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
