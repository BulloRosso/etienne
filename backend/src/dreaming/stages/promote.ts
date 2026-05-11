import { Logger } from '@nestjs/common';
import { DreamingQueue } from '../queue/queue';
import { ConsolidatedCandidate, IndexPayload, PromotePayload } from './stage-types';

const log = new Logger('Dreaming/PROMOTE');

/**
 * Three-gate threshold filter on a single candidate.
 * G1 Light: confidence ≥ 0.6 AND supportCount ≥ 1
 * G2 REM:   webScore supports OR cross-trajectory ≥ 2
 * G3 Deep:  composite = w1·confidence + w2·support + w3·web + w4·diversity ≥ τ=0.78
 *
 * G1/G2 rejects are kept in buffered_candidates for next run.
 */
const TAU = 0.78;
const W = { confidence: 0.30, support: 0.25, web: 0.25, diversity: 0.20 };

export async function runPromote(
  payload: PromotePayload,
  parentJobId: number,
  runId: string,
  queue: DreamingQueue,
): Promise<void> {
  const c = payload.candidate;

  const g1 = c.confidence >= 0.6 && c.supportCount >= 1;
  if (!g1) {
    queue.bufferCandidate(runId, payload.domain, c, c.compositeScore);
    log.log(`[${payload.project}] PROMOTE(${payload.domain}) G1 reject: ${c.title}`);
    return;
  }

  const webOk = (c.webScore ?? 0) > 0 || c.supportCount >= 2;
  if (!webOk) {
    queue.bufferCandidate(runId, payload.domain, c, c.compositeScore);
    log.log(`[${payload.project}] PROMOTE(${payload.domain}) G2 reject: ${c.title}`);
    return;
  }

  const composite = computeComposite(c);
  if (composite < TAU) {
    queue.bufferCandidate(runId, payload.domain, { ...c, compositeScore: composite }, composite);
    log.log(`[${payload.project}] PROMOTE(${payload.domain}) G3 reject (score=${composite.toFixed(3)}): ${c.title}`);
    return;
  }

  const promoted: ConsolidatedCandidate = { ...c, compositeScore: composite };
  const indexPayload: IndexPayload = { project: payload.project, runId, domain: payload.domain, candidate: promoted };
  queue.enqueue('index', indexPayload, { runId, domain: payload.domain, parentId: parentJobId });
  log.log(`[${payload.project}] PROMOTE(${payload.domain}) PASS (score=${composite.toFixed(3)}): ${c.title}`);
}

function computeComposite(c: ConsolidatedCandidate): number {
  const supportNorm = Math.min(1, c.supportCount / 5);
  const webNorm = c.webScore ?? 0; // already normalized to [-1, 1] from GROUND; floor at 0 for promotion
  return (
    W.confidence * c.confidence +
    W.support * supportNorm +
    W.web * Math.max(0, webNorm) +
    W.diversity * c.diversityScore
  );
}
