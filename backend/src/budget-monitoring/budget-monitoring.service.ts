import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Subject } from 'rxjs';
import { safeRoot } from '../claude/utils/path.utils';

export interface CostEntry {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  requestCosts: number;
  accumulatedCosts: number;
}

export interface BudgetSettings {
  enabled: boolean;
  limit: number;
}

export interface BudgetUpdateEvent {
  project: string;
  timestamp: string;
  currentCosts: number;
  numberOfRequests: number;
  currency: string;
}

@Injectable()
export class BudgetMonitoringService {
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
  private readonly costsCurrencyUnit = process.env.COSTS_CURRENCY_UNIT || 'EUR';
  private readonly costsPerMioInputTokens = parseFloat(process.env.COSTS_PER_MIO_INPUT_TOKENS || '3.0');
  private readonly costsPerMioOutputTokens = parseFloat(process.env.COSTS_PER_MIO_OUTPUT_TOKENS || '15.0');

  // SSE subjects per project
  private subjects = new Map<string, Subject<BudgetUpdateEvent>>();

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
   * Track costs after Claude Code response
   */
  async trackCosts(projectDir: string, inputTokens: number, outputTokens: number): Promise<CostEntry> {
    console.log(`[BudgetMonitoring] trackCosts called for ${projectDir} with ${inputTokens} input, ${outputTokens} output tokens`);

    // Check if budget monitoring is enabled
    const settings = await this.getSettings(projectDir);
    console.log(`[BudgetMonitoring] Budget monitoring enabled: ${settings.enabled}`);

    if (!settings.enabled) {
      console.log(`[BudgetMonitoring] Budget monitoring is disabled for ${projectDir}, skipping cost tracking`);
      return null;
    }

    const requestCosts = this.calculateCosts(inputTokens, outputTokens);
    console.log(`[BudgetMonitoring] Calculated request cost: ${requestCosts} ${this.costsCurrencyUnit}`);

    // Read existing costs
    const costs = await this.readCosts(projectDir);
    console.log(`[BudgetMonitoring] Loaded ${costs.length} existing cost entries`);

    // Get accumulated costs from the first (most recent) entry
    const previousAccumulated = costs.length > 0 ? costs[0].accumulatedCosts : 0;
    const accumulatedCosts = previousAccumulated + requestCosts;

    // Create new entry
    const newEntry: CostEntry = {
      timestamp: new Date().toISOString(),
      inputTokens,
      outputTokens,
      requestCosts,
      accumulatedCosts
    };

    // Add to beginning of array (newest first)
    costs.unshift(newEntry);

    // Write back to file
    const costsPath = await this.getCostsPath(projectDir);
    console.log(`[BudgetMonitoring] Writing costs to: ${costsPath}`);
    await this.writeCosts(projectDir, costs);
    console.log(`[BudgetMonitoring] Costs written successfully`);

    // Emit SSE event
    const subject = this.getSubject(projectDir);
    subject.next({
      project: projectDir,
      timestamp: newEntry.timestamp,
      currentCosts: accumulatedCosts,
      numberOfRequests: costs.length,
      currency: this.costsCurrencyUnit
    });

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
   * Get current costs summary
   */
  async getCurrentCosts(projectDir: string): Promise<{
    currentCosts: number;
    numberOfRequests: number;
    currency: string;
  }> {
    const costs = await this.readCosts(projectDir);
    return {
      currentCosts: costs.length > 0 ? costs[0].accumulatedCosts : 0,
      numberOfRequests: costs.length,
      currency: this.costsCurrencyUnit
    };
  }

  /**
   * Get all costs (returns last 10 entries but total count of all requests)
   */
  async getAllCosts(projectDir: string): Promise<{
    costs: CostEntry[];
    currency: string;
    numberOfRequests: number;
  }> {
    const costs = await this.readCosts(projectDir);
    return {
      costs: costs.slice(0, 10), // Return only last 10 entries
      currency: this.costsCurrencyUnit,
      numberOfRequests: costs.length // Total count of all requests
    };
  }

  /**
   * Get budget settings
   */
  async getSettings(projectDir: string): Promise<BudgetSettings> {
    const settingsPath = await this.getSettingsPath(projectDir);
    try {
      const content = await fs.readFile(settingsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return { enabled: false, limit: 0 };
    }
  }

  /**
   * Save budget settings
   */
  async saveSettings(projectDir: string, settings: BudgetSettings): Promise<void> {
    const settingsPath = await this.getSettingsPath(projectDir);
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
