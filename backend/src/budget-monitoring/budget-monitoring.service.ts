import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Subject } from 'rxjs';
import { safeRoot } from '../claude/utils/path.utils';
import { SmtpService } from '../smtp-imap/smtp.service';

export interface CostEntry {
  timestamp: string;
  sessionId?: string;
  inputTokens: number;
  outputTokens: number;
  /** Cached input tokens read back (billed at ~10% of the input price). */
  cacheReadTokens?: number;
  /** Total cache-write tokens (aggregate of 5m + 1h ephemeral buckets). */
  cacheCreationTokens?: number;
  /** Cache-write tokens with 5-minute TTL (billed at 1.25× input). */
  cacheCreation5mTokens?: number;
  /** Cache-write tokens with 1-hour TTL (billed at 2× input). */
  cacheCreation1hTokens?: number;
  requestCosts: number;
  accumulatedCosts: number;
}

/**
 * Cache-token breakdown passed alongside input/output tokens when tracking
 * costs. All fields optional so callers without cache data stay compatible.
 */
export interface CacheTokenUsage {
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
}

export interface BudgetSettings {
  enabled: boolean;
  limit: number;
  notificationEmail?: string;
}

interface ThresholdState {
  notified50: boolean;
  notified80: boolean;
  notified100: boolean;
}

