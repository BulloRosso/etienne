/**
 * The 8 event types the line emits, with payload builders.
 * Wire shape posted to /api/external-events/<project>/messages/<topic>:
 *   { type, machine, ts, ...payload }
 */

export interface MqttEvent {
  topic: string;
  type: string;
  machine: string;
  ts: string;
  payload: Record<string, unknown>;
}

const TOOLS = ['T07', 'T12', 'T18', 'T22'];

export function spindleLoadWarn(load_pct: number, tool_id?: string): MqttEvent {
  return {
    topic: 'cnc-5ax/telemetry',
    type: 'spindle_load_warn',
    machine: 'CNC-5AX',
    ts: new Date().toISOString(),
    payload: { load_pct, tool_id: tool_id || TOOLS[Math.floor(Math.random() * TOOLS.length)] },
  };
}

export function coolantTempHigh(temp: number): MqttEvent {
  return {
    topic: 'cnc-5ax/telemetry',
    type: 'coolant_temp_high',
    machine: 'CNC-5AX',
    ts: new Date().toISOString(),
    payload: { temp, threshold: 65 },
  };
}

export function toolChangeOverdue(tool_id: string, cycles: number, life: number): MqttEvent {
  return {
    topic: 'cnc-5ax/maintenance',
    type: 'tool_change_overdue',
    machine: 'CNC-5AX',
    ts: new Date().toISOString(),
    payload: { tool_id, cycles_used: cycles, life },
  };
}

export function binFull(fill_pct: number): MqttEvent {
  return {
    topic: 'cnc-5ax/chip-evacuation',
    type: 'bin_full',
    machine: 'CNC-5AX',
    ts: new Date().toISOString(),
    payload: { fill_pct },
  };
}

export function conveyorJamDetected(): MqttEvent {
  return {
    topic: 'cnc-5ax/chip-evacuation',
    type: 'conveyor_jam_detected',
    machine: 'CNC-5AX',
    ts: new Date().toISOString(),
    payload: { jam_location: 'chip_bin' },
  };
}

export function fixtureClampPressureLow(axis: 'X' | 'Y' | 'Z', pressure_bar: number): MqttEvent {
  return {
    topic: 'cnc-5ax/telemetry',
    type: 'fixture_clamp_pressure_low',
    machine: 'CNC-5AX',
    ts: new Date().toISOString(),
    payload: { axis, pressure_bar, min: 5.0 },
  };
}

export function cameraFocusDrift(blur_score: number): MqttEvent {
  return {
    topic: 'qa-insp/telemetry',
    type: 'camera_focus_drift',
    machine: 'QA-INSP',
    ts: new Date().toISOString(),
    payload: { blur_score, threshold: 5.0 },
  };
}

export function ambientTempDeviation(temp_delta_from_baseline: number): MqttEvent {
  return {
    topic: 'line/environment',
    type: 'ambient_temp_deviation',
    machine: 'LINE',
    ts: new Date().toISOString(),
    payload: { temp_delta_from_baseline },
  };
}
