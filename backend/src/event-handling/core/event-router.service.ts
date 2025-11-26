import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import * as zmq from 'zeromq';
import { randomUUID } from 'crypto';
import { InternalEvent } from '../interfaces/event.interface';
import { RuleEngineService } from './rule-engine.service';
import { EventStoreService } from './event-store.service';
import { SSEPublisherService } from '../publishers/sse-publisher.service';

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

        // Extract project name from payload or default to 'default'
        const projectName = event.payload?.projectName || 'default';

        // Load rules for this project
        await this.ruleEngine.loadRules(projectName);

        // Evaluate event against rules
        const executionResults = await this.ruleEngine.evaluateEvent(event, projectName);

        // Store event if it triggered any rules
        if (executionResults.some((r) => r.success)) {
          await this.eventStore.storeTriggeredEvent(projectName, event, executionResults);

          // Publish via SSE with rule execution info
          this.ssePublisher.publishRuleExecution(projectName, event, executionResults.filter((r) => r.success));
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
