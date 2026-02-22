import { Controller, Post, Get, Put, Delete, Body, Param, Res, Logger, HttpException, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { DecisionSupportService } from './decision-support.service';
import { ScenarioHydratorService } from './scenario-hydrator.service';
import { ScenarioEvaluatorService } from './scenario-evaluator.service';
import { DeriveDecisionDto, SaveGraphDto, UpdateActionStatusDto } from './dto/derive-decision.dto';
import { TestScenarioDto } from './dto/test-scenario.dto';
import { DecisionGraph } from './interfaces/decision-graph.interface';

@Controller('api/decision-support')
export class DecisionSupportController {
  private readonly logger = new Logger(DecisionSupportController.name);

  constructor(
    private readonly svc: DecisionSupportService,
    private readonly hydrator: ScenarioHydratorService,
    private readonly evaluator: ScenarioEvaluatorService,
  ) {}

  /**
   * Core endpoint: derive a decision suggestion from chat context
   */
  @Post('derive')
  @Roles('user')
  async derive(@Body() dto: DeriveDecisionDto) {
    try {
      const { suggestion, assistantReply } = await this.svc.deriveDecisionFromChat(
        dto.project,
        dto.chatHistory || [],
        dto.userMessage,
      );
      return { success: true, suggestion, assistantReply };
    } catch (error: any) {
      this.logger.error('Failed to derive decision', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Persist a confirmed decision graph into the ontology
   */
  @Post('graphs')
  @Roles('user')
  @UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
  async saveGraph(@Body() dto: SaveGraphDto) {
    try {
      const id = this.svc.generateId();
      const graph: DecisionGraph = {
        ...dto.graph,
        id,
        project: dto.project,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.svc.saveDecisionGraph(dto.project, graph);
      return { success: true, id };
    } catch (error: any) {
      this.logger.error('Failed to save decision graph', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * List all saved decision graphs in a project
   */
  @Get('graphs/:project')
  async listGraphs(@Param('project') project: string) {
    try {
      const graphs = await this.svc.listDecisionGraphs(project);
      return { success: true, graphs };
    } catch (error: any) {
      this.logger.error('Failed to list decision graphs', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Load a single decision graph with full conditions and actions
   */
  @Get('graphs/:project/:graphId')
  async loadGraph(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
  ) {
    try {
      const graph = await this.svc.loadDecisionGraph(project, graphId);
      if (!graph) {
        throw new HttpException(
          { success: false, message: 'Graph not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      return { success: true, graph };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to load decision graph', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Export a decision graph as ZeroMQ rule set
   */
  @Get('graphs/:project/:graphId/zmq-rules')
  async exportZmqRules(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
  ) {
    try {
      const rules = await this.svc.exportAsZmqRules(project, graphId);
      return { success: true, rules };
    } catch (error: any) {
      this.logger.error('Failed to export ZMQ rules', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Deploy a decision graph's rules to the event handling system
   */
  @Post('graphs/:project/:graphId/deploy-rules')
  @Roles('user')
  async deployRules(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
  ) {
    try {
      const result = await this.svc.deployAsRules(project, graphId);
      return { success: true, ...result };
    } catch (error: any) {
      this.logger.error('Failed to deploy rules', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update action status (pending → approved → executing → done)
   */
  @Post('graphs/:project/:graphId/actions/:actionId/status')
  @Roles('user')
  async updateActionStatus(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateActionStatusDto,
  ) {
    try {
      await this.svc.updateActionStatus(project, graphId, actionId, dto.status as any);
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to update action status', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete a saved decision graph
   */
  @Delete('graphs/:project/:graphId')
  @Roles('user')
  async deleteGraph(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
  ) {
    try {
      await this.svc.deleteDecisionGraph(project, graphId);
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to delete decision graph', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get ontology entities with their decision graph connections
   */
  @Get('ontology-entities/:project')
  async getOntologyEntities(@Param('project') project: string) {
    try {
      const result = await this.svc.getOntologyEntitiesWithGraphLinks(project);
      return { success: true, ...result };
    } catch (error: any) {
      this.logger.error('Failed to get ontology entities', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create a new ontology entity
   */
  @Post('ontology-entities/:project')
  @Roles('user')
  async createOntologyEntity(
    @Param('project') project: string,
    @Body() body: { id: string; type: string; properties?: Record<string, string> },
  ) {
    try {
      if (!body.id || !body.type) {
        throw new HttpException(
          { success: false, message: 'id and type are required' },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.svc.createOntologyEntity(project, body.id, body.type, body.properties || {});
      return { success: true, id: body.id };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to create ontology entity', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update an existing ontology entity
   */
  @Put('ontology-entities/:project/:entityId')
  @Roles('user')
  async updateOntologyEntity(
    @Param('project') project: string,
    @Param('entityId') entityId: string,
    @Body() body: { id?: string; type: string; properties?: Record<string, string> },
  ) {
    try {
      if (!body.type) {
        throw new HttpException(
          { success: false, message: 'type is required' },
          HttpStatus.BAD_REQUEST,
        );
      }
      const newId = body.id || entityId;
      await this.svc.updateOntologyEntity(project, entityId, newId, body.type, body.properties || {});
      return { success: true, id: newId };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to update ontology entity', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete an ontology entity
   */
  @Delete('ontology-entities/:project/:entityId')
  @Roles('user')
  async deleteOntologyEntity(
    @Param('project') project: string,
    @Param('entityId') entityId: string,
  ) {
    try {
      await this.svc.deleteOntologyEntity(project, entityId);
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to delete ontology entity', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get ontology graph data for visualization (types, instances, relationships)
   */
  @Get('ontology-graph/:project')
  async getOntologyGraph(@Param('project') project: string) {
    try {
      const result = await this.svc.getOntologyGraph(project);
      return { success: true, ...result };
    } catch (error: any) {
      this.logger.error('Failed to get ontology graph', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get ontology snapshot (for debugging / frontend display)
   */
  @Get('ontology-context/:project')
  async getOntologyContext(@Param('project') project: string) {
    try {
      const context = await this.svc.buildOntologyContext(project);
      return { success: true, context };
    } catch (error: any) {
      this.logger.error('Failed to get ontology context', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Hydrate a decision graph: fetch entity properties for the test scenario modal
   */
  @Get('graphs/:project/:graphId/hydrate')
  async hydrateScenario(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
  ) {
    try {
      const graph = await this.svc.loadDecisionGraph(project, graphId);
      if (!graph) {
        throw new HttpException(
          { success: false, message: 'Graph not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      const result = await this.hydrator.hydrate(project, graph);
      return { success: true, entities: result.entities };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to hydrate scenario', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Run a test scenario: stream SSE events for step-by-step condition/action evaluation
   */
  @Post('graphs/:project/:graphId/test-scenario')
  @Roles('user')
  async runTestScenario(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
    @Body() dto: TestScenarioDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const graph = await this.svc.loadDecisionGraph(project, graphId);
      if (!graph) {
        res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', detail: 'Graph not found' })}\n\n`);
        res.end();
        return;
      }
      await this.evaluator.runTestScenario(
        project,
        graph,
        dto.editedProperties || {},
        res,
      );
    } catch (error: any) {
      this.logger.error('Test scenario failed', error);
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', detail: error.message })}\n\n`);
        res.end();
      } catch {
        // response may already be closed
      }
    }
  }
}
