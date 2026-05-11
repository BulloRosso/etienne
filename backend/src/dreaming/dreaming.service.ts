import { Injectable, Logger, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Subject } from 'rxjs';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import { safeRoot } from '../claude/utils/path.utils';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';
import { QuickActionsService } from '../quick-actions/quick-actions.service';
import {
  DEFAULT_DREAMING_SETTINGS,
  DreamFeedbackPayload,
  DreamFile,
  DreamingSettings,
} from './dto/dreaming-settings.dto';
import { DreamingQueue, JobStage } from './queue/queue';

export type DreamingEventType =
  | 'run-enqueued'
  | 'run-skipped'
  | 'stage-start'
  | 'stage-complete'
  | 'stage-failed'
  | 'item-promoted'
  | 'item-rejected'
  | 'run-finalized';

export interface DreamingEvent {
  type: DreamingEventType;
  project: string;
  runId: string;
  timestamp: string;
  stage?: JobStage;
  jobId?: number;
  domain?: string | null;
  /** Free-form details: stage-specific counts, error message, item title, etc. */
  detail?: Record<string, unknown>;
}

const CRON_PREFIX = 'dreaming__';

@Injectable()
export class DreamingService implements OnModuleInit {
  private readonly logger = new Logger(DreamingService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  /** Per-project queue handles. Opened lazily, cached across the process. */
  private queues = new Map<string, DreamingQueue>();

  /** Per-project SSE subjects for live pipeline progress. */
  private eventSubjects = new Map<string, Subject<DreamingEvent>>();

  constructor(
    private readonly scheduler: SchedulerRegistry,
    private readonly budgetMonitoring: BudgetMonitoringService,
    @Inject(forwardRef(() => QuickActionsService))
    private readonly quickActions: QuickActionsService,
  ) {}

  async onModuleInit() {
    await this.restoreCronJobsFromSettings();
  }

  // --- paths -------------------------------------------------------------

  private projectRoot(project: string): string {
    return safeRoot(this.workspaceRoot, project);
  }

  private etienneDir(project: string): string {
    return join(this.projectRoot(project), '.etienne');
  }

  private settingsPath(project: string): string {
    return join(this.etienneDir(project), 'dreaming.settings.json');
  }

  private dreamingDir(project: string): string {
    return join(this.projectRoot(project), 'dreaming');
  }

  // --- event stream ------------------------------------------------------

  /** Get or create the SSE subject for a project. Used by the controller and the worker. */
  getEventSubject(project: string): Subject<DreamingEvent> {
    let subj = this.eventSubjects.get(project);
    if (!subj) {
      subj = new Subject<DreamingEvent>();
      this.eventSubjects.set(project, subj);
    }
    return subj;
  }

  /** Emit a single event onto the per-project subject. Safe to call from any stage handler. */
  emitEvent(event: Omit<DreamingEvent, 'timestamp'> & { timestamp?: string }): void {
    const subj = this.getEventSubject(event.project);
    subj.next({ ...event, timestamp: event.timestamp ?? new Date().toISOString() } as DreamingEvent);
  }

  // --- queue access ------------------------------------------------------

  async getQueue(project: string): Promise<DreamingQueue> {
    let q = this.queues.get(project);
    if (!q) {
      q = await DreamingQueue.open(this.projectRoot(project));
      this.queues.set(project, q);
    }
    return q;
  }

  // --- settings ----------------------------------------------------------

  async getSettings(project: string): Promise<DreamingSettings> {
    try {
      const content = await fs.readFile(this.settingsPath(project), 'utf8');
      return { ...DEFAULT_DREAMING_SETTINGS, ...JSON.parse(content) };
    } catch {
      return { ...DEFAULT_DREAMING_SETTINGS };
    }
  }

  async saveSettings(project: string, incoming: Partial<DreamingSettings>): Promise<DreamingSettings> {
    await fs.mkdir(this.etienneDir(project), { recursive: true });
    const merged: DreamingSettings = { ...DEFAULT_DREAMING_SETTINGS, ...incoming } as DreamingSettings;
    await fs.writeFile(this.settingsPath(project), JSON.stringify(merged, null, 2), 'utf8');
    await this.applyCron(project, merged);
    return merged;
  }

  // --- cron registration -------------------------------------------------

  private cronName(project: string): string {
    return `${CRON_PREFIX}${project}`;
  }

  private async applyCron(project: string, settings: DreamingSettings): Promise<void> {
    const name = this.cronName(project);
    try {
      this.scheduler.deleteCronJob(name);
    } catch { /* not registered */ }

    if (!settings.enabled) {
      this.logger.log(`Dreaming disabled for ${project}`);
      return;
    }

    const job = new CronJob(
      settings.cronExpression,
      () => { this.triggerRun(project).catch((err) => this.logger.error(`Dream trigger failed for ${project}: ${err.message}`)); },
      null,
      true,
      settings.timeZone || 'UTC',
    );
    this.scheduler.addCronJob(name, job);
    this.logger.log(`Registered dreaming cron for ${project}: ${settings.cronExpression} (${settings.timeZone || 'UTC'})`);
  }

  private async restoreCronJobsFromSettings(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.workspaceRoot);
    } catch {
      this.logger.warn(`Workspace ${this.workspaceRoot} not readable, skipping dreaming cron restore`);
      return;
    }
    for (const project of entries) {
      if (project.startsWith('.')) continue;
      try {
        const stat = await fs.stat(join(this.workspaceRoot, project));
        if (!stat.isDirectory()) continue;
        const settings = await this.getSettings(project);
        if (settings.enabled) {
          await this.applyCron(project, settings);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to restore dreaming for ${project}: ${err.message}`);
      }
    }
  }

  // --- run trigger -------------------------------------------------------

  /**
   * Enqueue a HARVEST job for this project, gated by the soft pre-flight budget check.
   */
  async triggerRun(project: string): Promise<{ runId: string; enqueued: boolean; reason?: string }> {
    const settings = await this.getSettings(project);
    if (!settings.enabled) {
      this.emitEvent({ type: 'run-skipped', project, runId: '', detail: { reason: 'dreaming-disabled' } });
      return { runId: '', enqueued: false, reason: 'dreaming-disabled' };
    }
    if (await this.isOverDailyBudget(project, settings)) {
      this.logger.warn(`Dream run for ${project} skipped: over budget`);
      this.emitEvent({ type: 'run-skipped', project, runId: '', detail: { reason: 'over-budget' } });
      return { runId: '', enqueued: false, reason: 'over-budget' };
    }
    const queue = await this.getQueue(project);
    const runId = `run-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}`;
    queue.enqueue('harvest', { project }, { runId });
    queue.setRunState('last_trigger_ts', String(Date.now()));
    this.logger.log(`Enqueued HARVEST run ${runId} for ${project}`);
    this.emitEvent({ type: 'run-enqueued', project, runId });
    return { runId, enqueued: true };
  }

  /**
   * Soft pre-flight check: if maxBudget is set and today's project costs already exceed it,
   * refuse to enqueue. Reads costs.json; one entry per LLM call, accumulatedCosts on the
   * latest entry is monotonically increasing across the project's lifetime, so we sum
   * requestCosts only for entries dated today.
   */
  async isOverDailyBudget(project: string, settings?: DreamingSettings): Promise<boolean> {
    const s = settings ?? (await this.getSettings(project));
    if (!s.maxBudget || s.maxBudget <= 0) return false;
    try {
      const costsFile = join(this.etienneDir(project), 'costs.json');
      const content = await fs.readFile(costsFile, 'utf8');
      const entries: Array<{ timestamp: string; requestCosts: number }> = JSON.parse(content);
      const today = new Date().toISOString().slice(0, 10);
      const todaySpend = entries
        .filter((e) => typeof e.timestamp === 'string' && e.timestamp.startsWith(today))
        .reduce((sum, e) => sum + (Number(e.requestCosts) || 0), 0);
      return todaySpend >= s.maxBudget;
    } catch {
      return false;
    }
  }

  // --- dream artifact files ---------------------------------------------

  async listDreamFiles(project: string): Promise<Array<{ fileName: string; runId: string; generatedAt: string; itemCount: number; dismissed: boolean }>> {
    const dir = this.dreamingDir(project);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const result: Array<{ fileName: string; runId: string; generatedAt: string; itemCount: number; dismissed: boolean }> = [];
    for (const f of files) {
      if (!f.endsWith('.dreams.json')) continue;
      try {
        const dream = await this.readDreamFile(project, f);
        const dismissed = dream.items.length > 0 && dream.items.every((i) => i.dismissedByUser);
        result.push({
          fileName: f,
          runId: dream.runId,
          generatedAt: dream.generatedAt,
          itemCount: dream.items.length,
          dismissed,
        });
      } catch { /* skip malformed */ }
    }
    result.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
    return result;
  }

  async readDreamFile(project: string, fileName: string): Promise<DreamFile> {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new Error('Invalid dream file name');
    }
    const path = join(this.dreamingDir(project), fileName);
    const content = await fs.readFile(path, 'utf8');
    return JSON.parse(content);
  }

  async writeDreamFile(project: string, fileName: string, dream: DreamFile): Promise<void> {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new Error('Invalid dream file name');
    }
    const dir = this.dreamingDir(project);
    await fs.mkdir(dir, { recursive: true });
    const tmp = join(dir, `.${fileName}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(dream, null, 2), 'utf8');
    await fs.rename(tmp, join(dir, fileName));
  }

