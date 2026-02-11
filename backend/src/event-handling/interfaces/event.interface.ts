export interface InternalEvent {
  id: string;           // UUIDv4
  timestamp: string;    // ISO 8601 format
  name: string;         // e.g., "File Created", "MQTT Message Received"
  topic?: string;       // e.g., "/sensors/coffeemachine" (optional)
  group: string;        // e.g., "Filesystem", "MQTT", "Scheduling"
  source: string;       // e.g., "Claude Agent SDK", "CMS Watcher"
  payload: any;         // JSON data specific to event type
  projectName?: string; // Project this event belongs to (set by API endpoints)
}

export interface SimpleCondition {
  type: 'simple';
  event: {
    group?: string;
    name?: string;
    topic?: string;
    [key: string]: any;  // payload field matching
  };
}

export interface SemanticCondition {
  type: 'semantic';
  event: {
    group?: string;
    name?: string;
    payload: {
      similarity: {
        query: string;
        threshold?: number;  // Default 0.86
        tags?: string[];
      };
    };
  };
}

export interface KnowledgeGraphCondition {
  type: 'knowledge-graph';
  sparqlQuery: string;
}

export interface TemporalConstraint {
  time?: {
    after?: string;      // "HH:mm"
    before?: string;     // "HH:mm"
    dayOfWeek?: number[];  // 0-6 (Sunday-Saturday)
  };
}

export interface CompoundCondition {
  type: 'compound';
  operator: 'AND' | 'OR' | 'NOT';
  conditions: (SimpleCondition | SemanticCondition | TemporalConstraint)[];
  timeWindow?: number;  // milliseconds
}

export interface EmailSemanticCondition {
  type: 'email-semantic';
  criteria: string;  // Natural language criteria from user
  event?: {
    group?: string;  // Will always be 'Email'
  };
}

export type EventCondition =
  | SimpleCondition
  | SemanticCondition
  | KnowledgeGraphCondition
  | CompoundCondition
  | TemporalConstraint
  | EmailSemanticCondition;

export interface RuleAction {
  type: 'prompt';
  promptId: string;
  parameters?: any;
}

export interface EventRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: EventCondition;
  action: RuleAction;
  createdAt: string;
  updatedAt: string;
}

export interface RuleExecutionResult {
  ruleId: string;
  eventId: string;
  success: boolean;
  timestamp: string;
  error?: string;
}
