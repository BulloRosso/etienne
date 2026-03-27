import { Controller, Post, Get, Put, Delete, Body, Param, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DecisionSupportService } from './decision-support.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';

/**
 * Public (unauthenticated) ontology API for use by agent skills running
 * inside Claude Code, where no JWT token is available in the environment.
 *
 * Scoped to /api/public/ontology — keep this surface minimal.
 */
@Controller('api/public/ontology')
export class OntologyPublicController {
  private readonly logger = new Logger(OntologyPublicController.name);

  constructor(
    private readonly svc: DecisionSupportService,
    private readonly kg: KnowledgeGraphService,
  ) {}

  /** Get ontology snapshot as markdown */
  @Public()
  @Get('context/:project')
  async getContext(@Param('project') project: string) {
    try {
      const context = await this.svc.buildOntologyContext(project);
      return { success: true, context };
    } catch (error: any) {
      this.logger.error('Failed to get ontology context', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** List all entity types */
  @Public()
  @Get('types/:project')
  async getTypes(@Param('project') project: string) {
    try {
      const types = await this.svc.getOntologyTypes(project);
      return { success: true, types };
    } catch (error: any) {
      this.logger.error('Failed to get ontology types', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** List entities with properties */
  @Public()
  @Get('entities/:project')
  async getEntities(@Param('project') project: string) {
    try {
      const result = await this.svc.getOntologyEntitiesWithGraphLinks(project);
      return { success: true, ...result };
    } catch (error: any) {
      this.logger.error('Failed to get ontology entities', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Get ontology graph for visualization (types, instances, relationships) */
  @Public()
  @Get('graph/:project')
  async getGraph(@Param('project') project: string) {
    try {
      const result = await this.svc.getOntologyGraph(project);
      return { success: true, ...result };
    } catch (error: any) {
      this.logger.error('Failed to get ontology graph', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Create an entity */
  @Public()
  @Post('entities/:project')
  async createEntity(
    @Param('project') project: string,
    @Body() body: { id: string; type: string; properties?: Record<string, string> },
  ) {
    try {
      if (!body.id || !body.type) {
        throw new HttpException({ success: false, message: 'id and type are required' }, HttpStatus.BAD_REQUEST);
      }
      await this.svc.createOntologyEntity(project, body.id, body.type, body.properties || {});
      return { success: true, id: body.id };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to create ontology entity', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Update an entity */
  @Public()
  @Put('entities/:project/:entityId')
  async updateEntity(
    @Param('project') project: string,
    @Param('entityId') entityId: string,
    @Body() body: { id?: string; type: string; properties?: Record<string, string> },
  ) {
    try {
      if (!body.type) {
        throw new HttpException({ success: false, message: 'type is required' }, HttpStatus.BAD_REQUEST);
      }
      const newId = body.id || entityId;
      await this.svc.updateOntologyEntity(project, entityId, newId, body.type, body.properties || {});
      return { success: true, id: newId };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to update ontology entity', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Delete an entity */
  @Public()
  @Delete('entities/:project/:entityId')
  async deleteEntity(
    @Param('project') project: string,
    @Param('entityId') entityId: string,
  ) {
    try {
      await this.svc.deleteOntologyEntity(project, entityId);
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to delete ontology entity', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Bulk-create entities and relationships (onboarding) */
  @Public()
  @Post('bootstrap/:project')
  async bootstrap(
    @Param('project') project: string,
    @Body() body: {
      entities: Array<{ id: string; type: string; properties?: Record<string, string> }>;
      relationships: Array<{ subject: string; predicate: string; object: string }>;
    },
  ) {
    try {
      const entities = (body.entities || []).map(e => ({ ...e, properties: e.properties || {} }));
      const relationships = body.relationships || [];
      const result = await this.svc.bootstrapOntology(project, entities, relationships);
      return { success: true, ...result };
    } catch (error: any) {
      this.logger.error('Failed to bootstrap ontology', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Get relationships for an entity */
  @Public()
  @Get('relations/:project/:entityId')
  async getRelations(
    @Param('project') project: string,
    @Param('entityId') entityId: string,
  ) {
    try {
      const result = await this.svc.getEntityRelations(project, entityId);
      return { success: true, ...result };
    } catch (error: any) {
      this.logger.error('Failed to get entity relations', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Create a relationship */
  @Public()
  @Post('relationships/:project')
  async createRelationship(
    @Param('project') project: string,
    @Body() body: { subject: string; predicate: string; object: string },
  ) {
    try {
      if (!body.subject || !body.predicate || !body.object) {
        throw new HttpException(
          { success: false, message: 'subject, predicate, and object are required' },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.kg.addRelationship(project, body);
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to create relationship', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
