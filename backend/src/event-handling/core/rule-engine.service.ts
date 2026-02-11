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
  EmailSemanticCondition,
  RuleExecutionResult,
} from '../interfaces/event.interface';
import { VectorStoreService } from '../../knowledge-graph/vector-store/vector-store.service';
import { KnowledgeGraphService } from '../../knowledge-graph/knowledge-graph.service';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs-extra';
import * as path from 'path';

const SIMILARITY_THRESHOLD = 0.86;

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);
  // Rules are now scoped per project: Map<projectName, Map<ruleId, EventRule>>
  private rulesByProject: Map<string, Map<string, EventRule>> = new Map();
  private eventHistory: Map<string, InternalEvent[]> = new Map(); // For compound conditions

  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly knowledgeGraph: KnowledgeGraphService,
  ) {}

  /**
   * Get or create the rules map for a specific project
   */
  private getProjectRules(projectName: string): Map<string, EventRule> {
    if (!this.rulesByProject.has(projectName)) {
      this.rulesByProject.set(projectName, new Map());
    }
    return this.rulesByProject.get(projectName)!;
  }

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

      // Clear existing rules for this project before loading
      const projectRules = this.getProjectRules(projectName);
      projectRules.clear();

      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        if (config.rules && Array.isArray(config.rules)) {
          for (const rule of config.rules) {
            projectRules.set(rule.id, rule);
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

      const projectRules = this.getProjectRules(projectName);
      const config = {
        rules: Array.from(projectRules.values()),
      };

      await fs.writeJson(configPath, config, { spaces: 2 });
      this.logger.log(`Saved ${projectRules.size} rules for project ${projectName}`);
    } catch (error) {
      this.logger.error(`Failed to save rules for project ${projectName}`, error);
      throw error;
    }
  }

  /**
   * Add a new rule to a specific project
   */
  addRule(projectName: string, rule: EventRule): void {
    const projectRules = this.getProjectRules(projectName);
    projectRules.set(rule.id, rule);
    this.logger.log(`Added rule: ${rule.name} (${rule.id}) to project ${projectName}`);
  }

  /**
   * Update an existing rule in a specific project
   */
  updateRule(projectName: string, ruleId: string, updates: Partial<EventRule>): EventRule | null {
    const projectRules = this.getProjectRules(projectName);
    const rule = projectRules.get(ruleId);
    if (!rule) {
      this.logger.warn(`Rule not found: ${ruleId} in project ${projectName}`);
      return null;
    }

    const updatedRule = { ...rule, ...updates, updatedAt: new Date().toISOString() };
    projectRules.set(ruleId, updatedRule);
    this.logger.log(`Updated rule: ${updatedRule.name} (${ruleId}) in project ${projectName}`);
    return updatedRule;
  }

  /**
   * Delete a rule from a specific project
   */
  deleteRule(projectName: string, ruleId: string): boolean {
    const projectRules = this.getProjectRules(projectName);
    const deleted = projectRules.delete(ruleId);
    if (deleted) {
      this.logger.log(`Deleted rule: ${ruleId} from project ${projectName}`);
    }
    return deleted;
  }

  /**
   * Get all rules for a specific project
   */
  getAllRules(projectName: string): EventRule[] {
    const projectRules = this.getProjectRules(projectName);
    return Array.from(projectRules.values());
  }

  /**
   * Get a specific rule from a project
   */
  getRule(projectName: string, ruleId: string): EventRule | undefined {
    const projectRules = this.getProjectRules(projectName);
    return projectRules.get(ruleId);
  }

  /**
   * Evaluate an event against all rules for a specific project
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

    // Get rules for this specific project only
    const projectRules = this.getProjectRules(projectName);

    // Evaluate each enabled rule for this project
    for (const rule of projectRules.values()) {
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
      case 'email-semantic':
        return await this.evaluateEmailSemanticCondition(event, condition as EmailSemanticCondition);
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

      // Handle nested payload fields (e.g., "payload.path" or "payload.message.status")
      if (key.startsWith('payload.')) {
        const payloadPath = key.substring(8); // Remove "payload." prefix
        let eventValue: any;

        // Support dot-notation for nested fields (e.g., "message.status")
        const pathParts = payloadPath.split('.');
        eventValue = event.payload;

        for (const part of pathParts) {
          if (eventValue === undefined || eventValue === null) {
            break;
          }

          // If current value is a string, try to parse it as JSON (for MQTT message content)
          if (typeof eventValue === 'string') {
            try {
              eventValue = JSON.parse(eventValue);
            } catch {
              // Not valid JSON, treat as string
              eventValue = undefined;
              break;
            }
          }

          eventValue = eventValue[part];
        }

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
   * Evaluate email semantic condition using Haiku LLM
   */
  private async evaluateEmailSemanticCondition(
    event: InternalEvent,
    condition: EmailSemanticCondition,
  ): Promise<boolean> {
    if (event.group !== 'Email') return false;

    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const prompt = `You are an email rule evaluator. Given an email and a rule criteria, determine if the email matches the criteria.

Email data:
${JSON.stringify(event.payload, null, 2)}

Rule criteria: "${condition.criteria}"

Does this email match the criteria? Respond with ONLY "YES" or "NO".`;

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content.find((b) => b.type === 'text')?.text?.trim().toUpperCase();
      const matched = text === 'YES';

      if (matched) {
        this.logger.log(`Email semantic condition matched: "${condition.criteria}"`);
      }

      return matched;
    } catch (error) {
      this.logger.error('Error evaluating email semantic condition', error);
      return false;
    }
  }

  /**
   * Get available event groups
   */
  getEventGroups(): string[] {
    return ['Filesystem', 'MQTT', 'Scheduling', 'Claude Code', 'Webhook', 'Email'];
  }
}