  /**
   * Apply per-item user feedback. Verdicts are written to .agent/wiki/dreaming-feedback/<date>.md
   * for the next HARVEST to read. The dream file's items get dismissedByUser=true and the
   * status field is updated according to the verdict.
   */
  async submitFeedback(project: string, fileName: string, payload: DreamFeedbackPayload): Promise<DreamFile> {
    const dream = await this.readDreamFile(project, fileName);
    const verdictMap = new Map(payload.feedback.map((f) => [f.itemId, f.verdict]));

    for (const item of dream.items) {
      const verdict = verdictMap.get(item.id);
      if (!verdict) continue;
      item.dismissedByUser = true;
      switch (verdict) {
        case 'good':    item.status = 'active'; break;
        case 'bad':     item.status = 'deprecated'; break;
        case 'deepen':  item.status = 'investigating'; break;
      }
    }
    await this.writeDreamFile(project, fileName, dream);
    await this.appendFeedbackNote(project, dream, payload);

    if (dream.items.every((i) => i.dismissedByUser)) {
      try { await this.quickActions.removeProjectActions(project, 'dreaming-latest'); } catch (err: any) {
        this.logger.warn(`Could not remove dreaming quick action: ${err.message}`);
      }
    }
    return dream;
  }

  private async appendFeedbackNote(project: string, dream: DreamFile, payload: DreamFeedbackPayload): Promise<void> {
    const dir = join(this.projectRoot(project), '.agent', 'wiki', 'dreaming-feedback');
    await fs.mkdir(dir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const path = join(dir, `${today}.md`);
    const lines: string[] = [];
    lines.push(`\n## Feedback for run ${dream.runId} (${new Date().toISOString()})\n`);
    for (const fb of payload.feedback) {
      const item = dream.items.find((i) => i.id === fb.itemId);
      if (!item) continue;
      lines.push(`- **${item.title}** (${item.domain}) — ${fb.verdict}`);
    }
    await fs.appendFile(path, lines.join('\n') + '\n', 'utf8');
  }

  // --- quick action upsert (called from INDEX stage) --------------------

  async upsertLatestDreamQuickAction(project: string, fileName: string): Promise<void> {
    try {
      await this.quickActions.upsertProjectAction(project, {
        id: 'dreaming-latest',
        project,
        title: "Review tonight's dreams",
        prompt: '',
        icon: 'BsCloudMoon',
        previewFile: `dreaming/${fileName}`,
        sortOrder: 0,
      });
    } catch (err: any) {
      this.logger.warn(`Could not upsert dreaming quick action: ${err.message}`);
    }
  }
}
