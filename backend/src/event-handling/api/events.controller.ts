import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { CreateEventDto } from '../dto/create-event.dto';
import { EventRouterService } from '../core/event-router.service';
import { RuleEngineService } from '../core/rule-engine.service';
import { EventStoreService } from '../core/event-store.service';
import { SSEPublisherService } from '../publishers/sse-publisher.service';
import { randomUUID } from 'crypto';

@Controller('api/events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly eventRouter: EventRouterService,
    private readonly ruleEngine: RuleEngineService,
    private readonly eventStore: EventStoreService,
    private readonly ssePublisher: SSEPublisherService,
  ) {}

  /**
   * POST /api/events/:project/webhook - Receive webhook events
   * Accepts any JSON payload and creates an event with group 'Webhook'
   * The payload fields can be matched using payload.fieldName in rule conditions
   * e.g., payload.command matches {"command": "remove", "itemName": "file.txt"}
   *
   * NOTE: This route must be defined BEFORE the general :project route
   * to ensure proper route matching in NestJS
   */
  @Post(':project/webhook')
  async receiveWebhook(
    @Param('project') projectName: string,
    @Body() payload: any,
  ) {
    try {
      // Create event with Webhook group
      const event = await this.eventRouter.publishEvent({
        name: 'Webhook Received',
        group: 'Webhook',
        source: 'Webhook',
        topic: undefined,
        payload: payload,
        projectName: projectName,
      });

      this.logger.log(`Webhook received for project ${projectName}: ${event.id}`);

      // Evaluate against rules
      const executionResults = await this.ruleEngine.evaluateEvent(event, projectName);

      // If rules were triggered, store the event
      if (executionResults.some((r) => r.success)) {
        await this.eventStore.storeTriggeredEvent(projectName, event, executionResults);

        // Publish to SSE clients
        this.ssePublisher.publishRuleExecution(projectName, event, executionResults);
      } else {
        // Still publish event to SSE even if no rules triggered
        this.ssePublisher.publishEvent(projectName, event);
      }

      return {
        success: true,
        eventId: event.id,
        triggeredRules: executionResults.filter((r) => r.success).map((r) => r.ruleId),
      };
    } catch (error) {
      this.logger.error('Failed to process webhook', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /api/events/:project - Ingest an event
   */
  @Post(':project')
  async ingestEvent(
    @Param('project') projectName: string,
    @Body(ValidationPipe) dto: CreateEventDto,
  ) {
    try {
      // Publish event to router
      const event = await this.eventRouter.publishEvent({
        name: dto.name,
        group: dto.group,
        source: dto.source,
        topic: dto.topic,
        payload: dto.payload,
        projectName: projectName,
      });

      this.logger.log(`Event ingested: ${event.name} (${event.id}) for project ${projectName}`);

      // Evaluate against rules
      const executionResults = await this.ruleEngine.evaluateEvent(event, projectName);

      // If rules were triggered, store the event
      if (executionResults.some((r) => r.success)) {
        await this.eventStore.storeTriggeredEvent(projectName, event, executionResults);

        // Publish to SSE clients
        this.ssePublisher.publishRuleExecution(projectName, event, executionResults);
      } else {
        // Still publish event to SSE even if no rules triggered
        this.ssePublisher.publishEvent(projectName, event);
      }

      return {
        success: true,
        eventId: event.id,
        triggeredRules: executionResults.filter((r) => r.success).map((r) => r.ruleId),
      };
    } catch (error) {
      this.logger.error('Failed to ingest event', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /api/events/:project/search - Search events by text
   */
  @Get(':project/search')
  async searchEvents(
    @Param('project') projectName: string,
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const events = await this.eventStore.searchEvents(
        projectName,
        query,
        limit ? parseInt(String(limit)) : 10,
      );

      return {
        success: true,
        events,
      };
    } catch (error) {
      this.logger.error('Failed to search events', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /api/events/:project/range - Get events by date range
   */
  @Get(':project/range')
  async getEventsByRange(
    @Param('project') projectName: string,
    @Query('start') startDate: string,
    @Query('end') endDate: string,
  ) {
    try {
      const events = await this.eventStore.getEventsByDateRange(
        projectName,
        startDate,
        endDate,
      );

      return {
        success: true,
        count: events.length,
        events,
      };
    } catch (error) {
      this.logger.error('Failed to get events by range', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /api/events/:project/latest - Get latest events
   */
  @Get(':project/latest')
  async getLatestEvents(
    @Param('project') projectName: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const events = await this.eventStore.getLatestEvents(
        projectName,
        limit ? parseInt(String(limit)) : 50,
      );

      return {
        success: true,
        count: events.length,
        events,
      };
    } catch (error) {
      this.logger.error('Failed to get latest events', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /api/events/:project/stream - SSE endpoint for real-time events
   */
  @Get(':project/stream')
  streamEvents(@Param('project') projectName: string, @Res() response: Response) {
    // Set SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const clientId = randomUUID();

    // Register client
    this.ssePublisher.addClient(clientId, projectName, response);

    this.logger.log(
      `SSE stream started for project ${projectName}, client ${clientId}, total clients: ${this.ssePublisher.getClientCount(projectName)}`,
    );
  }
}
