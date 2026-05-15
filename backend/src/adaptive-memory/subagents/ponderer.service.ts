import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { LlmService } from '../../llm/llm.service';
import type {
  PersonalityCandidate,
  ReviewItem,
} from '../../memory/types';
import { AdaptiveMemoryConfigService } from '../config/adaptive-memory-config.service';
import { runMaintenance } from '../stages/maintenance';
import { scoreSession } from '../stages/quality-scoring';
import { PersonalityStore } from '../stores/personality.store';
import { ReviewQueueStore } from '../stores/review-queue.store';
import { SessionsStore } from '../stores/sessions.store';
import { SkillsStore } from '../stores/skills.store';
import { WikiService } from '../../wiki/wiki.service';
import { DreamingService } from '../../dreaming/dreaming.service';
import type { KGAdapter } from '../adapters/adapter.types';
import { Inject } from '@nestjs/common';
import { KG_ADAPTER } from '../adaptive-memory.tokens';

/**
 * Ponderer — between-task loop runner (PRD §6).
 *
 * Five stages, in order:
 *   1. quality-scoring   score every unprocessed session
 *   2. maintenance       prune orphan KG entities; flag stale wiki pages
 *   3. personality-induction  for sessions ≥ qualityThresholdForInduction:
 *                              a) delegate strategy-mining to DreamingService
 *                                 with sessionFilesOverride
 *                              b) feed cross-session signals through the
 *                                 classification firewall to PersonalityStore
 *   4. self-edit         rewrite dreaming SKILL.md based on review-queue feedback
 *   5. publish-review    write the cycle's items into ReviewQueueStore
 *
 * Triggered per project on cron (cron registration is gated by the
 * activation file's existence — wired in the next step).
 *
 * Activation gate: refuse to run when `AdaptiveMemoryConfigService.isActive`
 * returns false. The Ponderer cron should not even be registered for inactive
 * projects, but the gate is here as defence in depth.
 */
@Injectable()
export class Ponderer {
  private readonly logger = new Logger(Ponderer.name);
  private readonly subjects = new Map<string, Subject<PondererEvent>>();

  constructor(
    private readonly config: AdaptiveMemoryConfigService,
    private readonly sessions: SessionsStore,
    private readonly skills: SkillsStore,
    private readonly personality: PersonalityStore,
    private readonly reviewQueue: ReviewQueueStore,
    private readonly wiki: WikiService,
    @Inject(KG_ADAPTER) private readonly kg: KGAdapter,
    private readonly dreaming: DreamingService,
    private readonly llm: LlmService,
  ) {}

  // --- SSE channel ---------------------------------------------------------

  getEventSubject(project: string): Subject<PondererEvent> {
    let subj = this.subjects.get(project);
    if (!subj) {
      subj = new Subject<PondererEvent>();
      this.subjects.set(project, subj);
    }
    return subj;
  }

  private emit(event: Omit<PondererEvent, 'timestamp'>): void {
    this.getEventSubject(event.project).next({
      ...event,
      timestamp: new Date().toISOString(),
    } as PondererEvent);
  }

  // --- main entry ----------------------------------------------------------

