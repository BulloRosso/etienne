import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import * as zmq from 'zeromq';
import { randomUUID } from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { InternalEvent } from '../interfaces/event.interface';
import { RuleEngineService } from './rule-engine.service';
import { EventStoreService } from './event-store.service';
import { SSEPublisherService } from '../publishers/sse-publisher.service';
import { RuleActionExecutorService } from './rule-action-executor.service';

@Injectable()
export class EventRouterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventRouterService.name);
  private pubSocket: zmq.Publisher;
  private pullSocket: zmq.Pull;
  private subscribers: Set<(event: InternalEvent) => void> = new Set();
  private isRunning = false;

  constructor(
    @Inject(forwardRef(() => RuleEngineService))
    private readonly ruleEngine: RuleEngineService,
    @Inject(forwardRef(() => EventStoreService))
    private readonly eventStore: EventStoreService,
    @Inject(forwardRef(() => SSEPublisherService))
    private readonly ssePublisher: SSEPublisherService,
    @Inject(forwardRef(() => RuleActionExecutorService))
    private readonly actionExecutor: RuleActionExecutorService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  private async initialize() {
    try {
      // Create PUB socket for distributing events
      this.pubSocket = new zmq.Publisher();
      await this.pubSocket.bind('ipc:///tmp/etienne-events-pub');
      this.logger.log('Event publisher socket bound to ipc:///tmp/etienne-events-pub');

      // Create PULL socket for receiving events
      this.pullSocket = new zmq.Pull();
      await this.pullSocket.bind('ipc:///tmp/etienne-events-pull');
      this.logger.log('Event pull socket bound to ipc:///tmp/etienne-events-pull');

      // Start listening for events
      this.isRunning = true;
      this.startListening();
    } catch (error) {
      this.logger.error('Failed to initialize event router', error);
      throw error;
    }
  }

  private async startListening() {
    this.logger.log('Starting event listener...');

    for await (const [msg] of this.pullSocket) {
      if (!this.isRunning) break;

      try {
        const event: InternalEvent = JSON.parse(msg.toString());
        this.logger.debug(`Received event: ${event.name} (${event.id})`);

        // Email events without projectName are evaluated against ALL projects
        if (event.group === 'Email' && !event.projectName) {
          const projectNames = await this.getAllProjectNames();
          for (const projectName of projectNames) {
            await this.evaluateEventForProject(event, projectName);
          }
        } else {
          const projectName = event.projectName || 'default';
          await this.evaluateEventForProject(event, projectName);
        }

        // Distribute to internal subscribers
        this.notifySubscribers(event);

        // Publish to ZeroMQ subscribers
        await this.pubSocket.send(JSON.stringify(event));
      } catch (error) {
        this.logger.error('Error processing event', error);
      }
    }
  }

  /**
   * Evaluate an event against rules for a specific project
   */
  private async evaluateEventForProject(event: InternalEvent, projectName: string): Promise<void> {
    await this.ruleEngine.loadRules(projectName);
    const executionResults = await this.ruleEngine.evaluateEvent(event, projectName);

    const triggeredResults = executionResults.filter((r) => r.success);
    if (triggeredResults.length > 0) {
      await this.eventStore.storeTriggeredEvent(projectName, event, executionResults);
      this.ssePublisher.publishRuleExecution(projectName, event, triggeredResults);

      for (const result of triggeredResults) {
        this.logger.log(`Looking up rule ${result.ruleId} for project ${projectName}`);
        const rule = this.ruleEngine.getRule(projectName, result.ruleId);
        this.logger.log(`Rule found: ${rule ? rule.name : 'null'}, action: ${rule?.action ? JSON.stringify(rule.action) : 'none'}`);
        if (rule && rule.action) {
          this.logger.log(`Executing action for rule "${rule.name}" (${rule.id})`);
          this.actionExecutor.executeAction(projectName, rule, event).catch((err) => {
            this.logger.error(`Failed to execute action for rule ${rule.id}:`, err);
          });
        } else {
          this.logger.warn(`No action defined for rule ${result.ruleId} or rule not found`);
        }
      }
    }
  }

  /**
   * Get all project names from the workspace directory
   */
  private async getAllProjectNames(): Promise<string[]> {
    try {
      const workspaceDir = path.join(process.cwd(), '..', 'workspace');
      const entries = await fs.readdir(workspaceDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      this.logger.error('Failed to read workspace directory for project names', error);
      return ['default'];
    }
  }

  /**
   * Publish an event to the router
   */
  async publishEvent(event: Omit<InternalEvent, 'id' | 'timestamp'>): Promise<InternalEvent> {
    const fullEvent: InternalEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    try {
      // Send to pull socket (which will then distribute)
      const pushSocket = new zmq.Push();
      await pushSocket.connect('ipc:///tmp/etienne-events-pull');
      await pushSocket.send(JSON.stringify(fullEvent));
      await pushSocket.close();

      this.logger.debug(`Published event: ${fullEvent.name} (${fullEvent.id})`);
      return fullEvent;
    } catch (error) {
      this.logger.error('Failed to publish event', error);
      throw error;
    }
  }

  /**
   * Subscribe to events with a callback function
   */
  subscribe(callback: (event: InternalEvent) => void): () => void {
    this.subscribers.add(callback);
    this.logger.debug(`New subscriber added. Total subscribers: ${this.subscribers.size}`);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
      this.logger.debug(`Subscriber removed. Total subscribers: ${this.subscribers.size}`);
    };
  }

  private notifySubscribers(event: InternalEvent) {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in subscriber callback', error);
      }
    }
  }

  private async shutdown() {
    this.logger.log('Shutting down event router...');
    this.isRunning = false;

    try {
      await this.pubSocket.close();
      await this.pullSocket.close();
      this.logger.log('Event router shut down successfully');
    } catch (error) {
      this.logger.error('Error shutting down event router', error);
    }
  }
}
