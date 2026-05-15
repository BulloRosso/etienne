import { post } from './api-client.js';
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
    process.stdout.write(`. ${evt.type}\n`);
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
      console.error(`Unknown burst "${name}". Available: chip-jam, coolant-degradation, vision-recalibration.`);
      process.exit(2);
  }
}

async function chipJamBurst(ctx: Ctx): Promise<void> {
  // bin fills, then conveyor jams, then spindle load surges, then alarm.
  for (const fill of [85, 92, 100]) {
    await post(ctx, { ...binFull(fill) });
    process.stdout.write(`! bin_full ${fill}%\n`);
    await sleep(8000);
  }
  await post(ctx, conveyorJamDetected());
  process.stdout.write('! conveyor_jam_detected\n');
  await sleep(3000);
  await post(ctx, spindleLoadWarn(96, 'T07'));
  process.stdout.write('! spindle_load_warn 96% T07\n');
  await sleep(2000);
  await post(ctx, spindleLoadWarn(98, 'T07'));
  process.stdout.write('! spindle_load_warn 98% T07\n');
}

async function coolantBurst(ctx: Ctx): Promise<void> {
  // gradually rising coolant temperature crossing the 65 °C threshold.
  for (const t of [62, 64, 66, 67.5, 68.2, 67.8, 66.5, 65.2]) {
    await post(ctx, coolantTempHigh(t));
    process.stdout.write(`! coolant_temp_high ${t}°C\n`);
    await sleep(12000);
  }
}

async function visionBurst(ctx: Ctx): Promise<void> {
  for (const blur of [4.8, 5.4, 6.1, 6.8, 7.3]) {
    await post(ctx, cameraFocusDrift(blur));
    process.stdout.write(`! camera_focus_drift blur=${blur}\n`);
    await sleep(15000);
  }
}
