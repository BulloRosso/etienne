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
  requestCosts: number;
  accumulatedCosts: number;
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
}

@Injectable()
export class BudgetMonitoringService {
  private readonly logger = new Logger(BudgetMonitoringService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
  private readonly costsCurrencyUnit = process.env.COSTS_CURRENCY_UNIT || 'EUR';
  private readonly costsPerMioInputTokens = parseFloat(process.env.COSTS_PER_MIO_INPUT_TOKENS || '3.0');
  private readonly costsPerMioOutputTokens = parseFloat(process.env.COSTS_PER_MIO_OUTPUT_TOKENS || '15.0');
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
   * Calculate costs from token usage
   */
  private calculateCosts(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.costsPerMioInputTokens;
    const outputCost = (outputTokens / 1_000_000) * this.costsPerMioOutputTokens;
    return inputCost + outputCost;
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
  async trackCosts(projectDir: string, inputTokens: number, outputTokens: number, sessionId?: string): Promise<CostEntry> {
    console.log(`[BudgetMonitoring] trackCosts called for ${projectDir} session=${sessionId || 'unknown'} with ${inputTokens} input, ${outputTokens} output tokens`);

    const requestCosts = this.calculateCosts(inputTokens, outputTokens);

    // Read existing costs
    const costs = await this.readCosts(projectDir);

    // Get accumulated costs from the first (most recent) entry
    const previousAccumulated = costs.length > 0 ? costs[0].accumulatedCosts : 0;
    const accumulatedCosts = previousAccumulated + requestCosts;

    // Create new entry
    const newEntry: CostEntry = {
      timestamp: new Date().toISOString(),
      sessionId,
      inputTokens,
      outputTokens,
      requestCosts,
      accumulatedCosts
    };

    // Add to beginning of array (newest first)
    costs.unshift(newEntry);

    // Write back to file
    await this.writeCosts(projectDir, costs);

    // Emit SSE event
    const subject = this.getSubject(projectDir);
    subject.next({
      project: projectDir,
      timestamp: newEntry.timestamp,
      currentCosts: accumulatedCosts,
      numberOfSessions: this.countSessions(costs),
      currency: this.costsCurrencyUnit
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
  }> {
    const costs = await this.readCosts(projectDir);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const entry of costs) {
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;
    }
    return {
      currentCosts: costs.length > 0 ? costs[0].accumulatedCosts : 0,
      numberOfSessions: this.countSessions(costs),
      numberOfRequests: costs.length,
      currency: this.costsCurrencyUnit,
      totalInputTokens,
      totalOutputTokens
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
    currency: string;
  }> {
    const projects = await this.listAllProjects();
    let globalCosts = 0;
    let globalRequests = 0;
    let globalInputTokens = 0;
    let globalOutputTokens = 0;
    const allSessionIds = new Set<string>();

    for (const project of projects) {
      const costs = await this.readCosts(project);
      if (costs.length > 0) {
        globalCosts += costs[0].accumulatedCosts;
        globalRequests += costs.length;
        for (const entry of costs) {
          globalInputTokens += entry.inputTokens;
          globalOutputTokens += entry.outputTokens;
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