export interface BudgetUpdateEvent {
  project: string;
  timestamp: string;
  currentCosts: number;
  numberOfSessions: number;
  currency: string;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

@Injectable()
export class BudgetMonitoringService {
  private readonly logger = new Logger(BudgetMonitoringService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
  private readonly costsCurrencyUnit = process.env.COSTS_CURRENCY_UNIT || 'EUR';
  private readonly costsPerMioInputTokens = parseFloat(process.env.COSTS_PER_MIO_INPUT_TOKENS || '3.0');
  private readonly costsPerMioOutputTokens = parseFloat(process.env.COSTS_PER_MIO_OUTPUT_TOKENS || '15.0');
  // Anthropic cache pricing as multipliers of the base input price:
  // cache reads cost 10% of input; 5-minute writes 1.25×; 1-hour writes 2×.
  private readonly cacheReadMultiplier = parseFloat(process.env.COSTS_CACHE_READ_MULTIPLIER || '0.1');
  private readonly cacheWrite5mMultiplier = parseFloat(process.env.COSTS_CACHE_WRITE_5M_MULTIPLIER || '1.25');
  private readonly cacheWrite1hMultiplier = parseFloat(process.env.COSTS_CACHE_WRITE_1H_MULTIPLIER || '2.0');
  private readonly budgetThresholds = [50, 80, 100] as const;

  // SSE subjects per project
  private subjects = new Map<string, Subject<BudgetUpdateEvent>>();

  constructor(private readonly smtpService: SmtpService) {}

  /**
   * Ensure .etienne directory exists for the project
   */
  private async ensureEtienneDir(projectDir: string): Promise<string> {
    const root = safeRoot(this.workspaceRoot, projectDir);
    const etienneDir = join(root, '.etienne');
    await fs.mkdir(etienneDir, { recursive: true });
    return etienneDir;
  }

  /**
   * Get costs file path
   */
  private async getCostsPath(projectDir: string): Promise<string> {
    const etienneDir = await this.ensureEtienneDir(projectDir);
    return join(etienneDir, 'costs.json');
  }

  /**
   * Get settings file path
   */
  private async getSettingsPath(projectDir: string): Promise<string> {
    const etienneDir = await this.ensureEtienneDir(projectDir);
    return join(etienneDir, 'budget-monitoring.settings.json');
  }

  /**
   * Read costs file
   */
  private async readCosts(projectDir: string): Promise<CostEntry[]> {
    const costsPath = await this.getCostsPath(projectDir);
    try {
      const content = await fs.readFile(costsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Write costs file
   */
  private async writeCosts(projectDir: string, costs: CostEntry[]): Promise<void> {
    const costsPath = await this.getCostsPath(projectDir);
    await fs.writeFile(costsPath, JSON.stringify(costs, null, 2), 'utf8');
  }

  /**
   * Calculate costs from token usage, including Anthropic cache economics.
   *
   * Anthropic reports `input_tokens` as the *uncached* input only; cache reads
   * and cache writes are separate buckets, so the costs add up rather than
   * overlapping. Cache reads are billed at ~10% of the input price, 5-minute
   * writes at 1.25× and 1-hour writes at 2× the input price.
   *
   * Fallback: if only the aggregate `cacheCreationTokens` is known (no 5m/1h
   * split), it is charged conservatively at the 5-minute write multiplier.
   */
  calculateCosts(inputTokens: number, outputTokens: number, cache: CacheTokenUsage = {}): number {
    const perMioInput = this.costsPerMioInputTokens;
    const inputCost = (inputTokens / 1_000_000) * perMioInput;
    const outputCost = (outputTokens / 1_000_000) * this.costsPerMioOutputTokens;

    const cacheReadCost = ((cache.cacheReadTokens || 0) / 1_000_000) * perMioInput * this.cacheReadMultiplier;

    const write5m = cache.cacheCreation5mTokens || 0;
    const write1h = cache.cacheCreation1hTokens || 0;
    // If the TTL split is absent, charge the whole aggregate at the 5m rate.
    const aggregateOnly = (write5m === 0 && write1h === 0)
      ? (cache.cacheCreationTokens || 0)
      : 0;
    const cacheWriteCost =
      ((write5m + aggregateOnly) / 1_000_000) * perMioInput * this.cacheWrite5mMultiplier +
      (write1h / 1_000_000) * perMioInput * this.cacheWrite1hMultiplier;

    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }

  /**
   * Count distinct sessions from cost entries
   */
  private countSessions(costs: CostEntry[]): number {
    const sessionIds = new Set<string>();
    for (const entry of costs) {
      if (entry.sessionId) {
        sessionIds.add(entry.sessionId);
      }
    }
    // If no entries have sessionId (legacy data), fall back to entry count
    return sessionIds.size > 0 ? sessionIds.size : costs.length;
  }

  /**
   * List all project directories in workspace
   */
  private async listAllProjects(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.workspaceRoot, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Track costs after Claude Code response.
   * Always records usage regardless of whether budget monitoring is enabled.
   */
  async trackCosts(
    projectDir: string,
    inputTokens: number,
    outputTokens: number,
    sessionId?: string,
    cache: CacheTokenUsage = {}
  ): Promise<CostEntry> {
    console.log(`[BudgetMonitoring] trackCosts called for ${projectDir} session=${sessionId || 'unknown'} with ${inputTokens} input, ${outputTokens} output, ${cache.cacheReadTokens || 0} cache-read, ${cache.cacheCreationTokens || 0} cache-write tokens`);

    const requestCosts = this.calculateCosts(inputTokens, outputTokens, cache);

    // Read existing costs
    const costs = await this.readCosts(projectDir);

    // Get accumulated costs from the first (most recent) entry
    const previousAccumulated = costs.length > 0 ? costs[0].accumulatedCosts : 0;
    const accumulatedCosts = previousAccumulated + requestCosts;

    // Create new entry. Cache fields are written only when present so legacy
    // readers and old entries stay consistent.
    const newEntry: CostEntry = {
      timestamp: new Date().toISOString(),
      sessionId,
      inputTokens,
      outputTokens,
      cacheReadTokens: cache.cacheReadTokens,
      cacheCreationTokens: cache.cacheCreationTokens,
      cacheCreation5mTokens: cache.cacheCreation5mTokens,
      cacheCreation1hTokens: cache.cacheCreation1hTokens,
      requestCosts,
      accumulatedCosts
    };

    // Add to beginning of array (newest first)
    costs.unshift(newEntry);

    // Write back to file
    await this.writeCosts(projectDir, costs);

    // Emit SSE event
    const subject = this.getSubject(projectDir);
    let totalCacheRead = 0;
    let totalCacheCreation = 0;
    for (const entry of costs) {
      totalCacheRead += entry.cacheReadTokens || 0;
      totalCacheCreation += entry.cacheCreationTokens || 0;
    }
    subject.next({
      project: projectDir,
      timestamp: newEntry.timestamp,
      currentCosts: accumulatedCosts,
      numberOfSessions: this.countSessions(costs),
      currency: this.costsCurrencyUnit,
      cacheReadTokens: totalCacheRead,
      cacheCreationTokens: totalCacheCreation
    });

    // Fire-and-forget: check budget thresholds for email notifications
    this.checkThresholdNotifications(projectDir).catch(() => {});

    return newEntry;
  }

  /**
   * Get or create SSE subject for a project
   */
  getSubject(project: string): Subject<BudgetUpdateEvent> {
    if (!this.subjects.has(project)) {
      this.subjects.set(project, new Subject<BudgetUpdateEvent>());
    }
    return this.subjects.get(project)!;
  }

  /**
   * Get current costs summary for a single project
   */
  async getCurrentCosts(projectDir: string): Promise<{
    currentCosts: number;
    numberOfSessions: number;
    numberOfRequests: number;
    currency: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
  }> {
    const costs = await this.readCosts(projectDir);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    for (const entry of costs) {
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;
      totalCacheReadTokens += entry.cacheReadTokens || 0;
      totalCacheCreationTokens += entry.cacheCreationTokens || 0;
    }
    return {
      currentCosts: costs.length > 0 ? costs[0].accumulatedCosts : 0,
      numberOfSessions: this.countSessions(costs),
      numberOfRequests: costs.length,
      currency: this.costsCurrencyUnit,
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens
    };
  }

  /**
   * Get aggregated costs across ALL projects (for global budget limit).
   */
  async getGlobalCosts(): Promise<{
    globalCosts: number;
    globalSessions: number;
    globalRequests: number;
    globalInputTokens: number;
    globalOutputTokens: number;
    globalCacheReadTokens: number;
    globalCacheCreationTokens: number;
    currency: string;
  }> {
    const projects = await this.listAllProjects();
    let globalCosts = 0;
    let globalRequests = 0;
    let globalInputTokens = 0;
    let globalOutputTokens = 0;
    let globalCacheReadTokens = 0;
    let globalCacheCreationTokens = 0;
    const allSessionIds = new Set<string>();

    for (const project of projects) {
      const costs = await this.readCosts(project);
      if (costs.length > 0) {
        globalCosts += costs[0].accumulatedCosts;
        globalRequests += costs.length;
        for (const entry of costs) {
          globalInputTokens += entry.inputTokens;
          globalOutputTokens += entry.outputTokens;
          globalCacheReadTokens += entry.cacheReadTokens || 0;
          globalCacheCreationTokens += entry.cacheCreationTokens || 0;
          if (entry.sessionId) {
            allSessionIds.add(entry.sessionId);
          }
        }
      }
    }

    return {
      globalCosts,
      globalSessions: allSessionIds.size > 0 ? allSessionIds.size : globalRequests,
      globalRequests,
      globalInputTokens,
      globalOutputTokens,
      globalCacheReadTokens,
      globalCacheCreationTokens,
      currency: this.costsCurrencyUnit
    };
  }

  /**
   * Get all costs (returns last 10 entries but total count of all requests)
   */
  async getAllCosts(projectDir: string): Promise<{
    costs: CostEntry[];
    currency: string;
    numberOfSessions: number;
    numberOfRequests: number;
  }> {
    const costs = await this.readCosts(projectDir);
    return {
      costs: costs.slice(0, 10),
      currency: this.costsCurrencyUnit,
      numberOfSessions: this.countSessions(costs),
      numberOfRequests: costs.length
    };
  }

  /**
   * Get budget settings.
   * Default: enabled with 200 limit.
   */
  async getSettings(projectDir: string): Promise<BudgetSettings> {
    const settingsPath = await this.getSettingsPath(projectDir);
    try {
      const content = await fs.readFile(settingsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return { enabled: true, limit: 200 };
    }
  }

  /**
   * Check if the global budget limit has been exceeded.
   * The limit is configured per-project but applied against the sum of
   * costs across ALL projects.
   */
  async checkBudgetLimit(projectDir: string): Promise<{
    exceeded: boolean;
    currentCosts: number;
    limit: number;
    currency: string;
  }> {
    const settings = await this.getSettings(projectDir);

    if (!settings.enabled || !settings.limit || settings.limit <= 0) {
      return { exceeded: false, currentCosts: 0, limit: 0, currency: this.costsCurrencyUnit };
    }

    const global = await this.getGlobalCosts();

    return {
      exceeded: global.globalCosts >= settings.limit,
      currentCosts: global.globalCosts,
      limit: settings.limit,
      currency: this.costsCurrencyUnit
    };
  }

  /**
   * Save budget settings
   */
  async saveSettings(projectDir: string, settings: BudgetSettings): Promise<void> {
    const settingsPath = await this.getSettingsPath(projectDir);
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  /**
   * Reset cost counters for a project (clear the costs.json file)
   */
  async resetCosts(projectDir: string): Promise<void> {
    await this.writeCosts(projectDir, []);
    console.log(`[BudgetMonitoring] Reset cost counters for ${projectDir}`);
  }

  /**
   * Reset cost counters for ALL projects in the workspace
   */
  async resetAllCosts(): Promise<void> {
    const projects = await this.listAllProjects();
    for (const project of projects) {
      await this.writeCosts(project, []);
    }
    await this.resetThresholdState();
    this.logger.log(`Reset cost counters for all ${projects.length} projects`);
  }

  // --- Budget threshold email notifications ---

  private getThresholdStatePath(): string {
    return join(this.workspaceRoot, '.budget-threshold-state.json');
  }

  private async readThresholdState(): Promise<ThresholdState> {
    try {
      const content = await fs.readFile(this.getThresholdStatePath(), 'utf8');
      return JSON.parse(content);
    } catch {
      return { notified50: false, notified80: false, notified100: false };
    }
  }

  private async writeThresholdState(state: ThresholdState): Promise<void> {
    await fs.writeFile(this.getThresholdStatePath(), JSON.stringify(state, null, 2), 'utf8');
  }

  private async resetThresholdState(): Promise<void> {
    await this.writeThresholdState({ notified50: false, notified80: false, notified100: false });
    this.logger.log('Reset budget threshold notification state');
  }

  /**
   * Check budget thresholds and send email notifications when crossed.
   * Called as fire-and-forget after trackCosts records a new entry.
   */
  private async checkThresholdNotifications(projectDir: string): Promise<void> {
    try {
      const settings = await this.getSettings(projectDir);

      if (!settings.enabled || !settings.limit || settings.limit <= 0 || !settings.notificationEmail) {
        return;
      }

      const global = await this.getGlobalCosts();
      const percentage = (global.globalCosts / settings.limit) * 100;
      const state = await this.readThresholdState();
      let stateChanged = false;

      for (const threshold of this.budgetThresholds) {
        const stateKey = `notified${threshold}` as keyof ThresholdState;
        if (percentage >= threshold && !state[stateKey]) {
          state[stateKey] = true;
          stateChanged = true;

          const currencySymbol = this.costsCurrencyUnit;
          try {
            await this.smtpService.sendEmail(
              projectDir,
              settings.notificationEmail,
              `Budget Alert \u2014 ${threshold}% of limit reached`,
              `Global AI inference costs have reached ${threshold}% of the configured budget limit.\n\n` +
              `Current spend: ${global.globalCosts.toFixed(2)} ${currencySymbol}\n` +
              `Budget limit: ${settings.limit.toFixed(2)} ${currencySymbol}\n\n` +
              `This is an automated notification from Etienne.`,
            );
            this.logger.log(`Budget threshold email sent: ${threshold}% to ${settings.notificationEmail}`);
          } catch (err: any) {
            this.logger.error(`Failed to send budget threshold email (${threshold}%): ${err.message}`);
          }
        }
      }

      if (stateChanged) {
        await this.writeThresholdState(state);
      }
    } catch (err: any) {
      this.logger.error(`Error checking budget thresholds: ${err.message}`);
    }
  }
}
