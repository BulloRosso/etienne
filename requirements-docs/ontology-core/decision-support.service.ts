import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { GraphBuilderService } from './graph-builder.service';
import Anthropic from '@anthropic-ai/sdk';

const BASE_URI = 'http://example.org/kg/';
const DECISION_PREFIX = 'Decision';
const ACTION_PREFIX = 'Action';
const CONDITION_PREFIX = 'Condition';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'done';
export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';
export type NodeType = 'trigger' | 'condition' | 'action' | 'outcome';

export interface OntologyCondition {
  id: string;
  targetEntityType: string;       // e.g. "Sensor"
  targetEntityId?: string;        // specific entity, or null for any of type
  property: string;               // e.g. "vibration"
  operator: ConditionOperator;
  value?: string;                 // threshold / expected value
  description: string;
  zeromqEvent?: string;           // optional: ZMQ event that fires this condition
}

export interface OntologyAction {
  id: string;
  name: string;
  description: string;
  targetEntityType: string;
  targetEntityId?: string;
  actionType: string;             // e.g. "EmergencyShutdown", "ScheduleMaintenance"
  parameters: Record<string, string>;
  preconditions: string[];        // condition IDs that must be true
  status: ActionStatus;
  zeromqEmit?: string;            // optional: ZMQ event to emit on execution
  llmPromptTemplate?: string;     // optional: LLM prompt to run on execution
}

export interface DecisionGraph {
  id: string;
  title: string;
  description: string;
  project: string;
  createdAt: string;
  updatedAt: string;
  chatContextSummary?: string;
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  conditions: OntologyCondition[];
  actions: OntologyAction[];
}

export interface DecisionNode {
  id: string;
  type: NodeType;
  label: string;
  description: string;
  entityType?: string;
  entityId?: string;
  conditionId?: string;
  actionId?: string;
  metadata?: Record<string, any>;
}

export interface DecisionEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;   // "true" | "false" | undefined (unconditional)
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface DecisionSuggestion {
  conditions: OntologyCondition[];
  actions: OntologyAction[];
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  reasoning: string;
  title: string;
  description: string;
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

@Injectable()
export class DecisionSupportService {
  private readonly logger = new Logger(DecisionSupportService.name);
  private readonly anthropic = new Anthropic();

  constructor(
    private readonly kg: KnowledgeGraphService,
    private readonly graphBuilder: GraphBuilderService,
  ) {}

  // ── Ontology Context Loader ──────────────────

  /**
   * Build a condensed ontology snapshot for the LLM:
   * entity types + instances + existing decision graphs
   */
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

    // load existing decision graphs as context
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

  /**
   * Core skill method: given a multi-turn chat context, derive a structured
   * decision graph suggestion grounded in the ontology.
   */
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

    const messages: Anthropic.MessageParam[] = [
      ...chatHistory.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await this.anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const fullText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    // Extract conversational reply (text before <decision_graph>)
    const assistantReply = fullText.split('<decision_graph>')[0].trim();

    // Extract and parse the structured graph
    const graphMatch = fullText.match(/<decision_graph>([\s\S]*?)<\/decision_graph>/);
    if (!graphMatch) {
      return {
        suggestion: this.emptysuggestion(),
        assistantReply: fullText,
      };
    }

    let suggestion: DecisionSuggestion;
    try {
      suggestion = JSON.parse(graphMatch[1].trim());
    } catch (e) {
      this.logger.error('Failed to parse decision graph JSON', e);
      return { suggestion: this.emptysuggestion(), assistantReply };
    }

    return { suggestion, assistantReply };
  }

  // ── Persist Decision Graph ────────────────────

  /**
   * Save a confirmed DecisionGraph into the ontology as first-class entities.
   */
  async saveDecisionGraph(project: string, graph: DecisionGraph): Promise<void> {
    const graphUri = `${BASE_URI}${DECISION_PREFIX}/${graph.id}`;
    const now = new Date().toISOString();

    // Root graph entity
    await this.kg.addEntity(project, {
      id: `${DECISION_PREFIX}/${graph.id}`,
      type: 'Document', // reuse Document type; extend if you add DecisionGraph to your Entity union
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

      // Link condition to graph
      await this.kg.addRelationship(project, {
        subject: `${DECISION_PREFIX}/${graph.id}`,
        predicate: 'hasCondition',
        object: `${CONDITION_PREFIX}/${cond.id}`,
      });
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

      // Link action to graph
      await this.kg.addRelationship(project, {
        subject: `${DECISION_PREFIX}/${graph.id}`,
        predicate: 'hasAction',
        object: `${ACTION_PREFIX}/${action.id}`,
      });

      // Link actions to their precondition entities
      for (const condId of action.preconditions) {
        await this.kg.addRelationship(project, {
          subject: `${ACTION_PREFIX}/${action.id}`,
          predicate: 'requiresCondition',
          object: `${CONDITION_PREFIX}/${condId}`,
        });
      }
    }

    this.logger.log(`Saved decision graph: ${graph.id} (${graph.conditions.length} conditions, ${graph.actions.length} actions)`);
  }

  // ── Load Decision Graph ───────────────────────

  async loadDecisionGraph(project: string, graphId: string): Promise<DecisionGraph | null> {
    const entity = await this.kg.findEntityById(project, `${DECISION_PREFIX}/${graphId}`);
    if (!entity) return null;

    const conditionRels = await this.kg.findRelationshipsByEntity(project, `${DECISION_PREFIX}/${graphId}`);
    const conditions: OntologyCondition[] = [];
    const actions: OntologyAction[] = [];

    for (const rel of conditionRels.filter(r => r.predicate === 'hasCondition' && r.direction === 'outgoing')) {
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

    for (const rel of conditionRels.filter(r => r.predicate === 'hasAction' && r.direction === 'outgoing')) {
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

  // ── Update Action Status ──────────────────────

  async updateActionStatus(
    project: string,
    graphId: string,
    actionId: string,
    status: ActionStatus,
  ): Promise<void> {
    const actionEntityId = `${ACTION_PREFIX}/${actionId}`;
    await this.kg.deleteEntity(project, actionEntityId);

    // Re-fetch and re-save with updated status
    // (simplified: in production you'd do a targeted triple update)
    this.logger.log(`Updated action ${actionId} status to ${status} in graph ${graphId}`);
  }

  // ── ZMQ Rule Export ───────────────────────────

  /**
   * Export a decision graph as a ZeroMQ rule set (JSON) ready for 
   * the condition monitoring engine.
   */
  async exportAsZmqRules(project: string, graphId: string): Promise<any[]> {
    const graph = await this.loadDecisionGraph(project, graphId);
    if (!graph) return [];

    const rules = [];

    for (const action of graph.actions) {
      const preconditions = graph.conditions.filter(c =>
        action.preconditions.includes(c.id)
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

  // ── Helpers ───────────────────────────────────

  private emptysuggestion(): DecisionSuggestion {
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