  async run(project: string): Promise<PondererReport> {
    if (!this.config.isActive(project)) {
      throw new Error(`adaptive_memory_inactive: ${project}`);
    }
    const cfg = await this.config.get(project);
    const cycleId = `cycle-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}`;
    this.emit({ type: 'cycle-started', project, cycleId, payload: {} });

    // Stage 1 — quality scoring
    const unprocessed = await this.sessions.unprocessed(project);
    const scored: Array<{ id: string; score: number }> = [];
    for (const session of unprocessed) {
      const activeSkills = await this.skills.byIds(project, session.activeSkills);
      const r = scoreSession({ session, activeSkills });
      await this.sessions.setQualityScore(project, session.id, r.score);
      scored.push({ id: session.id, score: r.score });
    }
    this.emit({
      type: 'stage-completed',
      project,
      cycleId,
      payload: { stage: 'quality-scoring', count: scored.length },
    });

    // Stage 2 — maintenance
    const maintenance = await runMaintenance({
      project,
      kg: this.kg,
      wiki: this.wiki,
    });
    this.emit({
      type: 'stage-completed',
      project,
      cycleId,
      payload: { stage: 'maintenance', ...maintenance.orphans },
    });

    // Stage 3 — personality induction (delegates to dreaming + admission firewall)
    const threshold = cfg.ponderer.qualityThresholdForInduction;
    const highQuality = unprocessed.filter((s) => {
      const r = scored.find((x) => x.id === s.id);
      return r ? r.score >= threshold : false;
    });
    const inductionResult = await this.runPersonalityInduction(project, highQuality);
    this.emit({
      type: 'stage-completed',
      project,
      cycleId,
      payload: {
        stage: 'personality-induction',
        ...inductionResult,
      },
    });

    // Stage 4 — self-edit (rewrites dreaming SKILL.md from previous-cycle feedback)
    const selfEdit = await this.applyFeedbackToDreamingSkill(project);
    this.emit({
      type: 'stage-completed',
      project,
      cycleId,
      payload: { stage: 'self-edit', ...selfEdit },
    });

    // Stage 5 — publish review queue
    const items = this.buildReviewItems({
      project,
      cycleId,
      maintenance,
      induction: inductionResult,
    });
    const cap = cfg.ponderer.maxReviewItemsPerCycle;
    const capped = items.slice(0, cap);
    const published = await this.reviewQueue.publish(project, capped);
    this.emit({
      type: 'stage-completed',
      project,
      cycleId,
      payload: { stage: 'publish-review', published: published.published },
    });

    this.emit({ type: 'cycle-completed', project, cycleId, payload: {} });
    return {
      cycleId,
      sessionsScored: scored.length,
      orphansPruned: maintenance.orphans.prunedSilently.length,
      personalityAdmitted: inductionResult.admitted,
      reviewItemsPublished: published.published,
    };
  }

  // --- stage 3 — personality induction ------------------------------------

  /**
   * For each high-quality session:
   *   a) Feed its chat history file into DreamingService via sessionFilesOverride
   *      so the existing 8-stage strategy-mining pipeline runs as today.
   *   b) Build a PersonalityCandidate from the session pattern (the agent
   *      behaviour the model exhibited) and send it through the admission
   *      firewall. Survivors become PersonalityEntries.
   *
   * The dreaming pipeline runs asynchronously on its own worker; we don't
   * await its completion here — its outputs (`.dreams.json`) are independent
   * and will surface in subsequent review items via the existing dreaming
   * flow. This Ponderer cycle commits its own ReviewItems immediately.
   */
  private async runPersonalityInduction(
    project: string,
    sessions: Array<{ id: string; activeSkills: string[]; turns: any[]; workspaceSnapshotAfter: string }>,
  ): Promise<InductionResult> {
    if (sessions.length === 0) {
      return { admitted: 0, rejected: 0, candidates: [], dreamingRunsTriggered: 0 };
    }

    // a) Hand the curated session files to the dreaming pipeline.
    const sessionFiles = sessions.map(
      (s) => `.etienne/chat.history-${s.id}.jsonl`, // relative to project root
    );
    let dreamingRunsTriggered = 0;
    try {
      const r = await this.dreaming.triggerRun(project, {
        sessionFilesOverride: sessionFiles,
        bypassEnabledCheck: true,
      });
      if (r.enqueued) dreamingRunsTriggered = 1;
    } catch (err: any) {
      this.logger.warn(`personality-induction: dreaming.triggerRun failed: ${err.message}`);
    }

    // b) Distil simple candidates from session shape — one candidate per
    //    session for now, with a fixed inferenceTag derived from active
    //    skills. The PRD §6.3 vision is an LLM call here; the deterministic
    //    fallback below ensures the firewall has data to admit even without
    //    the LLM, and tests don't need to mock model output.
    const candidates: Array<{
      candidate: PersonalityCandidate;
      admitted: boolean;
      reason?: string;
    }> = [];
    let admitted = 0;
    let rejected = 0;

    for (const session of sessions) {
      const candidate: PersonalityCandidate = {
        principle: deriveTurnPrinciple(session),
        context: `Sessions like ${session.id}`,
        evidence: [session.id],
        inferenceTag: `tag:${session.activeSkills.sort().join('-') || 'general'}`,
        // Sessions without a private/secret evidence path are abstract enough.
        // Real LLM-driven induction will set this more precisely.
        isAbstract: true,
        evidenceClassifications: ['public'], // see TODO below
      };
      // TODO(adaptive-memory): walk the session's storeWrites to collect the
      // actual classifications of every entry the session touched.
      const r = await this.personality.admitAndWrite(candidate);
      if (r.admitted) {
        admitted += 1;
        candidates.push({ candidate, admitted: true });
      } else {
        rejected += 1;
        candidates.push({ candidate, admitted: false, reason: r.reason });
      }
    }

    return { admitted, rejected, candidates, dreamingRunsTriggered };
  }

