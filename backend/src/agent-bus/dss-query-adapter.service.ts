import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DecisionSupportService } from '../ontology-core/decision-support.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { EventBusService } from './event-bus.service';
import { EntityContext, DssQueryMessage, DssResponseMessage } from './interfaces/bus-messages';
import { DecisionGraph } from '../ontology-core/interfaces/decision-graph.interface';

@Injectable()
export class DssQueryAdapterService {
  private readonly logger = new Logger(DssQueryAdapterService.name);

  constructor(
    @Inject(forwardRef(() => DecisionSupportService))
    private readonly dss: DecisionSupportService,
    @Inject(forwardRef(() => KnowledgeGraphService))
    private readonly kg: KnowledgeGraphService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Query entity context: properties + relationships
   */
  async queryEntityContext(
    project: string,
    entityId: string,
    correlationId?: string,
  ): Promise<EntityContext | null> {
    const corrId = correlationId || randomUUID();

    // Publish query message for observability
    await this.eventBus.publish('dss/query', {
      correlationId: corrId,
      projectName: project,
      queryType: 'entity-context',
      entityId,
    } as DssQueryMessage);

    try {
      const entity = await this.kg.findEntityById(project, entityId);
      if (!entity) {
        await this.publishResponse(corrId, project, 'entity-context', false, null, 'Entity not found');
        return null;
      }

      const { id, type, ...properties } = entity;
      const rels = await this.kg.findRelationshipsByEntity(project, entityId);

      const context: EntityContext = {
        entityId: id,
        entityType: type,
        properties,
        relationships: rels.map(r => ({
          predicate: r.predicate,
          target: r.direction === 'outgoing' ? r.object : r.subject,
          direction: r.direction,
        })),
      };

      await this.publishResponse(corrId, project, 'entity-context', true, context);
      return context;
    } catch (error: any) {
      this.logger.error(`Failed to query entity context for ${entityId}`, error);
      await this.publishResponse(corrId, project, 'entity-context', false, null, error.message);
      return null;
    }
  }

  /**
   * Query a decision graph by ID
   */
  async queryDecisionGraph(
    project: string,
    graphId: string,
    correlationId?: string,
  ): Promise<DecisionGraph | null> {
    const corrId = correlationId || randomUUID();

    await this.eventBus.publish('dss/query', {
      correlationId: corrId,
      projectName: project,
      queryType: 'decision-graph',
      graphId,
    } as DssQueryMessage);

    try {
      const graph = await this.dss.loadDecisionGraph(project, graphId);
      await this.publishResponse(corrId, project, 'decision-graph', !!graph, graph);
      return graph;
    } catch (error: any) {
      this.logger.error(`Failed to query decision graph ${graphId}`, error);
      await this.publishResponse(corrId, project, 'decision-graph', false, null, error.message);
      return null;
    }
  }

  /**
   * Query the full ontology context (markdown summary)
   */
  async queryOntologyContext(
    project: string,
    correlationId?: string,
  ): Promise<string> {
    const corrId = correlationId || randomUUID();

    await this.eventBus.publish('dss/query', {
      correlationId: corrId,
      projectName: project,
      queryType: 'ontology-context',
    } as DssQueryMessage);

    try {
      const context = await this.dss.buildOntologyContext(project);
      await this.publishResponse(corrId, project, 'ontology-context', true, { context });
      return context;
    } catch (error: any) {
      this.logger.error(`Failed to query ontology context`, error);
      await this.publishResponse(corrId, project, 'ontology-context', false, null, error.message);
      return '';
    }
  }

  /**
   * Execute a SPARQL query
   */
  async executeSparql(
    project: string,
    query: string,
    correlationId?: string,
  ): Promise<any[]> {
    const corrId = correlationId || randomUUID();

    await this.eventBus.publish('dss/query', {
      correlationId: corrId,
      projectName: project,
      queryType: 'sparql',
      sparqlQuery: query,
    } as DssQueryMessage);

    try {
      const results = await this.kg.executeSparqlQuery(project, query);
      await this.publishResponse(corrId, project, 'sparql', true, results);
      return results;
    } catch (error: any) {
      this.logger.error(`Failed to execute SPARQL query`, error);
      await this.publishResponse(corrId, project, 'sparql', false, null, error.message);
      return [];
    }
  }

  /**
   * Publish a dss/response message for observability
   */
  private async publishResponse(
    correlationId: string,
    project: string,
    queryType: string,
    success: boolean,
    data: any,
    error?: string,
  ): Promise<void> {
    await this.eventBus.publish('dss/response', {
      correlationId,
      projectName: project,
      queryType,
      success,
      data,
      error,
    } as DssResponseMessage);
  }
}
