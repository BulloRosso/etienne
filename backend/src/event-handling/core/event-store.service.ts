import { Injectable, Logger } from '@nestjs/common';
import { InternalEvent, RuleExecutionResult } from '../interfaces/event.interface';
import { VectorStoreService } from '../../knowledge-graph/vector-store/vector-store.service';
import { KnowledgeGraphService } from '../../knowledge-graph/knowledge-graph.service';
import * as fs from 'fs-extra';
import * as path from 'path';

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);

  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly knowledgeGraph: KnowledgeGraphService,
  ) {}

  /**
   * Store event that triggered rules (to vector + RDF stores)
   */
  async storeTriggeredEvent(
    projectName: string,
    event: InternalEvent,
    executionResults: RuleExecutionResult[],
  ): Promise<void> {
    try {
      // Only store if at least one rule was triggered successfully
      const successfulRules = executionResults.filter((r) => r.success);
      if (successfulRules.length === 0) {
        return;
      }

      this.logger.debug(
        `Storing event ${event.id} that triggered ${successfulRules.length} rule(s)`,
      );

      // Store in vector store (with embeddings for semantic search)
      await this.storeInVectorStore(projectName, event, successfulRules);

      // Store in RDF store (as structured metadata)
      await this.storeInRDFStore(projectName, event, successfulRules);

      // Optionally write to file in .etienne/event-log/
      await this.writeToEventLog(projectName, event, successfulRules);
    } catch (error) {
      this.logger.error(`Failed to store triggered event ${event.id}`, error);
    }
  }

  /**
   * Store event in vector store
   */
  private async storeInVectorStore(
    projectName: string,
    event: InternalEvent,
    executionResults: RuleExecutionResult[],
  ): Promise<void> {
    try {
      // TODO: Implement vector store integration when API is finalized
      this.logger.debug(`Skipping vector store for event ${event.id} (not yet implemented)`);
    } catch (error) {
      this.logger.error(`Failed to store event ${event.id} in vector store`, error);
    }
  }

  /**
   * Store event in RDF store
   */
  private async storeInRDFStore(
    projectName: string,
    event: InternalEvent,
    executionResults: RuleExecutionResult[],
  ): Promise<void> {
    try {
      // TODO: Implement RDF store integration when API is finalized
      this.logger.debug(`Skipping RDF store for event ${event.id} (not yet implemented)`);
    } catch (error) {
      this.logger.error(`Failed to store event ${event.id} in RDF store`, error);
    }
  }

  /**
   * Write event to file log (optional)
   */
  private async writeToEventLog(
    projectName: string,
    event: InternalEvent,
    executionResults: RuleExecutionResult[],
  ): Promise<void> {
    try {
      const logDir = path.join(
        process.cwd(),
        '..',
        'workspace',
        projectName,
        '.etienne',
        'event-log',
      );

      await fs.ensureDir(logDir);

      // Create log file named by date (YYYY-MM-DD.jsonl)
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      const logFile = path.join(logDir, `${date}.jsonl`);

      const logEntry = {
        event,
        triggeredRules: executionResults.filter((r) => r.success).map((r) => r.ruleId),
        timestamp: new Date().toISOString(),
      };

      // Append as JSON lines
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      this.logger.error(`Failed to write event ${event.id} to log file`, error);
    }
  }

  /**
   * Search events by natural language query
   */
  async searchEvents(
    projectName: string,
    query: string,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      // TODO: Implement vector search when API is finalized
      this.logger.debug(`Event search not yet implemented`);
      return [];
    } catch (error) {
      this.logger.error('Failed to search events', error);
      return [];
    }
  }

  /**
   * Get events by date range from file logs
   */
  async getEventsByDateRange(
    projectName: string,
    startDate: string,
    endDate: string,
  ): Promise<any[]> {
    try {
      const logDir = path.join(
        process.cwd(),
        '..',
        'workspace',
        projectName,
        '.etienne',
        'event-log',
      );

      if (!(await fs.pathExists(logDir))) {
        return [];
      }

      const events: any[] = [];
      const files = await fs.readdir(logDir);

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const fileDate = file.replace('.jsonl', '');
        if (fileDate >= startDate && fileDate <= endDate) {
          const filePath = path.join(logDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n');

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              events.push(entry);
            } catch (e) {
              this.logger.warn(`Failed to parse log entry in ${file}`);
            }
          }
        }
      }

      return events;
    } catch (error) {
      this.logger.error('Failed to get events by date range', error);
      return [];
    }
  }

  /**
   * Get latest events from file logs
   */
  async getLatestEvents(projectName: string, limit: number = 50): Promise<any[]> {
    try {
      const logDir = path.join(
        process.cwd(),
        '..',
        'workspace',
        projectName,
        '.etienne',
        'event-log',
      );

      if (!(await fs.pathExists(logDir))) {
        return [];
      }

      const events: any[] = [];
      const files = await fs.readdir(logDir);

      // Sort files by date descending (most recent first)
      const sortedFiles = files
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
        .reverse();

      for (const file of sortedFiles) {
        const filePath = path.join(logDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter((l) => l);

        // Read lines in reverse order (most recent first)
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            events.push(entry);

            if (events.length >= limit) {
              return events;
            }
          } catch (e) {
            this.logger.warn(`Failed to parse log entry in ${file}`);
          }
        }
      }

      return events;
    } catch (error) {
      this.logger.error('Failed to get latest events', error);
      return [];
    }
  }
}
