import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { MqttConfig, MqttMessage } from './interfaces/mqtt-config.interface';

@Injectable()
export class MqttStorageService {
  private readonly logger = new Logger(MqttStorageService.name);

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create directory ${dirPath}:`, error);
      throw error;
    }
  }

  async getConfigPath(projectDir: string): Promise<string> {
    const etienneDir = join(projectDir, '.etienne');
    await this.ensureDirectory(etienneDir);
    return join(etienneDir, 'mqtt-config.json');
  }

  async getEventsDir(projectDir: string): Promise<string> {
    const eventsDir = join(projectDir, 'external-events');
    await this.ensureDirectory(eventsDir);
    return eventsDir;
  }

  async loadConfig(projectDir: string): Promise<MqttConfig> {
    try {
      const configPath = await this.getConfigPath(projectDir);
      const data = await fs.readFile(configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, return default config
        return {
          broker: {
            host: 'broker.hivemq.com',
            port: 1883,
          },
          subscriptions: [],
        };
      }
      this.logger.error(`Failed to load config from ${projectDir}:`, error);
      throw error;
    }
  }

  async saveConfig(projectDir: string, config: MqttConfig): Promise<void> {
    try {
      const configPath = await this.getConfigPath(projectDir);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
      this.logger.log(`Config saved to ${configPath}`);
    } catch (error) {
      this.logger.error(`Failed to save config to ${projectDir}:`, error);
      throw error;
    }
  }

  async saveMessage(projectDir: string, topic: string, message: MqttMessage): Promise<void> {
    try {
      const eventsDir = await this.getEventsDir(projectDir);
      // Sanitize topic name for filename (replace / with -)
      const sanitizedTopic = topic.replace(/\//g, '-');
      const filename = `mqtt-${sanitizedTopic}.json`;
      const filePath = join(eventsDir, filename);

      let messages: MqttMessage[] = [];
      try {
        const data = await fs.readFile(filePath, 'utf8');
        messages = JSON.parse(data);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.error(`Failed to read existing messages from ${filePath}:`, error);
        }
      }

      messages.push(message);
      await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf8');
      this.logger.log(`Message saved to ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to save message for topic ${topic}:`, error);
      throw error;
    }
  }

  async getMessages(projectDir: string, topic: string): Promise<MqttMessage[]> {
    try {
      const eventsDir = await this.getEventsDir(projectDir);
      const sanitizedTopic = topic.replace(/\//g, '-');
      const filename = `mqtt-${sanitizedTopic}.json`;
      const filePath = join(eventsDir, filename);

      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      this.logger.error(`Failed to get messages for topic ${topic}:`, error);
      throw error;
    }
  }
}