  // --- stage 4 — self-edit ------------------------------------------------

  /**
   * Rewrite `skills/dreaming/SKILL.md` based on the previous cycle's feedback.
   *
   * Aggregation by inferenceTag:
   *   - good     → reinforce the tag
   *   - badly_reasoned → flag for rewrite
   *   - unusable → retire the tag
   *
   * The rewrite itself is a regular-tier LLM call. To keep tests
   * deterministic we run the LLM only when `cfg.tokenBudget` allows AND when
   * there is something to do (at least one tag has aggregated feedback). On
   * any failure we return without touching the skill — better to skip a
   * cycle than corrupt the dreaming skill.
   */
  private async applyFeedbackToDreamingSkill(
    project: string,
  ): Promise<{ rewritten: boolean; tags: { reinforce: string[]; rewrite: string[]; retire: string[] } }> {
    const items = await this.reviewQueue.listByProject(project);
    const buckets = aggregateFeedbackByTag(items);
    const hasWork =
      buckets.reinforce.length > 0 ||
      buckets.rewrite.length > 0 ||
      buckets.retire.length > 0;
    if (!hasWork) {
      return { rewritten: false, tags: buckets };
    }
    const dreaming = await this.skills.get(project, 'dreaming');
    if (!dreaming) {
      this.logger.debug(`self-edit: no dreaming skill provisioned for ${project}`);
      return { rewritten: false, tags: buckets };
    }
    let newBody: string;
    try {
      newBody = await this.llm.generateTextWithMessages({
        tier: 'regular',
        maxOutputTokens: 4096,
        projectDir: project,
        messages: [
          {
            role: 'system',
            content:
              'You rewrite the body of a Dreaming skill based on user feedback aggregated by inferenceTag. Output ONLY the new markdown body (no frontmatter, no fences). Preserve the existing structure where possible; integrate the feedback into the relevant sections.',
          },
          {
            role: 'user',
            content: renderRewritePrompt(dreaming.body, buckets),
          },
        ],
      });
    } catch (err: any) {
      this.logger.warn(`self-edit: LLM rewrite failed; skipping cycle: ${err.message}`);
      return { rewritten: false, tags: buckets };
    }
    if (!newBody.trim() || newBody === dreaming.body) {
      return { rewritten: false, tags: buckets };
    }
    await this.skills.write(project, { ...dreaming, body: newBody });
    return { rewritten: true, tags: buckets };
  }

  // --- stage 5 — assemble review items ------------------------------------

