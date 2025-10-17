import { Controller, Get, Post, Delete, Param, Body, Logger } from '@nestjs/common';
import { ExternalEventsService } from './external-events.service';
import { MqttBrokerConfigDto, MqttSubscriptionDto } from './dto/mqtt-config.dto';
import { safeRoot } from '../claude/utils/path.utils';

@Controller('api/external-events')
export class ExternalEventsController {
  private readonly logger = new Logger(ExternalEventsController.name);
  private readonly hostRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(private readonly service: ExternalEventsService) {}

  @Get(':project/broker-setup')
  async getBrokerSetup(@Param('project') projectname: string) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      return await this.service.getBrokerSetup(projectRoot);
    } catch (error) {
      this.logger.error(`Failed to get broker setup for project ${projectname}:`, error);
      throw error;
    }
  }

  @Post(':project/broker-setup')
  async updateBrokerSetup(
    @Param('project') projectname: string,
    @Body() brokerConfig: MqttBrokerConfigDto,
  ) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      return await this.service.updateBrokerSetup(projectRoot, brokerConfig);
    } catch (error) {
      this.logger.error(`Failed to update broker setup for project ${projectname}:`, error);
      throw error;
    }
  }

  @Post(':project/subscriptions')
  async subscribe(
    @Param('project') projectname: string,
    @Body() subscription: MqttSubscriptionDto,
  ) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      await this.service.subscribe(projectRoot, subscription);
      return { success: true, message: `Subscribed to topic ${subscription.topic}` };
    } catch (error) {
      this.logger.error(
        `Failed to subscribe to topic ${subscription.topic} for project ${projectname}:`,
        error,
      );
      throw error;
    }
  }

  @Delete(':project/subscriptions/:topic')
  async unsubscribe(@Param('project') projectname: string, @Param('topic') topic: string) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      // URL decode the topic parameter (topics may contain / which are URL encoded)
      const decodedTopic = decodeURIComponent(topic);
      await this.service.unsubscribe(projectRoot, decodedTopic);
      return { success: true, message: `Unsubscribed from topic ${decodedTopic}` };
    } catch (error) {
      this.logger.error(
        `Failed to unsubscribe from topic ${topic} for project ${projectname}:`,
        error,
      );
      throw error;
    }
  }

  @Get(':project/messages/:topic')
  async getMessages(@Param('project') projectname: string, @Param('topic') topic: string) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      const decodedTopic = decodeURIComponent(topic);
      return await this.service.getMessages(projectRoot, decodedTopic);
    } catch (error) {
      this.logger.error(
        `Failed to get messages for topic ${topic} in project ${projectname}:`,
        error,
      );
      throw error;
    }
  }

  @Get(':project/status')
  async getStatus(@Param('project') projectname: string) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      return this.service.getConnectionStatus(projectRoot);
    } catch (error) {
      this.logger.error(`Failed to get status for project ${projectname}:`, error);
      throw error;
    }
  }

  @Post(':project/connect')
  async connect(@Param('project') projectname: string) {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      await this.service.ensureConnection(projectRoot);
      return { success: true, message: 'Connected to MQTT broker' };
    } catch (error) {
      this.logger.error(`Failed to connect for project ${projectname}:`, error);
      throw error;
    }
  }
}
