import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { InternalEvent, EventRule, RuleExecutionResult, WorkflowEventAction, IntentAction } from '../interfaces/event.interface';
import { PromptsStorageService } from './prompts-storage.service';
import { SSEPublisherService } from '../publishers/sse-publisher.service';
import { StatefulWorkflowsService } from '../../stateful-workflows/stateful-workflows.service';
import { EventBusService } from '../../agent-bus/event-bus.service';
import { ContextInjectorService } from '../../agent-bus/context-injector.service';
import { AgentIntentMessage } from '../../agent-bus/interfaces/bus-messages';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

@Injectable()
export class RuleActionExecutorService {
  private readonly logger = new Logger(RuleActionExecutorService.name);
  private readonly backendUrl: string;
  private serviceToken: string;

  constructor(
    private readonly promptsStorage: PromptsStorageService,
    @Inject(forwardRef(() => SSEPublisherService))
    private readonly ssePublisher: SSEPublisherService,
    @Optional()
    private readonly workflowsService: StatefulWorkflowsService,
    @Optional()
    private readonly eventBus: EventBusService,
    @Optional()
    private readonly contextInjector: ContextInjectorService,
  ) {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:6060';
    // Generate a long-lived service token for internal API calls
    this.serviceToken = this.generateServiceToken();
  }

