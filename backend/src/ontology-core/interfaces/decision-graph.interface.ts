// ──────────────────────────────────────────────
// Decision Graph Types & Interfaces
// ──────────────────────────────────────────────

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'done';
export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';
export type NodeType = 'trigger' | 'condition' | 'action' | 'outcome';

export interface OntologyCondition {
  id: string;
  targetEntityType: string;
  targetEntityId?: string;
  property: string;
  operator: ConditionOperator;
  value?: string;
  description: string;
  zeromqEvent?: string;
}

export interface OntologyAction {
  id: string;
  name: string;
  description: string;
  targetEntityType: string;
  targetEntityId?: string;
  actionType: string;
  parameters: Record<string, string>;
  preconditions: string[];
  status: ActionStatus;
  zeromqEmit?: string;
  llmPromptTemplate?: string;
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
  condition?: string;
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
