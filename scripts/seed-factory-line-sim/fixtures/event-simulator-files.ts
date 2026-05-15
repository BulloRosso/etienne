/**
 * Files written into workspace/factory-line-sim/event-simulator/.
 *
 * The simulator is a standalone Node 20 + TS service the user runs
 * manually. It POSTs to /api/external-events/factory-line-sim/messages/<topic>,
 * so no MQTT broker is needed.
 */

export const PACKAGE_JSON = JSON.stringify(
  {
    name: 'factory-line-sim-event-simulator',
    version: '1.0.0',
    private: true,
    description: 'Simulates MQTT-style telemetry events for the factory-line-sim project.',
    type: 'module',
    scripts: {
      start: 'tsx src/simulator.ts',
      'start:burst': 'tsx src/simulator.ts --burst',
    },
    dependencies: {
      tsx: '^4.7.0',
    },
  },
  null,
  2,
);

export const TSCONFIG_JSON = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  },
  null,
  2,
);

export const ENV_EXAMPLE = `# Copy to .env and edit if needed.

# Backend API base. Default matches the local dev setup.
API_BASE=http://localhost:6060

# OAuth login (used to obtain a fresh access token on startup).
OAUTH_BASE=http://localhost:5950
OAUTH_USERNAME=admin
OAUTH_PASSWORD=admin123

# Project name to publish into.
PROJECT_NAME=factory-line-sim

# Routine emission uses an escalating cadence:
#   immediately, +10s, +60s, +5min, +15min, +30min, +60min, then steady at 60min.
# INTERVAL_MS is kept for backwards compatibility but is no longer used in routine mode.
INTERVAL_MS=10000
`;

export const README_MD = `# Event Simulator — factory-line-sim

A standalone TypeScript service that emits MQTT-style telemetry events for
the factory line. **Does not need a real MQTT broker** — events are POSTed
to the backend's external-events HTTP API:

\`\`\`
POST /api/external-events/factory-line-sim/messages/<topic>
\`\`\`

The events show up immediately in the line-timeline dashboard's "latest
MQTT events" panel and are persisted by the backend.

## Setup

\`\`\`bash
cd workspace/factory-line-sim/event-simulator
npm install
cp .env.example .env
# edit .env if your backend isn't on localhost:6060
\`\`\`

## Run (continuous mode)

\`\`\`bash
npm start
\`\`\`

Emits routine events on an escalating cadence: immediately, then +10s,
+60s, +5min, +15min, +30min, +60min, and steady at 60min thereafter.
Mostly \`spindle_load_warn\` and \`coolant_temp_high\` (low values), with
the occasional \`tool_change_overdue\` or \`ambient_temp_deviation\`.

## Run an incident burst

\`\`\`bash
# Bursts available: chip-jam, coolant-degradation, vision-recalibration
npm start -- --burst chip-jam
\`\`\`

A burst emits a coordinated sequence of events over ~90 seconds — useful
for live demos. After the burst completes, the simulator returns to
routine mode (Ctrl+C to stop).

## Stop
Ctrl+C. The simulator's only side effect is HTTP POSTs to the backend.
`;

export const SIMULATOR_TS = `/**
 * Factory-line event simulator.
 *
 * Authenticates with the OAuth server once on startup, then either:
 *   - emits one routine event per INTERVAL_MS, or
 *   - emits a coordinated incident burst (--burst <name>) and then
 *     drops back to routine mode.
 */

import 'dotenv/config';
import { runRoutine, runBurst } from './scenarios.js';

interface Env {
  apiBase: string;
  oauthBase: string;
  username: string;
  password: string;
  project: string;
  intervalMs: number;
}

function readEnv(): Env {
  return {
    apiBase:    process.env.API_BASE     || 'http://localhost:6060',
    oauthBase:  process.env.OAUTH_BASE   || 'http://localhost:5950',
    username:   process.env.OAUTH_USERNAME || 'admin',
    password:   process.env.OAUTH_PASSWORD || 'admin123',
    project:    process.env.PROJECT_NAME || 'factory-line-sim',
    intervalMs: Number(process.env.INTERVAL_MS) || 10_000,
  };
}

async function login(env: Env): Promise<string> {
  const r = await fetch(\`\${env.oauthBase}/auth/login\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: env.username, password: env.password }),
  });
  if (!r.ok) throw new Error(\`login failed: HTTP \${r.status}\`);
  const data = await r.json() as { accessToken?: string };
  if (!data.accessToken) throw new Error('login response missing accessToken');
  return data.accessToken;
}

function parseArgs(): { burst?: string } {
  const args = process.argv.slice(2);
  const burstIdx = args.indexOf('--burst');
  if (burstIdx !== -1 && args[burstIdx + 1]) return { burst: args[burstIdx + 1] };
  return {};
}

async function main(): Promise<void> {
  const env = readEnv();
  console.log(\`[simulator] target: \${env.apiBase} project=\${env.project}\`);
  const token = await login(env);
  console.log('[simulator] authenticated');

  const { burst } = parseArgs();
  if (burst) {
    console.log(\`[simulator] running burst: \${burst}\`);
    await runBurst(burst, { token, ...env });
    console.log('[simulator] burst complete; switching to routine mode');
  }
  console.log('[simulator] routine emission cadence: 0s, +10s, +60s, +5min, +15min, +30min, +60min, then steady at 60min (Ctrl+C to stop)');
  await runRoutine({ token, ...env });
}

main().catch((err) => {
  console.error('[simulator] FAILED:', err);
  process.exit(1);
});
`;

