import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import {
  DecisionGraph,
  HydratedEntity,
} from './interfaces/decision-graph.interface';

@Injectable()
export class ScenarioHydratorService {
  private readonly logger = new Logger(ScenarioHydratorService.name);

  constructor(private readonly kg: KnowledgeGraphService) {}

  /**
   * Hydrate a decision graph by fetching real entity data from the knowledge graph
   * for every entity referenced in conditions and actions.
   */
  async hydrate(
    project: string,
    graph: DecisionGraph,
  ): Promise<{ entities: HydratedEntity[]; graph: DecisionGraph }> {
    const entityMap = new Map<string, HydratedEntity>();

    // Collect unique entity IDs from conditions
    for (const cond of graph.conditions) {
      if (cond.targetEntityId) {
        if (!entityMap.has(cond.targetEntityId)) {
          entityMap.set(cond.targetEntityId, {
            entityId: cond.targetEntityId,
            entityType: cond.targetEntityType,
            properties: {},
            referencedBy: [],
          });
        }
        entityMap
          .get(cond.targetEntityId)!
          .referencedBy.push({ conditionId: cond.id });
      }
    }

    // Collect unique entity IDs from actions
    for (const action of graph.actions) {
      if (action.targetEntityId) {
        if (!entityMap.has(action.targetEntityId)) {
          entityMap.set(action.targetEntityId, {
            entityId: action.targetEntityId,
            entityType: action.targetEntityType,
            properties: {},
            referencedBy: [],
          });
        }
        entityMap
          .get(action.targetEntityId)!
          .referencedBy.push({ actionId: action.id });
      }
    }

    // Fetch each entity from the knowledge graph
    for (const [entityId, hydrated] of entityMap) {
      try {
        const entity = await this.kg.findEntityById(project, entityId);
        if (entity) {
          const { id, type, ...props } = entity;
          hydrated.properties = props;
        } else {
          this.logger.warn(
            `Entity ${entityId} not found in knowledge graph for project ${project}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to fetch entity ${entityId}: ${err.message}`,
        );
      }
    }

    return {
      entities: Array.from(entityMap.values()),
      graph,
    };
  }
}
