import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InternalEvent, EventRule, RuleExecutionResult } from '../interfaces/event.interface';
import { PromptsStorageService } from './prompts-storage.service';
import { SSEPublisherService } from '../publishers/sse-publisher.service';
import axios from 'axios';

@Injectable()
export class RuleActionExecutorService {
  private readonly logger = new Logger(RuleActionExecutorService.name);
  private readonly backendUrl: string;

  constructor(
    private readonly promptsStorage: PromptsStorageService,
    @Inject(forwardRef(() => SSEPublisherService))
    private readonly ssePublisher: SSEPublisherService,
  ) {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:6060';
  }

  /**
   * Execute the action associated with a triggered rule
   */
  async executeAction(
    projectName: string,
    rule: EventRule,
    event: InternalEvent,
  ): Promise<{ success: boolean; error?: string; response?: string }> {
    this.logger.log(`Executing action for rule "${rule.name}" (${rule.id})`);

    if (rule.action.type !== 'prompt') {
      this.logger.warn(`Unsupported action type: ${rule.action.type}`);
      return { success: false, error: `Unsupported action type: ${rule.action.type}` };
    }

    try {
      // Load the prompt template
      const prompt = await this.promptsStorage.getPrompt(projectName, rule.action.promptId);

      if (!prompt) {
        this.logger.error(`Prompt not found: ${rule.action.promptId}`);
        return { success: false, error: `Prompt not found: ${rule.action.promptId}` };
      }

      // Build the final prompt with event context
      const finalPrompt = this.buildPromptWithContext(prompt.content, event, rule);

      this.logger.log(`Executing prompt "${prompt.title}" for project ${projectName}`);

      // Notify frontend that prompt execution is starting
      this.ssePublisher.publishPromptExecution(projectName, {
        status: 'started',
        ruleId: rule.id,
        ruleName: rule.name,
        promptId: prompt.id,
        promptTitle: prompt.title,
        eventId: event.id,
        timestamp: new Date().toISOString(),
      });

      // Execute the prompt via the Claude API
      const response = await this.executePrompt(projectName, finalPrompt, rule.name);

      // Notify frontend of completion
      this.ssePublisher.publishPromptExecution(projectName, {
        status: 'completed',
        ruleId: rule.id,
        ruleName: rule.name,
        promptId: prompt.id,
        promptTitle: prompt.title,
        eventId: event.id,
        response: response.substring(0, 500), // Truncate for SSE
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Prompt execution completed for rule "${rule.name}"`);
      return { success: true, response };
    } catch (error: any) {
      this.logger.error(`Failed to execute action for rule ${rule.id}:`, error);

      // Notify frontend of error
      this.ssePublisher.publishPromptExecution(projectName, {
        status: 'error',
        ruleId: rule.id,
        ruleName: rule.name,
        eventId: event.id,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Build prompt with event context injected
   */
  private buildPromptWithContext(
    promptTemplate: string,
    event: InternalEvent,
    rule: EventRule,
  ): string {
    // For Webhook events, prepend a special message with the full JSON payload
    if (event.group === 'Webhook') {
      const webhookContext = `The agent received this information via webhook:
${JSON.stringify(event.payload, null, 2)}

---

${promptTemplate}
`.trim();

      return webhookContext;
    }

    // Create context about the triggering event for other groups
    const eventContext = `
[AUTOMATED TRIGGER]
This prompt was automatically triggered by a condition monitoring rule.

Rule: ${rule.name}
Event: ${event.name}
Group: ${event.group}
Source: ${event.source}
${event.topic ? `Topic: ${event.topic}` : ''}
Timestamp: ${event.timestamp}

Event Payload:
${JSON.stringify(event.payload, null, 2)}

---

${promptTemplate}
`.trim();

    return eventContext;
  }

  /**
   * Execute prompt via Claude API using the unattended endpoint
   */
  private async executePrompt(projectName: string, prompt: string, ruleName: string): Promise<string> {
    const url = `${this.backendUrl}/api/claude/unattended/${encodeURIComponent(projectName)}`;

    try {
      const response = await axios.post(
        url,
        {
          prompt,
          maxTurns: 20,
          source: `Condition Monitor: ${ruleName}`
        },
        { timeout: 300000 } // 5 minute timeout
      );

      return response.data?.response || 'Prompt executed successfully';
    } catch (error: any) {
      this.logger.error(`Failed to execute prompt via unattended endpoint:`, error.message);
      throw error;
    }
  }
}
