import { Injectable, Logger } from '@nestjs/common';
import {
  InternalEvent,
  EventRule,
  EventCondition,
  SimpleCondition,
  SemanticCondition,
  KnowledgeGraphCondition,
  CompoundCondition,
  TemporalConstraint,
  RuleExecutionResult,
} from '../interfaces/event.interface';
import { VectorStoreService } from '../../knowledge-graph/vector-store/vector-store.service';
import { KnowledgeGraphService } from '../../knowledge-graph/knowledge-graph.service';
import * as fs from 'fs-extra';
import * as path from 'path';

const SIMILARITY_THRESHOLD = 0.86;

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);
  private rules: Map<string, EventRule> = new Map();
  private eventHistory: Map<string, InternalEvent[]> = new Map(); // For compound conditions

  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly knowledgeGraph: KnowledgeGraphService,
  ) {}

  /**
   * Load rules from project configuration
   */
  async loadRules(projectName: string): Promise<void> {
    try {
      const configPath = path.join(
        process.cwd(),
        '..',
        'workspace',
        projectName,
        '.etienne',
        'event-handling.json',
      );

      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        if (config.rules && Array.isArray(config.rules)) {
          for (const rule of config.rules) {
            this.rules.set(rule.id, rule);
          }
          this.logger.log(`Loaded ${config.rules.length} rules for project ${projectName}`);
        }
      } else {
        this.logger.log(`No event-handling config found for project ${projectName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load rules for project ${projectName}`, error);
    }
  }

  /**
   * Save rules to project configuration
   */
  async saveRules(projectName: string): Promise<void> {
    try {
      const configPath = path.join(
        process.cwd(),
        '..',
        'workspace',
        projectName,
        '.etienne',
        'event-handling.json',
      );

      await fs.ensureDir(path.dirname(configPath));

      const config = {
        rules: Array.from(this.rules.values()),
      };

      await fs.writeJson(configPath, config, { spaces: 2 });
      this.logger.log(`Saved ${this.rules.size} rules for project ${projectName}`);
    } catch (error) {
      this.logger.error(`Failed to save rules for project ${projectName}`, error);
      throw error;
    }
  }

  /**
   * Add a new rule
   */
  addRule(rule: EventRule): void {
    this.rules.set(rule.id, rule);
    this.logger.log(`Added rule: ${rule.name} (${rule.id})`);
  }

  /**
   * Update an existing rule
   */
  updateRule(ruleId: string, updates: Partial<EventRule>): EventRule | null {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      this.logger.warn(`Rule not found: ${ruleId}`);
      return null;
    }

    const updatedRule = { ...rule, ...updates, updatedAt: new Date().toISOString() };
    this.rules.set(ruleId, updatedRule);
    this.logger.log(`Updated rule: ${updatedRule.name} (${ruleId})`);
    return updatedRule;
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.logger.log(`Deleted rule: ${ruleId}`);
    }
    return deleted;
  }

  /**
   * Get all rules
   */
  getAllRules(): EventRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific rule
   */
  getRule(ruleId: string): EventRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Evaluate an event against all rules
   */
  async evaluateEvent(
    event: InternalEvent,
    projectName: string,
  ): Promise<RuleExecutionResult[]> {
    const results: RuleExecutionResult[] = [];

    // Store event in history for compound conditions
    const projectHistory = this.eventHistory.get(projectName) || [];
    projectHistory.push(event);
    // Keep only last 1000 events per project
    if (projectHistory.length > 1000) {
      projectHistory.shift();
    }
    this.eventHistory.set(projectName, projectHistory);

    // Evaluate each enabled rule
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const matches = await this.evaluateCondition(
          event,
          rule.condition,
          projectName,
          projectHistory,
        );

        if (matches) {
          this.logger.log(`Rule matched: ${rule.name} (${rule.id}) for event ${event.id}`);
          results.push({
            ruleId: rule.id,
            eventId: event.id,
            success: true,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        this.logger.error(`Error evaluating rule ${rule.id}`, error);
        results.push({
          ruleId: rule.id,
          eventId: event.id,
          success: false,
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Evaluate a condition against an event
   */
  private async evaluateCondition(
    event: InternalEvent,
    condition: EventCondition,
    projectName: string,
    eventHistory: InternalEvent[],
  ): Promise<boolean> {
    switch (condition.type) {
      case 'simple':
        return this.evaluateSimpleCondition(event, condition);
      case 'semantic':
        return await this.evaluateSemanticCondition(event, condition, projectName);
      case 'knowledge-graph':
        return await this.evaluateKnowledgeGraphCondition(event, condition, projectName);
      case 'compound':
        return await this.evaluateCompoundCondition(event, condition, projectName, eventHistory);
      default:
        // Temporal constraint
        return this.evaluateTemporalConstraint(event, condition as TemporalConstraint);
    }
  }

  /**
   * Evaluate simple condition (exact matching)
   */
  private evaluateSimpleCondition(event: InternalEvent, condition: SimpleCondition): boolean {
    const { event: eventPattern } = condition;

    // Check group
    if (eventPattern.group && event.group !== eventPattern.group) {
      return false;
    }

    // Check name
    if (eventPattern.name && event.name !== eventPattern.name) {
      return false;
    }

    // Check topic
    if (eventPattern.topic && event.topic !== eventPattern.topic) {
      // Support wildcard matching
      const pattern = new RegExp('^' + eventPattern.topic.replace(/\*/g, '.*') + '$');
      if (!pattern.test(event.topic || '')) {
        return false;
      }
    }

    // Check payload fields
    for (const [key, value] of Object.entries(eventPattern)) {
      if (['group', 'name', 'topic'].includes(key)) continue;

      // Handle nested payload fields (e.g., "payload.path")
      if (key.startsWith('payload.')) {
        const payloadKey = key.substring(8); // Remove "payload." prefix
        const eventValue = event.payload?.[payloadKey];

        if (typeof value === 'string' && value.includes('*')) {
          // Wildcard matching
          const pattern = new RegExp('^' + value.replace(/\*/g, '.*') + '$');
          if (!pattern.test(String(eventValue || ''))) {
            return false;
          }
        } else if (eventValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Evaluate semantic condition (vector similarity)
   */
  private async evaluateSemanticCondition(
    event: InternalEvent,
    condition: SemanticCondition,
    projectName: string,
  ): Promise<boolean> {
    try {
      const { event: eventPattern } = condition;
      const { similarity } = eventPattern.payload;

      // Check basic filters first
      if (eventPattern.group && event.group !== eventPattern.group) {
        return false;
      }
      if (eventPattern.name && event.name !== eventPattern.name) {
        return false;
      }

      // Perform semantic search
      const threshold = similarity.threshold || SIMILARITY_THRESHOLD;
      const searchResults = await this.vectorStore.search(
        projectName,
        similarity.query,
        1,
        similarity.tags,
      );

      if (searchResults.length === 0) {
        return false;
      }

      // Check if any result meets the threshold
      return searchResults.some((result) => result.score >= threshold);
    } catch (error) {
      this.logger.error('Error evaluating semantic condition', error);
      return false;
    }
  }

  /**
   * Evaluate knowledge-graph condition (SPARQL query)
   */
  private async evaluateKnowledgeGraphCondition(
    event: InternalEvent,
    condition: KnowledgeGraphCondition,
    projectName: string,
  ): Promise<boolean> {
    try {
      // Execute SPARQL query
      const results = await this.knowledgeGraph.executeSparqlQuery(
        projectName,
        condition.sparqlQuery,
      );

      // If query returns any results, condition is met
      return results.length > 0;
    } catch (error) {
      this.logger.error('Error evaluating knowledge-graph condition', error);
      return false;
    }
  }

  /**
   * Evaluate compound condition
   */
  private async evaluateCompoundCondition(
    event: InternalEvent,
    condition: CompoundCondition,
    projectName: string,
    eventHistory: InternalEvent[],
  ): Promise<boolean> {
    const { operator, conditions, timeWindow } = condition;

    // Filter events within time window if specified
    let relevantEvents = eventHistory;
    if (timeWindow) {
      const cutoffTime = Date.parse(event.timestamp) - timeWindow;
      relevantEvents = eventHistory.filter((e) => Date.parse(e.timestamp) >= cutoffTime);
    }

    // Evaluate each sub-condition
    const results = await Promise.all(
      conditions.map((c) => this.evaluateCondition(event, c, projectName, relevantEvents)),
    );

    // Apply logical operator
    switch (operator) {
      case 'AND':
        return results.every((r) => r);
      case 'OR':
        return results.some((r) => r);
      case 'NOT':
        return !results[0];
      default:
        return false;
    }
  }

  /**
   * Evaluate temporal constraint
   */
  private evaluateTemporalConstraint(
    event: InternalEvent,
    constraint: TemporalConstraint,
  ): boolean {
    if (!constraint.time) return true;

    const eventDate = new Date(event.timestamp);
    const { after, before, dayOfWeek } = constraint.time;

    // Check day of week
    if (dayOfWeek && !dayOfWeek.includes(eventDate.getDay())) {
      return false;
    }

    // Check time of day
    const eventTime = `${String(eventDate.getHours()).padStart(2, '0')}:${String(eventDate.getMinutes()).padStart(2, '0')}`;

    if (after && eventTime < after) {
      return false;
    }

    if (before && eventTime > before) {
      return false;
    }

    return true;
  }

  /**
   * Get available event groups
   */
  getEventGroups(): string[] {
    return ['Filesystem', 'MQTT', 'Scheduling', 'Claude Code'];
  }
}
