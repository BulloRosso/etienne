import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { LlmService } from '../../llm/llm.service';
import { EmbeddingsService } from '../../embeddings';
import { DreamingService } from '../dreaming.service';
import { DreamingCollectionsService } from '../chroma/dreaming-collections.service';
import { DreamingQueue, Job } from '../queue/queue';
import { runHarvest } from '../stages/harvest';
import { runSegment } from '../stages/segment';
import { runReflect } from '../stages/reflect';
import { runDistill } from '../stages/distill';
import { runGround } from '../stages/ground';
import { runConsolidate } from '../stages/consolidate';
import { runPromote } from '../stages/promote';
import { runIndex, finalizeRun } from '../stages/indexer';
import { CandidateStrategy, ConsolidatedCandidate, DistillPayload, GroundedCandidate, IndexPayload, PromotePayload, ReflectPayload } from '../stages/stage-types';

const TICK_MS = Number(process.env.DREAMING_WORKER_TICK_MS || 2000);
const LOCK_SECONDS = 300;

@Injectable()
export class DreamingWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DreamingWorkerService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly dreaming: DreamingService,
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingsService,
    private readonly chroma: DreamingCollectionsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.timer = setInterval(() => { this.tick().catch((err) => this.logger.error(`Worker tick failed: ${err.message}`)); }, TICK_MS);
    this.logger.log(`Dreaming worker started (tick=${TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /**
   * Per-tick: find all projects that have a queue, claim one job (across all),
   * dispatch to the right stage handler. Single-flight via `busy` so we don't overlap ticks.
   */
  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const projects = await this.listProjectsWithQueues();
      if (projects.length === 0) return;
      for (const project of projects) {
        const queue = await this.dreaming.getQueue(project);
        queue.recoverStale();
        const job = queue.claimNext(LOCK_SECONDS);
        if (!job) continue;
        await this.dispatch(project, queue, job);
        return; // one job per tick to keep latency stable across projects
      }
    } finally {
      this.busy = false;
    }
  }

  private async listProjectsWithQueues(): Promise<string[]> {
    let entries: string[];
    try { entries = await fs.readdir(this.workspaceRoot); } catch { return []; }
    const out: string[] = [];
    for (const p of entries) {
      if (p.startsWith('.')) continue;
      try {
        const stat = await fs.stat(join(this.workspaceRoot, p, '.etienne', 'dreaming', 'queue.db'));
        if (stat.isFile()) out.push(p);
      } catch { /* no queue */ }
    }
    return out;
  }

  private async dispatch(project: string, queue: DreamingQueue, job: Job): Promise<void> {
    this.logger.log(`[${project}] Stage=${job.stage} job=${job.id} run=${job.run_id}`);
    const startedAt = Date.now();
    this.dreaming.emitEvent({
      type: 'stage-start',
      project,
      runId: job.run_id,
      stage: job.stage,
      jobId: job.id,
      domain: job.domain,
    });
    try {
      let stageDetail: Record<string, unknown> = {};
      switch (job.stage) {
        case 'harvest':       await this.handleHarvest(project, queue, job); break;
        case 'segment':       await this.handleSegment(project, queue, job); break;
        case 'reflect':       stageDetail = await this.handleReflect(project, queue, job); break;
        case 'distill':       stageDetail = await this.handleDistill(project, queue, job); break;
        case 'ground':        await this.handleGround(project, queue, job); break;
        case 'consolidate':   await this.handleConsolidate(project, queue, job); break;
        case 'promote':       stageDetail = await this.handlePromote(project, queue, job); break;
        case 'index':         await this.handleIndex(project, queue, job); break;
        default: throw new Error(`Unknown stage: ${job.stage}`);
      }
      queue.complete(job.id);
      this.dreaming.emitEvent({
        type: 'stage-complete',
        project,
        runId: job.run_id,
        stage: job.stage,
        jobId: job.id,
        domain: job.domain,
        detail: { durationMs: Date.now() - startedAt, ...stageDetail },
      });
      await this.maybeAdvanceParent(project, queue, job);
    } catch (err: any) {
      const backoff = Math.min(60 * Math.pow(2, job.attempts), 600);
      const giveUp = job.attempts >= 3;
      queue.fail(job.id, err.message, giveUp ? null : backoff);
      this.logger.error(`[${project}] Stage=${job.stage} job=${job.id} ${giveUp ? 'gave up' : `retry in ${backoff}s`}: ${err.message}`);
      this.dreaming.emitEvent({
        type: 'stage-failed',
        project,
        runId: job.run_id,
        stage: job.stage,
        jobId: job.id,
        domain: job.domain,
        detail: { error: err.message, attempts: job.attempts, willRetry: !giveUp, retryInSec: giveUp ? null : backoff },
      });
    }
  }

  // --- stage handlers ----------------------------------------------------

  private async handleHarvest(project: string, queue: DreamingQueue, job: Job): Promise<void> {
    await runHarvest(this.workspaceRoot, job.payload, job.id, job.run_id, queue);
  }

  private async handleSegment(project: string, queue: DreamingQueue, job: Job): Promise<void> {
    await runSegment(job.payload, job.id, job.run_id, queue);
  }

  private async handleReflect(project: string, queue: DreamingQueue, job: Job): Promise<Record<string, unknown>> {
    const candidates = await runReflect(job.payload as ReflectPayload, this.llm);
    queue.setRunState(`reflect_${job.id}`, JSON.stringify(candidates));
    return { candidates: candidates.length };
  }

  private async handleDistill(project: string, queue: DreamingQueue, job: Job): Promise<Record<string, unknown>> {
    const payload = job.payload as DistillPayload;
    const beforeGround = queue.listByRun(job.run_id).filter((j) => j.stage === 'ground').length;
    await runDistill(payload, job.id, job.run_id, queue, this.embeddings);
    const afterGround = queue.listByRun(job.run_id).filter((j) => j.stage === 'ground').length;
    return { candidatesIn: payload.candidates.length, clustersOut: afterGround - beforeGround };
  }

  private async handleGround(project: string, queue: DreamingQueue, job: Job): Promise<void> {
    const grounded = await runGround(job.payload, this.llm);
    // Enqueue CONSOLIDATE for this candidate
    queue.enqueue('consolidate', { project, domain: job.payload.domain, candidate: grounded }, { runId: job.run_id, domain: job.domain ?? undefined, parentId: job.id });
  }

  private async handleConsolidate(project: string, queue: DreamingQueue, job: Job): Promise<void> {
    const consolidated = await runConsolidate(job.payload, this.llm, this.chroma);
    queue.enqueue('promote', { project, domain: job.payload.domain, candidate: consolidated }, { runId: job.run_id, domain: job.domain ?? undefined, parentId: job.id });
  }

  private async handlePromote(project: string, queue: DreamingQueue, job: Job): Promise<Record<string, unknown>> {
    const beforeIndex = queue.listByRun(job.run_id).filter((j) => j.stage === 'index').length;
    await runPromote(job.payload, job.id, job.run_id, queue);
    const afterIndex = queue.listByRun(job.run_id).filter((j) => j.stage === 'index').length;
    const promoted = afterIndex > beforeIndex;
    const title = (job.payload as PromotePayload).candidate.title;
    this.dreaming.emitEvent({
      type: promoted ? 'item-promoted' : 'item-rejected',
      project,
      runId: job.run_id,
      stage: 'promote',
      jobId: job.id,
      domain: job.domain,
      detail: { title },
    });
    return { promoted, title };
  }

  private async handleIndex(project: string, queue: DreamingQueue, job: Job): Promise<void> {
    await runIndex(this.workspaceRoot, job.payload as IndexPayload, queue, this.chroma);
  }

  // --- DAG advancement ---------------------------------------------------

  /**
   * After completing a job, check whether its parent's other children are also done.
   * The transitions we care about:
   *   reflect's parent is segment → when all reflect children of a segment are done,
   *      build the DistillPayload from collected reflect outputs and enqueue distill.
   *   index has no successor; instead, when the run has zero remaining non-completed
   *      jobs, finalize the run by writing dreams.json and upserting the quick action.
   */
  private async maybeAdvanceParent(project: string, queue: DreamingQueue, job: Job): Promise<void> {
    if (job.stage === 'reflect' && job.parent_id != null) {
      const segmentJobId = job.parent_id;
      const allChildren = queue.listByRun(job.run_id).filter((j) => j.parent_id === segmentJobId && j.stage === 'reflect');
      const pending = allChildren.filter((j) => j.status !== 'completed' && j.status !== 'failed');
      if (pending.length === 0) {
        const candidates: CandidateStrategy[] = [];
        for (const child of allChildren) {
          const raw = queue.getRunState(`reflect_${child.id}`);
          if (!raw) continue;
          try { candidates.push(...(JSON.parse(raw) as CandidateStrategy[])); } catch { /* skip */ }
        }
        const segmentJob = queue.listByRun(job.run_id).find((j) => j.id === segmentJobId);
        if (!segmentJob) return;
        const distillPayload: DistillPayload = { project, domain: segmentJob.domain ?? 'general', candidates };
        queue.enqueue('distill', distillPayload, { runId: job.run_id, domain: segmentJob.domain ?? undefined, parentId: segmentJob.id });
      }
    }

    // After any terminal stage finishes, check whether the entire run is drained.
    const runJobs = queue.listByRun(job.run_id);
    const stillRunning = runJobs.filter((j) => j.status === 'pending' || j.status === 'in_progress');
    if (stillRunning.length === 0) {
      const settings = await this.dreaming.getSettings(project);
      const fileName = await finalizeRun(this.workspaceRoot, project, job.run_id, settings.maxItems, queue);
      if (fileName) {
        await this.dreaming.upsertLatestDreamQuickAction(project, fileName);
      }
      const counts = queue.countByStatus();
      let itemCount: number | null = null;
      if (fileName) {
        try {
          const dream = await this.dreaming.readDreamFile(project, fileName);
          itemCount = dream.items?.length ?? 0;
        } catch { /* leave null */ }
      }
      this.dreaming.emitEvent({
        type: 'run-finalized',
        project,
        runId: job.run_id,
        detail: { fileName: fileName ?? null, items: itemCount, jobCounts: counts },
      });
    }
  }
}
