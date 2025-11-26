import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { MqttBrokerConfig, MqttMessage } from './interfaces/mqtt-config.interface';
import { MqttStorageService } from './mqtt-storage.service';
import { EventRouterService } from '../event-handling/core/event-router.service';

@Injectable()
export class MqttClientService implements OnModuleDestroy {
  private readonly logger = new Logger(MqttClientService.name);
  private clients = new Map<string, mqtt.MqttClient>();
  private projectSubscriptions = new Map<string, Set<string>>();
  private eventRouter: EventRouterService | null = null;

  constructor(
    private readonly storageService: MqttStorageService,
    @Inject(forwardRef(() => EventRouterService))
    eventRouterService?: EventRouterService,
  ) {
    this.eventRouter = eventRouterService || null;
  }

  async connect(projectDir: string, brokerConfig: MqttBrokerConfig): Promise<void> {
    const clientKey = this.getClientKey(projectDir);

    // Disconnect existing client if any
    if (this.clients.has(clientKey)) {
      await this.disconnect(projectDir);
    }

    return new Promise((resolve, reject) => {
      try {
        const brokerUrl = `mqtt://${brokerConfig.host}:${brokerConfig.port}`;
        this.logger.log(`Connecting to MQTT broker at ${brokerUrl} for project ${projectDir}`);

        const options: mqtt.IClientOptions = {
          reconnectPeriod: 5000,
          connectTimeout: 30000,
        };

        if (brokerConfig.username) {
          options.username = brokerConfig.username;
        }
        if (brokerConfig.password) {
          options.password = brokerConfig.password;
        }

        const client = mqtt.connect(brokerUrl, options);

        // Timeout handling
        const timeout = setTimeout(() => {
          if (!client.connected) {
            client.end();
            reject(new Error('Connection timeout'));
          }
        }, 30000);

        // Wait for actual connection
        client.once('connect', () => {
          clearTimeout(timeout);
          this.logger.log(`Connected to MQTT broker for project ${projectDir}`);
          this.clients.set(clientKey, client);
          this.projectSubscriptions.set(clientKey, new Set());
          resolve();
        });

        client.once('error', (error) => {
          clearTimeout(timeout);
          this.logger.error(`MQTT client error for project ${projectDir}:`, error);
          client.end();
          reject(error);
        });

        // Set up ongoing event handlers
        client.on('close', () => {
          this.logger.log(`MQTT client closed for project ${projectDir}`);
        });

        client.on('reconnect', () => {
          this.logger.log(`MQTT client reconnecting for project ${projectDir}`);
        });

        client.on('message', async (topic, payload, packet) => {
          await this.handleMessage(projectDir, topic, payload, packet);
        });
      } catch (error) {
        this.logger.error(`Failed to connect to MQTT broker for project ${projectDir}:`, error);
        reject(error);
      }
    });
  }

  async disconnect(projectDir: string): Promise<void> {
    const clientKey = this.getClientKey(projectDir);
    const client = this.clients.get(clientKey);

    if (client) {
      return new Promise((resolve) => {
        client.end(false, {}, () => {
          this.clients.delete(clientKey);
          this.projectSubscriptions.delete(clientKey);
          this.logger.log(`Disconnected from MQTT broker for project ${projectDir}`);
          resolve();
        });
      });
    }
  }

  async subscribe(projectDir: string, topic: string, qos: number = 0): Promise<void> {
    const clientKey = this.getClientKey(projectDir);
    const client = this.clients.get(clientKey);

    if (!client || !client.connected) {
      throw new Error('MQTT client is not connected');
    }

    return new Promise((resolve, reject) => {
      client.subscribe(topic, { qos: qos as mqtt.QoS }, (error) => {
        if (error) {
          this.logger.error(`Failed to subscribe to topic ${topic}:`, error);
          reject(error);
        } else {
          const subscriptions = this.projectSubscriptions.get(clientKey);
          if (subscriptions) {
            subscriptions.add(topic);
          }
          this.logger.log(`Subscribed to topic ${topic} for project ${projectDir}`);
          resolve();
        }
      });
    });
  }

  async unsubscribe(projectDir: string, topic: string): Promise<void> {
    const clientKey = this.getClientKey(projectDir);
    const client = this.clients.get(clientKey);

    if (!client || !client.connected) {
      throw new Error('MQTT client is not connected');
    }

    return new Promise((resolve, reject) => {
      client.unsubscribe(topic, {}, (error) => {
        if (error) {
          this.logger.error(`Failed to unsubscribe from topic ${topic}:`, error);
          reject(error);
        } else {
          const subscriptions = this.projectSubscriptions.get(clientKey);
          if (subscriptions) {
            subscriptions.delete(topic);
          }
          this.logger.log(`Unsubscribed from topic ${topic} for project ${projectDir}`);
          resolve();
        }
      });
    });
  }

  isConnected(projectDir: string): boolean {
    const clientKey = this.getClientKey(projectDir);
    const client = this.clients.get(clientKey);
    return client ? client.connected : false;
  }

  getSubscriptions(projectDir: string): string[] {
    const clientKey = this.getClientKey(projectDir);
    const subscriptions = this.projectSubscriptions.get(clientKey);
    return subscriptions ? Array.from(subscriptions) : [];
  }

  private async handleMessage(
    projectDir: string,
    topic: string,
    payload: Buffer,
    packet: mqtt.IPublishPacket,
  ): Promise<void> {
    try {
      const message: MqttMessage = {
        topic,
        payload: payload.toString(),
        timestamp: new Date().toISOString(),
        qos: packet.qos,
        retain: packet.retain,
      };

      this.logger.log(`Received message on topic ${topic} for project ${projectDir}`);
      await this.storageService.saveMessage(projectDir, topic, message);

      // Publish to event router
      if (this.eventRouter) {
        await this.eventRouter.publishEvent({
          name: 'MQTT Message Received',
          group: 'MQTT',
          source: 'MQTT Client',
          topic,
          payload: {
            message: payload.toString(),
            qos: packet.qos,
            retain: packet.retain,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to handle message for topic ${topic}:`, error);
    }
  }

  private getClientKey(projectDir: string): string {
    return projectDir;
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting all MQTT clients...');
    const disconnectPromises = Array.from(this.clients.keys()).map((projectDir) =>
      this.disconnect(projectDir),
    );
    await Promise.all(disconnectPromises);
  }
}