export const EVENTS_TS = `/**
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
`;

export const SCENARIOS_TS = `import { post } from './api-client.js';
import {
  spindleLoadWarn, coolantTempHigh, toolChangeOverdue,
  binFull, conveyorJamDetected, fixtureClampPressureLow,
  cameraFocusDrift, ambientTempDeviation,
} from './events.js';

interface Ctx {
  token: string;
  apiBase: string;
  project: string;
  intervalMs: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Escalating cadence between consecutive routine events:
// fire immediately, then +10s, +60s, +5min, +15min, +30min, +60min, then steady at 60min.
const ESCALATING_DELAYS_MS = [0, 10_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

function nextDelayMs(index: number): number {
  return ESCALATING_DELAYS_MS[Math.min(index, ESCALATING_DELAYS_MS.length - 1)];
}

/** Routine emission: weighted toward boring telemetry. */
export async function runRoutine(ctx: Ctx): Promise<never> {
  let i = 0;
  while (true) {
    await sleep(nextDelayMs(i));
    const r = Math.random();
    let evt;
    if (r < 0.55) {
      evt = spindleLoadWarn(78 + Math.random() * 8);
    } else if (r < 0.80) {
      evt = coolantTempHigh(56 + Math.random() * 5); // below threshold most of the time
    } else if (r < 0.90) {
      evt = ambientTempDeviation(0.8 + Math.random() * 1.0);
    } else if (r < 0.95) {
      evt = fixtureClampPressureLow('X', 5.6 + Math.random() * 0.4);
    } else {
      evt = toolChangeOverdue('T12', 950 + Math.floor(Math.random() * 60), 1000);
    }
    await post(ctx, evt);
    process.stdout.write(\`. \${evt.type}\\n\`);
    i++;
  }
}

/** Coordinated incident bursts. Each lasts ~60-90 s. */
export async function runBurst(name: string, ctx: Ctx): Promise<void> {
  switch (name) {
    case 'chip-jam':       return chipJamBurst(ctx);
    case 'coolant-degradation': return coolantBurst(ctx);
    case 'vision-recalibration': return visionBurst(ctx);
    default:
      console.error(\`Unknown burst "\${name}". Available: chip-jam, coolant-degradation, vision-recalibration.\`);
      process.exit(2);
  }
}

async function chipJamBurst(ctx: Ctx): Promise<void> {
  // bin fills, then conveyor jams, then spindle load surges, then alarm.
  for (const fill of [85, 92, 100]) {
    await post(ctx, { ...binFull(fill) });
    process.stdout.write(\`! bin_full \${fill}%\\n\`);
    await sleep(8000);
  }
  await post(ctx, conveyorJamDetected());
  process.stdout.write('! conveyor_jam_detected\\n');
  await sleep(3000);
  await post(ctx, spindleLoadWarn(96, 'T07'));
  process.stdout.write('! spindle_load_warn 96% T07\\n');
  await sleep(2000);
  await post(ctx, spindleLoadWarn(98, 'T07'));
  process.stdout.write('! spindle_load_warn 98% T07\\n');
}

async function coolantBurst(ctx: Ctx): Promise<void> {
  // gradually rising coolant temperature crossing the 65 °C threshold.
  for (const t of [62, 64, 66, 67.5, 68.2, 67.8, 66.5, 65.2]) {
    await post(ctx, coolantTempHigh(t));
    process.stdout.write(\`! coolant_temp_high \${t}°C\\n\`);
    await sleep(12000);
  }
}

async function visionBurst(ctx: Ctx): Promise<void> {
  for (const blur of [4.8, 5.4, 6.1, 6.8, 7.3]) {
    await post(ctx, cameraFocusDrift(blur));
    process.stdout.write(\`! camera_focus_drift blur=\${blur}\\n\`);
    await sleep(15000);
  }
}
`;

export const API_CLIENT_TS = `import type { MqttEvent } from './events.js';

interface Ctx {
  token: string;
  apiBase: string;
  project: string;
}

export async function post(ctx: Ctx, evt: MqttEvent): Promise<void> {
  const url = \`\${ctx.apiBase}/api/external-events/\${encodeURIComponent(ctx.project)}/messages/\${encodeURIComponent(evt.topic)}\`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': \`Bearer \${ctx.token}\`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: evt.type,
      machine: evt.machine,
      ts: evt.ts,
      payload: evt.payload,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.error(\`[api] POST \${url} → HTTP \${r.status}: \${body.slice(0, 200)}\`);
  }
}
`;
