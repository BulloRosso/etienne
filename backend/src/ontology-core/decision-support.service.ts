import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { GraphBuilderService } from '../knowledge-graph/graph-builder.service';
import { LlmService } from '../llm/llm.service';
import { RuleEngineService } from '../event-handling/core/rule-engine.service';
import { EventRouterService } from '../event-handling/core/event-router.service';
import { EventRule } from '../event-handling/interfaces/event.interface';
import { randomUUID } from 'crypto';
import {
  ActionStatus,
  ConditionOperator,
  OntologyCondition,
  OntologyAction,
  DecisionGraph,
  DecisionNode,
  DecisionEdge,
  ChatTurn,
  DecisionSuggestion,
} from './interfaces/decision-graph.interface';

const DECISION_PREFIX = 'Decision';
const ACTION_PREFIX = 'Action';
const CONDITION_PREFIX = 'Condition';

@Injectable()
export class DecisionSupportService {
  private readonly logger = new Logger(DecisionSupportService.name);

  constructor(
    private readonly kg: KnowledgeGraphService,
    private readonly graphBuilder: GraphBuilderService,
    private readonly llm: LlmService,
    private readonly ruleEngine: RuleEngineService,
    private readonly eventRouter: EventRouterService,
  ) {}

  // ── Ontology Context Loader ──────────────────

  async buildOntologyContext(project: string): Promise<string> {
    const typeNames = ['Sensor', 'Compressor', 'Pipeline', 'Alert', 'WorkOrder', 'Person', 'Company', 'Product'];
    const lines: string[] = ['## Current Ontology State\n'];

    for (const type of typeNames) {
      try {
        const entities = await this.kg.findEntitiesByType(project, type);
        if (entities.length > 0) {
          lines.push(`### ${type} (${entities.length} instances)`);
          for (const e of entities.slice(0, 10)) {
            const props = Object.entries(e)
              .filter(([k]) => !['id', 'type'].includes(k))
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            lines.push(`  - ${e.id}${props ? ` [${props}]` : ''}`);
          }
        }
      } catch {
        // type not present in this project
      }
    }

    try {
      const graphs = await this.listDecisionGraphs(project);
      if (graphs.length > 0) {
        lines.push('\n### Existing Decision Graphs');
        for (const g of graphs) {
          lines.push(`  - "${g.title}" (${g.actions?.length ?? 0} actions, ${g.conditions?.length ?? 0} conditions)`);
        }
      }
    } catch { /* none yet */ }

    return lines.join('\n');
  }

  // ── Chat → Decision Suggestion ───────────────

