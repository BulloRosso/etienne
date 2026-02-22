import { InternalEvent } from '../../event-handling/interfaces/event.interface';

// ============================================
// Base type — every bus message has these
// ============================================

export interface BusMessageBase {
  correlationId: string;   // UUIDv4 — born at raw event ingestion, propagated everywhere
  projectName: string;
}

// ============================================
// Topic: events/raw/*
// ============================================

export interface RawEventMessage extends BusMessageBase {
  event: InternalEvent;
}

// ============================================
// Topic: events/processed/*
// ============================================

export interface ProcessedEventMessage extends BusMessageBase {
  event: InternalEvent;
  matchedRules: string[];
  enrichedContext?: EntityContext;
}

// ============================================
// Topic: workflow/trigger
// ============================================

export interface WorkflowTriggerMessage extends BusMessageBase {
  workflowId: string;
  event: string;
  data?: any;
  source: string;
}

// ============================================
// Topic: workflow/status/*
// ============================================

export interface WorkflowStatusMessage extends BusMessageBase {
  workflowId: string;
  workflowName: string;
  previousState: string;
  newState: string;
  event: string;
  isFinal: boolean;
}

// ============================================
// Topic: dss/query
// ============================================

export interface DssQueryMessage extends BusMessageBase {
  queryType: 'entity-context' | 'decision-graph' | 'ontology-context' | 'sparql';
  entityId?: string;
  graphId?: string;
  sparqlQuery?: string;
}

// ============================================
// Topic: dss/response
// ============================================

export interface DssResponseMessage extends BusMessageBase {
  queryType: string;
  success: boolean;
  data: any;
  error?: string;
}

// ============================================
// Topic: dss/update
// ============================================

export interface DssUpdateMessage extends BusMessageBase {
  updateType: 'add-entity' | 'add-relationship' | 'update-entity' | 'update-action-status';
  entity?: { id: string; type: string; properties: Record<string, string> };
  relationship?: { subject: string; predicate: string; object: string };
  actionUpdate?: { graphId: string; actionId: string; status: string };
}

// ============================================
// Topic: agent/intent
// ============================================

export interface AgentIntentMessage extends BusMessageBase {
  intentType: string;
  entityId?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  context: Record<string, any>;
  sourceEvent: InternalEvent;
}

// ============================================
// Shared context type
// ============================================

export interface EntityContext {
  entityId: string;
  entityType: string;
  properties: Record<string, string>;
  relationships: Array<{ predicate: string; target: string; direction: string }>;
}

// ============================================
// Bus log entry type
// ============================================

export type ServiceName = 'cms' | 'dss' | 'swe';

export interface BusLogEntry {
  timestamp: string;           // ISO 8601
  correlationId: string;       // The chain ID
  service: ServiceName;        // Which service logged this
  topic: string;               // Bus topic (e.g., "events/raw/email", "agent/intent")
  action: string;              // What happened (e.g., "event_received", "rule_fired")
  projectName: string;
  data?: Record<string, any>;  // Service-specific details
}
