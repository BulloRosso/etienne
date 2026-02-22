import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { BusLogEntry, ServiceName } from './interfaces/bus-messages';

@Injectable()
export class BusLoggerService {
  private readonly logger = new Logger(BusLoggerService.name);
  private readonly workspaceDir = path.resolve(process.cwd(), process.env.WORKSPACE_ROOT || '../workspace');

  private readonly logPaths: Record<ServiceName, string> = {
    cms: process.env.AGENT_BUS_LOG_CMS || '.etienne/agent-logs/cms.jsonl',
    dss: process.env.AGENT_BUS_LOG_DSS || '.etienne/agent-logs/dss.jsonl',
    swe: process.env.AGENT_BUS_LOG_SWE || '.etienne/agent-logs/swe.jsonl',
  };

  /**
   * Get the log file path for a service/project, with daily rotation suffix
   */
  private getLogFilePath(project: string, service: ServiceName): string {
    const basePath = this.logPaths[service];
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    // Insert date before .jsonl extension: cms.jsonl → cms-2026-02-21.jsonl
    const rotatedPath = basePath.replace('.jsonl', `-${date}.jsonl`);
    return path.join(this.workspaceDir, project, rotatedPath);
  }

  /**
   * Log an entry to the appropriate service's log file
   */
  async log(entry: Omit<BusLogEntry, 'timestamp'>): Promise<void> {
    try {
      const fullEntry: BusLogEntry = {
        timestamp: new Date().toISOString(),
        ...entry,
      };

      const filePath = this.getLogFilePath(entry.projectName, entry.service);
      await fs.ensureDir(path.dirname(filePath));
      await fs.appendFile(filePath, JSON.stringify(fullEntry) + '\n');
    } catch (error) {
      this.logger.error(`Failed to write bus log entry for ${entry.service}/${entry.action}`, error);
    }
  }

  /**
   * Read trace by correlationId across all three service logs
   */
  async getTrace(project: string, correlationId: string): Promise<BusLogEntry[]> {
    const entries: BusLogEntry[] = [];

    for (const service of ['cms', 'dss', 'swe'] as ServiceName[]) {
      const serviceEntries = await this.readServiceLogs(project, service);
      entries.push(...serviceEntries.filter(e => e.correlationId === correlationId));
    }

    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * List recent entries for a service
   */
  async getRecentEntries(project: string, service: ServiceName, limit: number = 50): Promise<BusLogEntry[]> {
    const entries = await this.readServiceLogs(project, service);
    return entries
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get recent traces (unique correlationIds with summary)
   */
  async getRecentTraces(project: string, limit: number = 50): Promise<Array<{
    correlationId: string;
    firstTimestamp: string;
    lastTimestamp: string;
    services: ServiceName[];
    entryCount: number;
    firstAction: string;
    firstTopic: string;
  }>> {
    const allEntries: BusLogEntry[] = [];

    for (const service of ['cms', 'dss', 'swe'] as ServiceName[]) {
      const serviceEntries = await this.readServiceLogs(project, service);
      allEntries.push(...serviceEntries);
    }

    // Group by correlationId
    const grouped = new Map<string, BusLogEntry[]>();
    for (const entry of allEntries) {
      const group = grouped.get(entry.correlationId) || [];
      group.push(entry);
      grouped.set(entry.correlationId, group);
    }

    // Build summaries
    const traces = Array.from(grouped.entries()).map(([correlationId, entries]) => {
      const sorted = entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const services = [...new Set(sorted.map(e => e.service))];
      return {
        correlationId,
        firstTimestamp: sorted[0].timestamp,
        lastTimestamp: sorted[sorted.length - 1].timestamp,
        services,
        entryCount: sorted.length,
        firstAction: sorted[0].action,
        firstTopic: sorted[0].topic,
      };
    });

    return traces
      .sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp))
      .slice(0, limit);
  }

  /**
   * Read all log files for a service in a project (across all date-rotated files)
   */
  private async readServiceLogs(project: string, service: ServiceName): Promise<BusLogEntry[]> {
    const entries: BusLogEntry[] = [];

    try {
      const basePath = this.logPaths[service];
      const logDir = path.join(
        this.workspaceDir,
        project,
        path.dirname(basePath),
      );

      if (!await fs.pathExists(logDir)) {
        return [];
      }

      const baseFileName = path.basename(basePath, '.jsonl');
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(f => f.startsWith(baseFileName) && f.endsWith('.jsonl'));

      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l);

        for (const line of lines) {
          try {
            entries.push(JSON.parse(line));
          } catch {
            this.logger.warn(`Failed to parse log entry in ${file}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to read ${service} logs for project ${project}`, error);
    }

    return entries;
  }
}