  async deriveDecisionFromChat(
    project: string,
    chatHistory: ChatTurn[],
    userMessage: string,
  ): Promise<{ suggestion: DecisionSuggestion; assistantReply: string }> {
    const ontologyContext = await this.buildOntologyContext(project);

    const systemPrompt = `You are an Ontology Decision Support Agent.
Your role is to analyze conversations and extract structured, actionable decisions grounded in an RDF knowledge graph ontology.

${ontologyContext}

## Your Task
When the user describes a situation or problem, you must:
1. Identify relevant ontology entities from the graph above
2. Define CONDITIONS (observable states on entities) that trigger the decision
3. Define ACTIONS (operations on ontology entities) that address the situation
4. Build a DECISION GRAPH connecting triggers → conditions → actions → outcomes
5. Optionally associate ZeroMQ event names and LLM prompt templates

## Output Format
Respond with:
1. A natural language explanation of your reasoning (conversational, 2-3 sentences)
2. A JSON block wrapped in <decision_graph> tags with this exact structure:

<decision_graph>
{
  "title": "short title",
  "description": "what this decision graph does",
  "reasoning": "why these conditions and actions were chosen",
  "conditions": [
    {
      "id": "cond-1",
      "targetEntityType": "Sensor",
      "targetEntityId": "sensor-unit4-pressure",
      "property": "pressure",
      "operator": "gt",
      "value": "150",
      "description": "Pressure exceeds safe threshold",
      "zeromqEvent": "sensor.threshold.exceeded"
    }
  ],
  "actions": [
    {
      "id": "act-1",
      "name": "Emergency Shutdown",
      "description": "Shut down Unit 4 compressor",
      "targetEntityType": "Compressor",
      "targetEntityId": "compressor-unit4",
      "actionType": "EmergencyShutdown",
      "parameters": { "urgency": "immediate", "notifyOps": "true" },
      "preconditions": ["cond-1"],
      "status": "pending",
      "zeromqEmit": "compressor.shutdown.initiated",
      "llmPromptTemplate": "Assess the current state of {{targetEntityId}} and recommend immediate steps."
    }
  ],
  "nodes": [
    { "id": "n-trigger", "type": "trigger", "label": "Situation Detected", "description": "Initial trigger from sensor reading" },
    { "id": "n-cond-1", "type": "condition", "label": "Pressure > 150", "conditionId": "cond-1", "entityType": "Sensor" },
    { "id": "n-act-1", "type": "action", "label": "Emergency Shutdown", "actionId": "act-1", "entityType": "Compressor" },
    { "id": "n-outcome", "type": "outcome", "label": "System Safe", "description": "Compressor offline, pressure normalizing" }
  ],
  "edges": [
    { "id": "e1", "source": "n-trigger", "target": "n-cond-1" },
    { "id": "e2", "source": "n-cond-1", "target": "n-act-1", "label": "true", "condition": "true" },
    { "id": "e3", "source": "n-cond-1", "target": "n-outcome", "label": "false", "condition": "false" },
    { "id": "e4", "source": "n-act-1", "target": "n-outcome" }
  ]
}
</decision_graph>

Always ground entity types and IDs in the ontology context above. Use exact entity IDs where you can identify them.
Valid operators: eq, neq, gt, lt, gte, lte, contains, exists
Valid node types: trigger, condition, action, outcome
Valid action statuses: pending, approved, rejected, executing, done`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...chatHistory.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user' as const, content: userMessage },
    ];

    const fullText = await this.llm.generateTextWithMessages({
      tier: 'regular',
      messages,
      maxOutputTokens: 4096,
    });

    // Extract conversational reply (text before <decision_graph>)
    const assistantReply = fullText.split('<decision_graph>')[0].trim();

    // Extract and parse the structured graph
    const graphMatch = fullText.match(/<decision_graph>([\s\S]*?)<\/decision_graph>/);
    if (!graphMatch) {
      return {
        suggestion: this.emptySuggestion(),
        assistantReply: fullText,
      };
    }

    let suggestion: DecisionSuggestion;
    try {
      suggestion = JSON.parse(graphMatch[1].trim());
    } catch (e) {
      this.logger.error('Failed to parse decision graph JSON', e);
      return { suggestion: this.emptySuggestion(), assistantReply };
    }

