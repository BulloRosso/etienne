import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import * as path from 'path';
import { MqttClientService } from './mqtt-client.service';
import { MqttStorageService } from './mqtt-storage.service';
import { MqttConfig, MqttMessage } from './interfaces/mqtt-config.interface';
import { MqttBrokerConfigDto, MqttSubscriptionDto } from './dto/mqtt-config.dto';
import { EventRouterService } from '../event-handling/core/event-router.service';

@Injectable()
export class ExternalEventsService {
  private readonly logger = new Logger(ExternalEventsService.name);

  constructor(
    private readonly mqttClient: MqttClientService,
    private readonly storage: MqttStorageService,
    @Optional()
    @Inject(forwardRef(() => EventRouterService))
    private readonly eventRouter: EventRouterService | null,
  ) {}

  async getBrokerSetup(projectDir: string): Promise<MqttConfig> {
    return await this.storage.loadConfig(projectDir);
  }

  async updateBrokerSetup(
    projectDir: string,
    brokerConfig: MqttBrokerConfigDto,
  ): Promise<MqttConfig> {
    try {
      // Load existing config
      const config = await this.storage.loadConfig(projectDir);

      // Update broker settings
      config.broker = {
        host: brokerConfig.host,
        port: brokerConfig.port,
        username: brokerConfig.username,
        password: brokerConfig.password,
      };

      // Save updated config
      await this.storage.saveConfig(projectDir, config);

      // Reconnect with new broker settings
      if (this.mqttClient.isConnected(projectDir)) {
        await this.mqttClient.disconnect(projectDir);
      }
      await this.mqttClient.connect(projectDir, config.broker);

      // Resubscribe to existing topics
      if (config.subscriptions && config.subscriptions.length > 0) {
        for (const topic of config.subscriptions) {
          await this.mqttClient.subscribe(projectDir, topic);
        }
      }

      this.logger.log(`Broker setup updated for project ${projectDir}`);
      return config;
    } catch (error) {
      this.logger.error(`Failed to update broker setup for project ${projectDir}:`, error);
      throw error;
    }
  }

  async subscribe(projectDir: string, subscription: MqttSubscriptionDto): Promise<void> {
    try {
      // Load config
      const config = await this.storage.loadConfig(projectDir);

      // Ensure broker is connected
      if (!this.mqttClient.isConnected(projectDir)) {
        if (!config.broker) {
          config.broker = {
            host: 'broker.hivemq.com',
            port: 1883,
          };
        }
        await this.mqttClient.connect(projectDir, config.broker);
      }

      // Subscribe to topic
      await this.mqttClient.subscribe(projectDir, subscription.topic, subscription.qos || 0);

      // Update config with new subscription
      if (!config.subscriptions) {
        config.subscriptions = [];
      }
      if (!config.subscriptions.includes(subscription.topic)) {
        config.subscriptions.push(subscription.topic);
        await this.storage.saveConfig(projectDir, config);
      }

      this.logger.log(`Subscribed to topic ${subscription.topic} for project ${projectDir}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to topic ${subscription.topic}:`, error);
      throw error;
    }
  }

  async unsubscribe(projectDir: string, topic: string): Promise<void> {
    try {
      // Unsubscribe from topic
      if (this.mqttClient.isConnected(projectDir)) {
        await this.mqttClient.unsubscribe(projectDir, topic);
      }

      // Update config
      const config = await this.storage.loadConfig(projectDir);
      if (config.subscriptions) {
        config.subscriptions = config.subscriptions.filter((t) => t !== topic);
        await this.storage.saveConfig(projectDir, config);
      }

      this.logger.log(`Unsubscribed from topic ${topic} for project ${projectDir}`);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from topic ${topic}:`, error);
      throw error;
    }
  }

  async getMessages(projectDir: string, topic: string): Promise<MqttMessage[]> {
    return await this.storage.getMessages(projectDir, topic);
  }

  async injectMessage(
    projectDir: string,
    topic: string,
    body: unknown,
  ): Promise<MqttMessage> {
    const payloadStr = typeof body === 'string' ? body : JSON.stringify(body);
    const tsFromBody =
      body && typeof body === 'object' && typeof (body as { ts?: unknown }).ts === 'string'
        ? (body as { ts: string }).ts
        : undefined;

    const message: MqttMessage = {
      topic,
      payload: payloadStr,
      timestamp: tsFromBody ?? new Date().toISOString(),
      qos: 0,
      retain: false,
    };

    await this.storage.saveMessage(projectDir, topic, message);

    if (this.eventRouter) {
      const projectName = path.basename(projectDir);
      await this.eventRouter.publishEvent({
        name: 'MQTT Message Received',
        group: 'MQTT',
        source: 'External Events HTTP',
        topic,
        projectName,
        payload: {
          message: payloadStr,
          qos: 0,
          retain: false,
        },
      });
    }

    return message;
  }

  async ensureConnection(projectDir: string): Promise<void> {
    if (!this.mqttClient.isConnected(projectDir)) {
      const config = await this.storage.loadConfig(projectDir);
      if (!config.broker) {
        config.broker = {
          host: 'broker.hivemq.com',
          port: 1883,
        };
      }
      await this.mqttClient.connect(projectDir, config.broker);

      // Resubscribe to all topics from config
      if (config.subscriptions && config.subscriptions.length > 0) {
        for (const topic of config.subscriptions) {
          await this.mqttClient.subscribe(projectDir, topic);
        }
      }
    }
  }

  getConnectionStatus(projectDir: string): { connected: boolean; subscriptions: string[] } {
    return {
      connected: this.mqttClient.isConnected(projectDir),
      subscriptions: this.mqttClient.getSubscriptions(projectDir),
    };
  }
}
