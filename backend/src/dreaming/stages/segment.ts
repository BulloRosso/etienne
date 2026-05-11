import { promises as fs } from 'fs';
import { Logger } from '@nestjs/common';
import { DreamingQueue } from '../queue/queue';
import { ReflectPayload, SegmentPayload, Trajectory } from './stage-types';

const log = new Logger('Dreaming/SEGMENT');
const TRAJECTORY_TURN_WINDOW = 12; // turns per trajectory window
const TRAJECTORY_STEP = 6;          // sliding-window step

/**
 * Cut each session into trajectory windows, annotate each with a coarse outcome heuristic,
 * and enqueue one REFLECT job per trajectory.
 */
export async function runSegment(
  payload: SegmentPayload,
  parentJobId: number,
  runId: string,
  queue: DreamingQueue,
): Promise<void> {
  const trajectories: Trajectory[] = [];

  for (const sessionFile of payload.sessionFiles) {
    let raw: string;
    try { raw = await fs.readFile(sessionFile, 'utf8'); } catch { continue; }
    const turns: any[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { turns.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
    if (turns.length < 4) continue;

    for (let start = 0; start < turns.length; start += TRAJECTORY_STEP) {
      const window = turns.slice(start, start + TRAJECTORY_TURN_WINDOW);
      if (window.length < 4) break;
      const signals = scoreOutcome(window);
      const outcome: Trajectory['outcome'] =
        signals.toolErrors >= 2 ? 'failure'
        : signals.toolErrors === 0 && signals.retries === 0 ? 'success'
        : 'unknown';
      trajectories.push({
        trajectoryId: `${runId}-${payload.domain}-${start}-${Math.random().toString(36).slice(2, 6)}`,
        domain: payload.domain,
        sessionFile,
        turns: window,
        outcome,
        outcomeSignals: signals,
      });
    }
  }

  for (const t of trajectories) {
    const reflectPayload: ReflectPayload = { project: payload.project, trajectory: t };
    queue.enqueue('reflect', reflectPayload, { runId, domain: payload.domain, parentId: parentJobId });
  }

  log.log(`[${payload.project}] SEGMENT(${payload.domain}): ${trajectories.length} trajectories`);
}

function scoreOutcome(turns: any[]): { toolErrors: number; retries: number } {
  let toolErrors = 0;
  let retries = 0;
  for (const t of turns) {
    const text = String(t.message ?? '');
    if (/error|failed|exception/i.test(text)) toolErrors++;
    if (/retry|try again|tried again/i.test(text)) retries++;
  }
  return { toolErrors, retries };
}
