/**
 * Stage 1 — quality scoring (PRD §6.1).
 *
 * Score a SessionRecord on [0, 1] based on turn efficiency relative to
 * workspace outcome. The shape of the formula is:
 *
 *   workspaceMatch × (baselineTurns / max(1, baselineTurns + corrections + retries))
 *
 * High when a small number of user turns produced a meaningful workspace
 * change; low when many corrections / retries were required regardless of
 * the final outcome.
 *
 * Standalone module so the Ponderer can apply it per-session without
 * pulling NestJS into the scoring path. The Ponderer service injects
 * SessionsStore and SkillsStore and calls `scoreSession(...)` directly.
 */

import type { SessionRecord, Skill, SessionTurn } from '../../memory/types';

export interface QualityScoreInputs {
  session: SessionRecord;
  /** Active skills carried by the session — supplies baselineTurns. */
  activeSkills: Skill[];
}

export interface QualityScoreBreakdown {
  score: number;
  userCorrectionTurns: number;
  agentRetryTurns: number;
  workspaceMatch: number;
  baselineTurns: number;
}

/**
 * Default expected baseline when a skill doesn't supply `baselineTurns`.
 * Picked to make a 1-2 turn session score reasonably high.
 */
const DEFAULT_BASELINE = 3;

const CORRECTION_PATTERN = /\b(no|wrong|actually|instead|undo|revert|stop|that's not|nope)\b/i;
const RETRY_HINT_PATTERN = /\b(retry|trying again|let me try|re-run)\b/i;

/**
 * Score a session. Returns the score plus the inputs it was derived from so
 * downstream consumers (the review queue, the UI) can show *why* a session
 * scored the way it did.
 */
export function scoreSession(inputs: QualityScoreInputs): QualityScoreBreakdown {
  const userCorrectionTurns = countUserCorrections(inputs.session.turns);
  const agentRetryTurns = countAgentRetries(inputs.session.turns);
  const workspaceMatch = computeWorkspaceMatch(inputs.session);
  const baselineTurns = sumBaselineTurns(inputs.activeSkills);

  const denominator = Math.max(1, baselineTurns + userCorrectionTurns + agentRetryTurns);
  const raw = workspaceMatch * (baselineTurns / denominator);
  const score = clamp01(raw);

  return {
    score,
    userCorrectionTurns,
    agentRetryTurns,
    workspaceMatch,
    baselineTurns,
  };
}

// --- breakdown components ------------------------------------------------

function countUserCorrections(turns: SessionTurn[]): number {
  let n = 0;
  for (const t of turns) {
    if (t.role !== 'user') continue;
    if (CORRECTION_PATTERN.test(t.content)) n += 1;
  }
  return n;
}

function countAgentRetries(turns: SessionTurn[]): number {
  let n = 0;
  for (const t of turns) {
    if (t.role !== 'agent') continue;
    if (RETRY_HINT_PATTERN.test(t.content)) n += 1;
  }
  return n;
}

/**
 * Compute the workspace-change signal. Strategy in order of preference:
 *   1. If both snapshots are git refs and they differ, treat as "definitely
 *      changed" — score 1.0.
 *   2. If both are `nogit:...` placeholders, fall back to a heuristic from
 *     the agent's tool-use record: any successful writeback → 1.0, else 0.5.
 *   3. If snapshots are missing or only one is present, score 0.5 (we don't
 *     know whether work happened).
 */
function computeWorkspaceMatch(session: SessionRecord): number {
  const before = session.workspaceSnapshotBefore;
  const after = session.workspaceSnapshotAfter;
  const isGit = (s: string): boolean => Boolean(s) && !s.startsWith('nogit:');

  if (isGit(before) && isGit(after)) {
    return before === after ? 0.2 : 1.0;
  }
  if (before && after) {
    // both nogit; fall back to writeback signal
    const anyWrites = session.turns.some((t) => (t.storeWrites?.length ?? 0) > 0);
    return anyWrites ? 1.0 : 0.5;
  }
  return 0.5;
}

function sumBaselineTurns(skills: Skill[]): number {
  if (skills.length === 0) return DEFAULT_BASELINE;
  let total = 0;
  let withBaseline = 0;
  for (const s of skills) {
    if (typeof s.frontmatter.baselineTurns === 'number') {
      total += s.frontmatter.baselineTurns;
      withBaseline += 1;
    }
  }
  if (withBaseline === 0) return DEFAULT_BASELINE;
  // Average so multiple skills don't inflate the denominator.
  return Math.max(1, Math.round(total / withBaseline));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