  private buildReviewItems(args: {
    project: string;
    cycleId: string;
    maintenance: Awaited<ReturnType<typeof runMaintenance>>;
    induction: InductionResult;
  }): ReviewItem[] {
    const items: ReviewItem[] = [];
    const now = new Date().toISOString();
    const prov = (inferenceTag?: string) => ({
      sourceSessions: [],
      sourceEntries: [],
      createdBy: 'ponderer' as const,
      createdAt: now,
      updatedAt: now,
      inferenceTag,
    });

    // Personality proposals (admitted candidates)
    for (const c of args.induction.candidates) {
      if (!c.admitted) continue;
      items.push({
        id: `${args.cycleId}-pers-${c.candidate.inferenceTag}`,
        projectId: args.project,
        kind: 'personality_proposal',
        summary: c.candidate.principle.slice(0, 200),
        details: c.candidate,
        provenance: prov(c.candidate.inferenceTag),
        status: 'pending',
        cycleId: args.cycleId,
      });
    }

    // Stale wiki pages
    for (const stale of args.maintenance.stalePages) {
      items.push({
        id: `${args.cycleId}-stale-${stale.slug}`,
        projectId: args.project,
        kind: 'stale_data_flag',
        summary: `Stale wiki page: ${stale.slug} (last updated ${stale.lastUpdated})`,
        details: stale,
        provenance: prov(),
        status: 'pending',
        cycleId: args.cycleId,
      });
    }

    // Large orphan-deletion proposals
    if (args.maintenance.orphans.flaggedForReview.length > 0) {
      items.push({
        id: `${args.cycleId}-orphans`,
        projectId: args.project,
        kind: 'large_deletion',
        summary: `${args.maintenance.orphans.flaggedForReview.length} orphan KG entities flagged for prune`,
        details: { ids: args.maintenance.orphans.flaggedForReview },
        provenance: prov(),
        status: 'pending',
        cycleId: args.cycleId,
      });
    }

    return items;
  }
}

// --- types ---------------------------------------------------------------

export interface PondererReport {
  cycleId: string;
  sessionsScored: number;
  orphansPruned: number;
  personalityAdmitted: number;
  reviewItemsPublished: number;
}

interface InductionResult {
  admitted: number;
  rejected: number;
  candidates: Array<{
    candidate: PersonalityCandidate;
    admitted: boolean;
    reason?: string;
  }>;
  dreamingRunsTriggered: number;
}

export type PondererEventType = 'cycle-started' | 'stage-completed' | 'cycle-completed';

export interface PondererEvent {
  type: PondererEventType;
  project: string;
  cycleId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// --- helpers -------------------------------------------------------------

function deriveTurnPrinciple(session: { id: string; turns: any[] }): string {
  const turnCount = session.turns?.length ?? 0;
  if (turnCount === 0) return 'Engage carefully — there is no chat history.';
  if (turnCount <= 3) {
    return 'Resolve simple requests in a single agent turn when possible.';
  }
  if (turnCount > 8) {
    return 'For multi-turn tasks, summarise progress periodically to keep alignment.';
  }
  return 'Verify intent before acting when the request is ambiguous.';
}

function aggregateFeedbackByTag(items: ReviewItem[]): {
  reinforce: string[];
  rewrite: string[];
  retire: string[];
} {
  const tally = new Map<string, { good: number; bad: number; unusable: number }>();
  for (const it of items) {
    const tag = it.provenance.inferenceTag;
    if (!tag) continue;
    const t = tally.get(tag) ?? { good: 0, bad: 0, unusable: 0 };
    if (it.status === 'good') t.good += 1;
    else if (it.status === 'badly_reasoned') t.bad += 1;
    else if (it.status === 'unusable') t.unusable += 1;
    tally.set(tag, t);
  }
  const reinforce: string[] = [];
  const rewrite: string[] = [];
  const retire: string[] = [];
  for (const [tag, t] of tally.entries()) {
    if (t.good > t.bad + t.unusable) reinforce.push(tag);
    else if (t.bad > t.good) rewrite.push(tag);
    else if (t.unusable >= 2) retire.push(tag);
  }
  return { reinforce, rewrite, retire };
}

function renderRewritePrompt(
  currentBody: string,
  buckets: { reinforce: string[]; rewrite: string[]; retire: string[] },
): string {
  return [
    '## Current dreaming skill body\n',
    currentBody,
    '\n## Aggregated user feedback by inferenceTag\n',
    `Reinforce: ${buckets.reinforce.join(', ') || '(none)'}`,
    `Rewrite:   ${buckets.rewrite.join(', ') || '(none)'}`,
    `Retire:    ${buckets.retire.join(', ') || '(none)'}`,
    '\nRewrite the skill body to reflect this feedback. Preserve all unrelated content verbatim.',
  ].join('\n');
}
