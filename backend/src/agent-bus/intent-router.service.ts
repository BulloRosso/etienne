import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { EventBusService } from './event-bus.service';
import { BusLoggerService } from './bus-logger.service';
import { AgentIntentMessage, WorkflowTriggerMessage } from './interfaces/bus-messages';
import { StatefulWorkflowsService } from '../stateful-workflows/stateful-workflows.service';

interface IntentMapping {
  intentType: string;
  workflowId: string;
  event: string;
  mapContext?: boolean;
  filter?: {
    urgency?: string[];
  };
}

interface IntentRouterConfig {
  mappings: IntentMapping[];
}

@Injectable()
export class IntentRouterService implements OnModuleInit {
  private readonly logger = new Logger(IntentRouterService.name);
  private readonly workspaceDir = path.resolve(process.cwd(), process.env.WORKSPACE_ROOT || '../workspace');
  private configCache = new Map<string, IntentRouterConfig>();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly busLogger: BusLoggerService,
    @Optional()
    private readonly workflowsService: StatefulWorkflowsService,
  ) {}

  async onModuleInit() {
    // Subscribe to agent/intent topic
    this.eventBus.subscribe('agent/intent', async (topic, message: AgentIntentMessage) => {
      await this.handleIntent(message);
    });
    this.logger.log('IntentRouterService subscribed to agent/intent');
  }

  /**
   * Handle an incoming intent message: map to workflow triggers
   */
  private async handleIntent(message: AgentIntentMessage): Promise<void> {
    try {
      const config = await this.loadConfig(message.projectName);
      if (!config) {
        this.logger.debug(`No intent-router config for project ${message.projectName}`);
        return;
      }

      const matchingMappings = config.mappings.filter(m => {
        if (m.intentType !== message.intentType) return false;
        if (m.filter?.urgency && message.urgency) {
          if (!m.filter.urgency.includes(message.urgency)) return false;
        }
        return true;
      });

      if (matchingMappings.length === 0) {
        this.logger.debug(
          `No mappings found for intent "${message.intentType}" in project ${message.projectName}`,
        );
        return;
      }

      for (const mapping of matchingMappings) {
        this.logger.log(
          `Routing intent "${message.intentType}" to workflow "${mapping.workflowId}" (event: ${mapping.event})`,
        );

        const triggerData: any = {
          correlationId: message.correlationId,
          intentType: message.intentType,
          urgency: message.urgency,
          ...(mapping.mapContext ? { context: message.context } : {}),
        };

        // Publish to bus for observability
        await this.eventBus.publish('workflow/trigger', {
          correlationId: message.correlationId,
          projectName: message.projectName,
          workflowId: mapping.workflowId,
          event: mapping.event,
          data: triggerData,
          source: 'intent-router',
        } as WorkflowTriggerMessage);

        // Also directly call workflow service for immediate execution
        if (this.workflowsService) {
          try {
            await this.workflowsService.sendEvent(
              message.projectName,
              mapping.workflowId,
              mapping.event,
              triggerData,
              { ignoreInvalidTransitions: true },
            );
          } catch (err: any) {
            this.logger.error(
              `Failed to send event to workflow "${mapping.workflowId}": ${err.message}`,
            );
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to handle intent: ${error.message}`, error);
    }
  }

  /**
   * Load per-project intent router config from workspace
   */
  private async loadConfig(projectName: string): Promise<IntentRouterConfig | null> {
    const cached = this.configCache.get(projectName);
    if (cached) return cached;

    const configPath = path.join(
      this.workspaceDir,
      projectName,
      '.etienne',
      'intent-router.json',
    );

    try {
      if (!await fs.pathExists(configPath)) {
        return null;
      }

      const config: IntentRouterConfig = await fs.readJson(configPath);
      this.configCache.set(projectName, config);
      this.logger.debug(`Loaded intent-router config for project ${projectName}`);
      return config;
    } catch (error: any) {
      this.logger.error(`Failed to load intent-router config for ${projectName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear cached config (e.g., after config file changes)
   */
  clearConfigCache(projectName?: string): void {
    if (projectName) {
      this.configCache.delete(projectName);
    } else {
      this.configCache.clear();
    }
  }
}