    return { suggestion, assistantReply };
  }

  // ── Persist Decision Graph ────────────────────

  async saveDecisionGraph(project: string, graph: DecisionGraph): Promise<void> {
    const now = new Date().toISOString();

    // Root graph entity
    await this.kg.addEntity(project, {
      id: `${DECISION_PREFIX}/${graph.id}`,
      type: 'Document',
      properties: {
        title: graph.title,
        description: graph.description,
        graphType: 'DecisionGraph',
        createdAt: graph.createdAt || now,
        updatedAt: now,
        chatContextSummary: graph.chatContextSummary || '',
        nodesJson: JSON.stringify(graph.nodes),
        edgesJson: JSON.stringify(graph.edges),
      },
    });

    // Persist conditions
    for (const cond of graph.conditions) {
      await this.kg.addEntity(project, {
        id: `${CONDITION_PREFIX}/${cond.id}`,
        type: 'Document',
        properties: {
          graphType: 'Condition',
          targetEntityType: cond.targetEntityType,
          targetEntityId: cond.targetEntityId || '',
          property: cond.property,
          operator: cond.operator,
          value: cond.value || '',
          description: cond.description,
          zeromqEvent: cond.zeromqEvent || '',
        },
      });

      await this.kg.addRelationship(project, {
        subject: `${DECISION_PREFIX}/${graph.id}`,
        predicate: 'hasCondition',
        object: `${CONDITION_PREFIX}/${cond.id}`,
      });

      // Link condition to its target ontology entity (cross-graph linking)
      if (cond.targetEntityId) {
        await this.kg.addRelationship(project, {
          subject: `${CONDITION_PREFIX}/${cond.id}`,
          predicate: 'targetsEntity',
          object: cond.targetEntityId,
        });
      }
    }

    // Persist actions
    for (const action of graph.actions) {
      await this.kg.addEntity(project, {
        id: `${ACTION_PREFIX}/${action.id}`,
        type: 'Document',
        properties: {
          graphType: 'Action',
          name: action.name,
          description: action.description,
          targetEntityType: action.targetEntityType,
          targetEntityId: action.targetEntityId || '',
          actionType: action.actionType,
          parametersJson: JSON.stringify(action.parameters),
          preconditionsJson: JSON.stringify(action.preconditions),
          status: action.status,
          zeromqEmit: action.zeromqEmit || '',
          llmPromptTemplate: action.llmPromptTemplate || '',
        },
      });

      await this.kg.addRelationship(project, {
        subject: `${DECISION_PREFIX}/${graph.id}`,
        predicate: 'hasAction',
        object: `${ACTION_PREFIX}/${action.id}`,
      });

      for (const condId of action.preconditions) {
        await this.kg.addRelationship(project, {
          subject: `${ACTION_PREFIX}/${action.id}`,
          predicate: 'requiresCondition',
          object: `${CONDITION_PREFIX}/${condId}`,
        });
      }

      // Link action to its target ontology entity (cross-graph linking)
      if (action.targetEntityId) {
        await this.kg.addRelationship(project, {
          subject: `${ACTION_PREFIX}/${action.id}`,
          predicate: 'targetsEntity',
          object: action.targetEntityId,
        });
      }
    }

    this.logger.log(`Saved decision graph: ${graph.id} (${graph.conditions.length} conditions, ${graph.actions.length} actions)`);
  }

  // ── Load Decision Graph ───────────────────────

  async loadDecisionGraph(project: string, graphId: string): Promise<DecisionGraph | null> {
    const entity = await this.kg.findEntityById(project, `${DECISION_PREFIX}/${graphId}`);
    if (!entity) return null;

    const rels = await this.kg.findRelationshipsByEntity(project, `${DECISION_PREFIX}/${graphId}`);
    const conditions: OntologyCondition[] = [];
    const actions: OntologyAction[] = [];

    for (const rel of rels.filter(r => r.predicate === 'hasCondition' && r.direction === 'outgoing')) {
      const condEntity = await this.kg.findEntityById(project, rel.object);
      if (condEntity) {
        conditions.push({
          id: rel.object.replace(`${CONDITION_PREFIX}/`, ''),
          targetEntityType: condEntity.targetEntityType,
          targetEntityId: condEntity.targetEntityId || undefined,
          property: condEntity.property,
          operator: condEntity.operator as ConditionOperator,
          value: condEntity.value || undefined,
          description: condEntity.description,
          zeromqEvent: condEntity.zeromqEvent || undefined,
        });
      }
    }

    for (const rel of rels.filter(r => r.predicate === 'hasAction' && r.direction === 'outgoing')) {
      const actEntity = await this.kg.findEntityById(project, rel.object);
      if (actEntity) {
        actions.push({
          id: rel.object.replace(`${ACTION_PREFIX}/`, ''),
          name: actEntity.name,
          description: actEntity.description,
          targetEntityType: actEntity.targetEntityType,
          targetEntityId: actEntity.targetEntityId || undefined,
          actionType: actEntity.actionType,
          parameters: JSON.parse(actEntity.parametersJson || '{}'),
          preconditions: JSON.parse(actEntity.preconditionsJson || '[]'),
          status: actEntity.status as ActionStatus,
          zeromqEmit: actEntity.zeromqEmit || undefined,
          llmPromptTemplate: actEntity.llmPromptTemplate || undefined,
        });
      }
    }

    return {
      id: graphId,
      title: entity.title,
      description: entity.description,
      project,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      chatContextSummary: entity.chatContextSummary,
      nodes: JSON.parse(entity.nodesJson || '[]'),
      edges: JSON.parse(entity.edgesJson || '[]'),
      conditions,
      actions,
    };
  }

  // ── List Decision Graphs ──────────────────────

  async listDecisionGraphs(project: string): Promise<Partial<DecisionGraph>[]> {
    const entities = await this.kg.findEntitiesByType(project, 'Document');
    return entities
      .filter(e => e.graphType === 'DecisionGraph')
      .map(e => ({
        id: e.id.replace(`${DECISION_PREFIX}/`, ''),
        title: e.title,
        description: e.description,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));
  }

  // ── Delete Decision Graph ──────────────────────

  async deleteDecisionGraph(project: string, graphId: string): Promise<void> {
    const graph = await this.loadDecisionGraph(project, graphId);
    if (!graph) {
      this.logger.warn(`Decision graph ${graphId} not found for deletion`);
      return;
    }

    // Delete condition entities
    for (const cond of graph.conditions) {
      try {
        await this.kg.deleteEntity(project, `${CONDITION_PREFIX}/${cond.id}`);
      } catch { /* may already be deleted */ }
    }

    // Delete action entities
    for (const action of graph.actions) {
      try {
        await this.kg.deleteEntity(project, `${ACTION_PREFIX}/${action.id}`);
      } catch { /* may already be deleted */ }
    }

    // Delete the root graph entity
    try {
      await this.kg.deleteEntity(project, `${DECISION_PREFIX}/${graphId}`);
    } catch { /* may already be deleted */ }

    this.logger.log(`Deleted decision graph: ${graphId}`);
  }

  // ── Update Action Status ──────────────────────

  async updateActionStatus(
    project: string,
    graphId: string,
    actionId: string,
    status: ActionStatus,
  ): Promise<void> {
    const actionEntityId = `${ACTION_PREFIX}/${actionId}`;
    const existing = await this.kg.findEntityById(project, actionEntityId);
    if (!existing) {
      this.logger.warn(`Action entity ${actionEntityId} not found`);
      return;
    }

    // Update entity with new status
    await this.kg.addEntity(project, {
      id: actionEntityId,
      type: 'Document',
      properties: {
        ...existing,
        status,
      },
    });

    // Publish status change as ZMQ event
    await this.eventRouter.publishEvent({
      name: 'Action Status Changed',
      group: 'Ontology',
      source: 'DecisionSupportService',
      projectName: project,
      payload: { graphId, actionId, status },
    });

    this.logger.log(`Updated action ${actionId} status to ${status} in graph ${graphId}`);
  }

  // ── ZMQ Rule Export ───────────────────────────

  async exportAsZmqRules(project: string, graphId: string): Promise<any[]> {
    const graph = await this.loadDecisionGraph(project, graphId);
    if (!graph) return [];

    const rules = [];

    for (const action of graph.actions) {
      const preconditions = graph.conditions.filter(c =>
        action.preconditions.includes(c.id),
      );

      rules.push({
        ruleId: `rule-${graphId}-${action.id}`,
        name: action.name,
        description: action.description,
        trigger: preconditions.map(c => c.zeromqEvent).filter(Boolean),
        conditions: preconditions.map(c => ({
          entityType: c.targetEntityType,
          entityId: c.targetEntityId,
          property: c.property,
          operator: c.operator,
          value: c.value,
        })),
        onTrue: {
          emitEvent: action.zeromqEmit,
          executeLlmPrompt: action.llmPromptTemplate,
          updateEntityState: {
            type: action.targetEntityType,
            id: action.targetEntityId,
            actionType: action.actionType,
            parameters: action.parameters,
          },
        },
      });
    }

    return rules;
  }

  // ── Deploy Decision Graph as Event Rules ──────

  async deployAsRules(project: string, graphId: string): Promise<{ ruleCount: number; ruleIds: string[] }> {
    const graph = await this.loadDecisionGraph(project, graphId);
    if (!graph) {
      throw new Error(`Decision graph ${graphId} not found`);
    }

    const ruleIds: string[] = [];

    for (const action of graph.actions) {
      const preconditions = graph.conditions.filter(c =>
        action.preconditions.includes(c.id),
      );

      const triggerEvent = preconditions.find(c => c.zeromqEvent)?.zeromqEvent || action.name;

      const eventRule: EventRule = {
        id: randomUUID(),
        name: `[Ontology] ${action.name}`,
        enabled: action.status === 'approved',
        condition: {
          type: 'simple',
          event: {
            group: 'Ontology',
            name: triggerEvent,
          },
        },
        action: {
          type: 'prompt',
          promptId: '',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.ruleEngine.addRule(project, eventRule);
      ruleIds.push(eventRule.id);
    }

    await this.ruleEngine.saveRules(project);
    this.logger.log(`Deployed ${ruleIds.length} rules from decision graph ${graphId} to project ${project}`);

    return { ruleCount: ruleIds.length, ruleIds };
  }

  // ── Ontology Entity Map (with graph links) ───

  async getOntologyEntitiesWithGraphLinks(project: string): Promise<{
    entities: Array<{
      id: string;
      type: string;
      properties: Record<string, string>;
      referencedBy: Array<{ graphId: string; graphTitle: string; role: string; elementId: string }>;
    }>;
    missingEntities: Array<{
      id: string;
      type: string;
      referencedBy: Array<{ graphId: string; graphTitle: string; role: string; elementId: string }>;
    }>;
    graphs: Array<{ id: string; title: string }>;
  }> {
    const entityTypes = ['Sensor', 'Compressor', 'Pipeline', 'Alert', 'WorkOrder', 'Person', 'Company', 'Product'];
    const entities: Array<{
      id: string;
      type: string;
      properties: Record<string, string>;
      referencedBy: Array<{ graphId: string; graphTitle: string; role: string; elementId: string }>;
    }> = [];

    // Gather all ontology entities (non-decision-graph entities)
    for (const type of entityTypes) {
      try {
        const found = await this.kg.findEntitiesByType(project, type);
        for (const e of found) {
          const { id, type: eType, ...props } = e;
          entities.push({ id, type: eType || type, properties: props, referencedBy: [] });
        }
      } catch { /* type not present */ }
    }

    // Track missing entities referenced by decision graphs
    const missingMap = new Map<string, {
      id: string;
      type: string;
      referencedBy: Array<{ graphId: string; graphTitle: string; role: string; elementId: string }>;
    }>();

    // Load all decision graphs with their conditions/actions
    const graphs = await this.listDecisionGraphs(project);
    const graphSummaries = graphs.map(g => ({ id: g.id!, title: g.title || 'Untitled' }));

    for (const gSummary of graphSummaries) {
      const graph = await this.loadDecisionGraph(project, gSummary.id);
      if (!graph) continue;

      // Check which ontology entities are targeted by conditions
      for (const cond of graph.conditions) {
        if (cond.targetEntityId) {
          const ref = { graphId: gSummary.id, graphTitle: gSummary.title, role: 'condition', elementId: cond.id };
          const ent = entities.find(e => e.id === cond.targetEntityId);
          if (ent) {
            ent.referencedBy.push(ref);
          } else {
            // Entity referenced but doesn't exist
            const existing = missingMap.get(cond.targetEntityId);
            if (existing) {
              existing.referencedBy.push(ref);
            } else {
              missingMap.set(cond.targetEntityId, {
                id: cond.targetEntityId,
                type: cond.targetEntityType,
                referencedBy: [ref],
              });
            }
          }
        }
      }

      // Check which ontology entities are targeted by actions
      for (const action of graph.actions) {
        if (action.targetEntityId) {
          const ref = { graphId: gSummary.id, graphTitle: gSummary.title, role: 'action', elementId: action.id };
          const ent = entities.find(e => e.id === action.targetEntityId);
          if (ent) {
            ent.referencedBy.push(ref);
          } else {
            const existing = missingMap.get(action.targetEntityId);
            if (existing) {
              existing.referencedBy.push(ref);
            } else {
              missingMap.set(action.targetEntityId, {
                id: action.targetEntityId,
                type: action.targetEntityType,
                referencedBy: [ref],
              });
            }
          }
        }
      }
    }

    return { entities, missingEntities: Array.from(missingMap.values()), graphs: graphSummaries };
  }

  // ── Create Ontology Entity ──────────────────────

  async createOntologyEntity(
    project: string,
    id: string,
    type: string,
    properties: Record<string, string>,
  ): Promise<void> {
    await this.kg.addEntity(project, {
      id,
      type: type as any, // Quadstore accepts any type string via RDF triples
      properties,
    });
    this.logger.log(`Created ontology entity: ${id} (type=${type}) in project ${project}`);
  }

  // ── Ontology Graph (for visualization) ─────────

  async getOntologyGraph(project: string): Promise<{
    typeNodes: Array<{ type: string; count: number; instances: Array<{ id: string; properties: Record<string, string> }> }>;
    relationships: Array<{ source: string; target: string; predicate: string; sourceKind: string; targetKind: string }>;
    graphLinks: Array<{ entityId: string; entityType: string; graphId: string; graphTitle: string; role: string }>;
    graphs: Array<{ id: string; title: string }>;
  }> {
    const entityTypes = ['Sensor', 'Compressor', 'Pipeline', 'Alert', 'WorkOrder', 'Person', 'Company', 'Product'];
    const typeNodes: Array<{ type: string; count: number; instances: Array<{ id: string; properties: Record<string, string> }> }> = [];
    const allEntityIds: string[] = [];

    // 1. Gather entity types and their instances
    for (const type of entityTypes) {
      try {
        const found = await this.kg.findEntitiesByType(project, type);
        const instances = found.map(e => {
          const { id, type: _t, ...props } = e;
          allEntityIds.push(id);
          return { id, properties: props };
        });
        if (instances.length > 0) {
          typeNodes.push({ type, count: instances.length, instances });
        }
      } catch { /* type not present */ }
    }

    // 2. Gather inter-entity relationships
    const relationships: Array<{ source: string; target: string; predicate: string; sourceKind: string; targetKind: string }> = [];
    const seenRels = new Set<string>();

    for (const entityId of allEntityIds) {
      try {
        const rels = await this.kg.findRelationshipsByEntity(project, entityId);
        for (const rel of rels) {
          // Skip internal decision-graph predicates
          if (['hasCondition', 'hasAction', 'requiresCondition'].includes(rel.predicate)) continue;
          // Skip if the other end is a Decision/Condition/Action entity
          if (rel.predicate.startsWith('rel/')) continue;

          const key = `${rel.subject}|${rel.predicate}|${rel.object}`;
          if (seenRels.has(key)) continue;
          seenRels.add(key);

          const sourceIsInstance = allEntityIds.includes(rel.subject);
          const targetIsInstance = allEntityIds.includes(rel.object);

          relationships.push({
            source: rel.subject,
            target: rel.object,
            predicate: rel.predicate,
            sourceKind: sourceIsInstance ? 'instance' : 'other',
            targetKind: targetIsInstance ? 'instance' : 'other',
          });
        }
      } catch { /* skip */ }
    }

    // 3. Decision graph → entity links
    const graphLinks: Array<{ entityId: string; entityType: string; graphId: string; graphTitle: string; role: string }> = [];
    const graphs = await this.listDecisionGraphs(project);
    const graphSummaries = graphs.map(g => ({ id: g.id!, title: g.title || 'Untitled' }));

    for (const gSummary of graphSummaries) {
      const graph = await this.loadDecisionGraph(project, gSummary.id);
      if (!graph) continue;

      for (const cond of graph.conditions) {
        if (cond.targetEntityId) {
          graphLinks.push({
            entityId: cond.targetEntityId,
            entityType: cond.targetEntityType,
            graphId: gSummary.id,
            graphTitle: gSummary.title,
            role: 'condition',
          });
        }
      }

      for (const action of graph.actions) {
        if (action.targetEntityId) {
          graphLinks.push({
            entityId: action.targetEntityId,
            entityType: action.targetEntityType,
            graphId: gSummary.id,
            graphTitle: gSummary.title,
            role: 'action',
          });
        }
      }
    }

    return { typeNodes, relationships, graphLinks, graphs: graphSummaries };
  }

  // ── Helpers ───────────────────────────────────

  private emptySuggestion(): DecisionSuggestion {
    return {
      conditions: [],
      actions: [],
      nodes: [],
      edges: [],
      reasoning: '',
      title: 'Unnamed Decision',
      description: '',
    };
  }

  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
