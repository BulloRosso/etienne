import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as zmq from 'zeromq';
import { BusMessageBase, ServiceName } from './interfaces/bus-messages';
import { BusLoggerService } from './bus-logger.service';

type SubscriptionCallback = (topic: string, message: any) => void;

interface Subscription {
  topicPrefix: string;
  callback: SubscriptionCallback;
}

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private pubSocket!: zmq.Publisher;
  private subSocket!: zmq.Subscriber;
  private subscriptions: Subscription[] = [];
  private isRunning = false;

  constructor(private readonly busLogger: BusLoggerService) {}

  async onModuleInit() {
    try {
      // Create PUB socket — all components publish here
      this.pubSocket = new zmq.Publisher();
      await this.pubSocket.bind('ipc:///tmp/agent-bus-pub');
      this.logger.log('Agent bus PUB socket bound to ipc:///tmp/agent-bus-pub');

      // Create SUB socket — subscribers connect here
      this.subSocket = new zmq.Subscriber();
      await this.subSocket.connect('ipc:///tmp/agent-bus-pub');
      // Subscribe to all topics (prefix filter done in-process)
      this.subSocket.subscribe('');
      this.logger.log('Agent bus SUB socket connected');

      this.isRunning = true;
      this.startListening();
    } catch (error) {
      this.logger.error('Failed to initialize agent bus', error);
    }
  }

  async onModuleDestroy() {
    this.isRunning = false;
    try {
      if (this.pubSocket) await this.pubSocket.close();
      if (this.subSocket) await this.subSocket.close();
      this.logger.log('Agent bus shut down');
    } catch (error) {
      this.logger.error('Error shutting down agent bus', error);
    }
  }

  /**
   * Publish a message to a topic on the bus.
   * Also writes a JSONL trace entry via BusLoggerService.
   */
  async publish(topic: string, message: BusMessageBase & Record<string, any>): Promise<void> {
    try {
      // Infer service name from topic prefix for logging
      const service = this.inferService(topic);
      const action = this.inferAction(topic);

      // Write trace log entry
      await this.busLogger.log({
        correlationId: message.correlationId,
        service,
        topic,
        action,
        projectName: message.projectName,
        data: this.extractLogData(topic, message),
      });

      // Send as multi-part ZMQ message: [topic, payload]
      if (this.pubSocket) {
        await this.pubSocket.send([topic, JSON.stringify(message)]);
      }

      this.logger.debug(`Published to ${topic} (correlationId: ${message.correlationId})`);
    } catch (error) {
      this.logger.error(`Failed to publish to topic ${topic}`, error);
    }
  }

  /**
   * Subscribe to messages matching a topic prefix.
   * Returns an unsubscribe function.
   */
  subscribe(topicPrefix: string, callback: SubscriptionCallback): () => void {
    const subscription: Subscription = { topicPrefix, callback };
    this.subscriptions.push(subscription);
    this.logger.debug(`New subscription for topic prefix: "${topicPrefix}"`);

    return () => {
      const idx = this.subscriptions.indexOf(subscription);
      if (idx >= 0) {
        this.subscriptions.splice(idx, 1);
        this.logger.debug(`Removed subscription for topic prefix: "${topicPrefix}"`);
      }
    };
  }

  /**
   * Listen for incoming ZMQ messages and dispatch to subscribers
   */
  private async startListening() {
    this.logger.log('Agent bus listener started');

    try {
      for await (const [topicBuf, msgBuf] of this.subSocket) {
        if (!this.isRunning) break;

        try {
          const topic = topicBuf.toString();
          const message = JSON.parse(msgBuf.toString());

          // Dispatch to matching subscribers
          for (const sub of this.subscriptions) {
            if (topic.startsWith(sub.topicPrefix)) {
              try {
                sub.callback(topic, message);
              } catch (err: any) {
                this.logger.error(`Subscriber error for topic ${topic}: ${err.message}`);
              }
            }
          }
        } catch (error) {
          this.logger.error('Error processing bus message', error);
        }
      }
    } catch (error) {
      if (this.isRunning) {
        this.logger.error('Bus listener error', error);
      }
    }
  }

  /**
   * Infer service name from topic prefix
   */
  private inferService(topic: string): ServiceName {
    if (topic.startsWith('events/') || topic.startsWith('agent/intent')) return 'cms';
    if (topic.startsWith('dss/')) return 'dss';
    if (topic.startsWith('workflow/')) return 'swe';
    return 'cms';
  }

  /**
   * Infer log action from topic
   */
  private inferAction(topic: string): string {
    if (topic.startsWith('events/raw/')) return 'event_received';
    if (topic.startsWith('events/processed/')) return 'rules_evaluated';
    if (topic === 'agent/intent') return 'intent_published';
    if (topic === 'workflow/trigger') return 'workflow_triggered';
    if (topic.startsWith('workflow/status/')) return 'state_transitioned';
    if (topic === 'dss/query') return 'query_received';
    if (topic === 'dss/response') return 'query_responded';
    if (topic === 'dss/update') return 'entity_updated';
    return topic.replace(/\//g, '_');
  }

  /**
   * Extract relevant data for logging (truncated)
   */
  private extractLogData(topic: string, message: Record<string, any>): Record<string, any> {
    const data: Record<string, any> = {};

    if (message.event?.id) data.eventId = message.event.id;
    if (message.event?.group) data.group = message.event.group;
    if (message.event?.name) data.name = message.event.name;
    if (message.matchedRules) data.matchedRules = message.matchedRules;
    if (message.intentType) data.intentType = message.intentType;
    if (message.urgency) data.urgency = message.urgency;
    if (message.workflowId) data.workflowId = message.workflowId;
    if (message.workflowName) data.workflowName = message.workflowName;
    if (message.previousState) data.previousState = message.previousState;
    if (message.newState) data.newState = message.newState;
    if (message.queryType) data.queryType = message.queryType;
    if (message.entityId) data.entityId = message.entityId;
    if (message.updateType) data.updateType = message.updateType;
    if (message.isFinal !== undefined) data.isFinal = message.isFinal;

    return data;
  }
}