  /**
   * Generate a JWT token for internal service-to-service communication
   */
  private generateServiceToken(): string {
    const payload = {
      sub: 'rule-action-executor',
      username: 'system',
      role: 'admin',
      displayName: 'Rule Action Executor',
      type: 'access',
    };
    // Token valid for 1 year (internal service token)
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '365d' });
  }

  /**
   * Execute the action associated with a triggered rule
   */
  async executeAction(
    projectName: string,
    rule: EventRule,
    event: InternalEvent,
  ): Promise<{ success: boolean; error?: string; response?: string }> {
    this.logger.log(`Executing action for rule "${rule.name}" (${rule.id}), type: ${rule.action.type}`);

    switch (rule.action.type) {
      case 'prompt':
        return this.executePromptAction(projectName, rule, event);

      case 'workflow_event':
        return this.executeWorkflowEventAction(projectName, rule, event);

      case 'intent':
        return this.executeIntentAction(projectName, rule, event);

      default:
        this.logger.warn(`Unsupported action type: ${(rule.action as any).type}`);
        return { success: false, error: `Unsupported action type: ${(rule.action as any).type}` };
    }
  }

  /**
   * Execute a prompt action (existing behavior)
   */
  private async executePromptAction(
    projectName: string,
    rule: EventRule,
    event: InternalEvent,
  ): Promise<{ success: boolean; error?: string; response?: string }> {
    try {
      const action = rule.action as { type: 'prompt'; promptId: string };
      // Load the prompt template
      const prompt = await this.promptsStorage.getPrompt(projectName, action.promptId);

      if (!prompt) {
        this.logger.error(`Prompt not found: ${action.promptId}`);
        return { success: false, error: `Prompt not found: ${action.promptId}` };
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
   * Execute a workflow_event action: send an event to a stateful workflow
   */
  private async executeWorkflowEventAction(
    projectName: string,
    rule: EventRule,
    event: InternalEvent,
  ): Promise<{ success: boolean; error?: string; response?: string }> {
    if (!this.workflowsService) {
      this.logger.error('StatefulWorkflowsService not available for workflow_event action');
      return { success: false, error: 'Workflow service not available' };
    }

    const action = rule.action as WorkflowEventAction;

    try {
      this.logger.log(
        `Sending event "${action.event}" to workflow "${action.workflowId}" in project ${projectName} (triggered by ${event.name})`,
      );

      // Notify frontend that workflow execution is starting
      this.ssePublisher.publishWorkflowExecution(projectName, {
        status: 'started',
        ruleId: rule.id,
        ruleName: rule.name,
        workflowId: action.workflowId,
        workflowEvent: action.event,
        eventId: event.id,
        timestamp: new Date().toISOString(),
      });

      // Build event data from the triggering event
      const eventData = action.mapPayload
        ? {
            triggerEvent: event.name,
            triggerGroup: event.group,
            triggerSource: event.source,
            triggerTimestamp: event.timestamp,
            topic: event.topic,
            payload: event.payload,
            ruleId: rule.id,
            ruleName: rule.name,
          }
        : {
            triggerEvent: event.name,
            triggerGroup: event.group,
            ruleId: rule.id,
            ruleName: rule.name,
          };

      const result = await this.workflowsService.sendEvent(
        projectName,
        action.workflowId,
        action.event,
        eventData,
        { ignoreInvalidTransitions: true },
      );

      if (result.ignored) {
        // Event was ignored because the workflow is not in a state that accepts it
        const response = `Workflow "${action.workflowId}" ignored event "${action.event}" in state "${result.currentState}": ${result.reason}`;
        this.logger.warn(response);

        // Notify frontend with 'ignored' status
        this.ssePublisher.publishWorkflowExecution(projectName, {
          status: 'ignored',
          ruleId: rule.id,
          ruleName: rule.name,
          workflowId: action.workflowId,
          workflowEvent: action.event,
          eventId: event.id,
          previousState: result.previousState,
          currentState: result.currentState,
          error: result.reason,
          timestamp: new Date().toISOString(),
        });

        return { success: true, response };
      }

      const response = `Workflow "${action.workflowId}" transitioned: ${result.previousState} -> ${result.currentState}`;
      this.logger.log(response);

      // Notify frontend of completion
      this.ssePublisher.publishWorkflowExecution(projectName, {
        status: 'completed',
        ruleId: rule.id,
        ruleName: rule.name,
        workflowId: action.workflowId,
        workflowEvent: action.event,
        eventId: event.id,
        previousState: result.previousState,
        currentState: result.currentState,
        timestamp: new Date().toISOString(),
      });

      return { success: true, response };
    } catch (error: any) {
      this.logger.error(
        `Failed to send event to workflow "${action.workflowId}": ${error.message}`,
      );

      // Notify frontend of error
      this.ssePublisher.publishWorkflowExecution(projectName, {
        status: 'error',
        ruleId: rule.id,
        ruleName: rule.name,
        workflowId: action.workflowId,
        workflowEvent: action.event,
        eventId: event.id,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Execute an intent action: classify intent and publish to the agent bus
   */
  private async executeIntentAction(
    projectName: string,
    rule: EventRule,
    event: InternalEvent,
  ): Promise<{ success: boolean; error?: string; response?: string }> {
    if (!this.eventBus) {
      this.logger.error('EventBusService not available for intent action');
      return { success: false, error: 'Event bus service not available' };
    }

    const action = rule.action as IntentAction;

    try {
      this.logger.log(
        `Publishing intent "${action.intentType}" for project ${projectName} (triggered by ${event.name})`,
      );

      // Extract entity ID from event payload using dot-path if specified
      let entityId: string | undefined;
      if (action.entityIdField) {
        entityId = this.getNestedValue(event.payload, action.entityIdField);
      }

      // Optionally enrich with DSS context
      let context: Record<string, any> = {};
      if (action.enrichWithDss && entityId && this.contextInjector) {
        const entityContext = await this.contextInjector.getEntityContext(
          projectName,
          entityId,
          event.correlationId,
        );
        if (entityContext) {
          context = { entityContext };
        }
      }

      // Build and publish the intent message
      const intentMessage: AgentIntentMessage = {
        correlationId: event.correlationId || '',
        projectName,
        intentType: action.intentType,
        entityId,
        urgency: action.urgency,
        context,
        sourceEvent: event,
      };

      await this.eventBus.publish('agent/intent', intentMessage);

      // Notify frontend via SSE
      this.ssePublisher.publishPromptExecution(projectName, {
        status: 'completed',
        ruleId: rule.id,
        ruleName: rule.name,
        eventId: event.id,
        response: `Intent "${action.intentType}" published to agent bus`,
        timestamp: new Date().toISOString(),
      });

      const response = `Intent "${action.intentType}" published (urgency: ${action.urgency || 'none'}, entity: ${entityId || 'none'})`;
      this.logger.log(response);
      return { success: true, response };
    } catch (error: any) {
      this.logger.error(`Failed to execute intent action: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a nested value from an object using a dot-path (e.g., "sender.email")
   */
  private getNestedValue(obj: any, path: string): string | undefined {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return typeof current === 'string' ? current : current?.toString();
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
\`\`\`json
${JSON.stringify(event.payload, null, 2)}
\`\`\`

---

${promptTemplate}
`.trim();

      return webhookContext;
    }

    // For Email events, prepend the email content
    if (event.group === 'Email') {
      const emailContext = `The agent received an email:
From: ${event.payload.From}
To: ${event.payload.To}
Subject: ${event.payload.Subject}
Important: ${event.payload.Important ? 'Yes' : 'No'}
Attachments: ${event.payload.Attachments?.length > 0 ? event.payload.Attachments.join(', ') : 'None'}

Body:
${event.payload.BodyText}

---

${promptTemplate}
`.trim();

      return emailContext;
    }

    // For Filesystem events, prepend the file path information
    if (event.group === 'Filesystem') {
      const payload = event.payload as { path?: string; projectName?: string };
      // Extract just the file path relative to the project (remove project name prefix)
      const filePath = payload.path || '';
      const projectName = payload.projectName || '';
      const relativeToProject = filePath.startsWith(projectName + '/') || filePath.startsWith(projectName + '\\')
        ? filePath.substring(projectName.length + 1)
        : filePath;

      const filesystemContext = `The agent detected a filesystem event:
Event: ${event.name}
File: ${relativeToProject}

---

${promptTemplate}
`.trim();

      return filesystemContext;
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
        {
          timeout: 300000, // 5 minute timeout
          headers: {
            'Authorization': `Bearer ${this.serviceToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data?.response || 'Prompt executed successfully';
    } catch (error: any) {
      this.logger.error(`Failed to execute prompt via unattended endpoint:`, error.message);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}, data:`, error.response.data);
      }
      throw error;
    }
  }
}
