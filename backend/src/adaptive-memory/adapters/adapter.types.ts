/**
 * Adapter interfaces consumed by the Adaptive-Memory Picker, Packer, and
 * writeback tools. The real implementations wrap existing backend services
 * (WikiService, KnowledgeGraphService, RagService, MCP registry). The
 * in-memory fakes in `*.fake.ts` siblings exercise the Picker/Packer/Agent
 * end-to-end without those services running.
 *
 * Classification enforcement lives outside these interfaces:
 *   - Write paths receive a fully-validated EntryMeta (enforceWriteClassification
 *     ran at the writeback tool layer)
 *   - Read paths may take an optional `classificationFilter` and pass it down
 *     to the underlying store
 *
 * Adapters NEVER touch the PersonalityStore — Picker is the consumer and is
 * structurally forbidden from depending on Personality (firewall point 4).
 */

import type {
  Classification,
  KGEdge,
  KGEntity,
  Preference,
  Provenance,
  RAGFragment,
  WikiPage,
} from '../../memory/types';

// --- Wiki ----------------------------------------------------------------

export interface WikiAdapter {
  getPage(project: string, slug: string): Promise<WikiPage | null>;
  search(
    project: string,
    keywords: string[],
    opts?: { limit?: number },
  ): Promise<Array<{ slug: string; score: number }>>;
  /** Write through the wiki skill's scripts; classification + provenance are required. */
  putPage(
    project: string,
    page: {
      title: string;
      slug?: string;
      body: string;
      tags?: string[];
      sources: WikiPageSource[];
      classification: Classification;
      provenance: Provenance;
    },
  ): Promise<{ slug: string }>;
  delete(project: string, slug: string, reason?: string): Promise<{ noop: boolean }>;
}

export type WikiPageSource =
  | { kind: 'conversation'; turn: string; note?: string }
  | { kind: 'file'; path: string; lines?: string };

// --- Knowledge graph -----------------------------------------------------

export interface KGAdapter {
  /** Depth-N subgraph rooted at the given entity id. */
  subgraph(
    project: string,
    rootId: string,
    depth: number,
  ): Promise<{ entities: KGEntity[]; edges: KGEdge[] }>;

  assertEntity(project: string, entity: KGEntity): Promise<void>;
  assertEdge(project: string, edge: KGEdge): Promise<void>;

  /** Used by Ponderer maintenance to remove orphan entities. */
  prune(project: string, entityIds: string[]): Promise<{ removed: number }>;
}

// --- RAG -----------------------------------------------------------------

export interface RAGAdapter {
  query(
    project: string,
    text: string,
    opts: {
      topK: number;
      classificationFilter?: Classification[];
    },
  ): Promise<RAGFragment[]>;

  index(project: string, fragment: RAGFragment): Promise<void>;
  delete(project: string, id: string): Promise<{ removed: boolean }>;
}

// --- SOR -----------------------------------------------------------------

export interface SORConnector {
  name: string;
  description: string;
}

export interface SORAdapter {
  listAvailable(project: string): Promise<SORConnector[]>;
  /**
   * Read-only by PRD contract. Returns whatever the underlying MCP tool
   * surfaces; the Picker is responsible for shaping this into context.
   */
  read(
    project: string,
    connector: string,
    query: unknown,
  ): Promise<{ source: string; payload: unknown }>;
}

// --- Preferences (wraps existing MemoriesService) ------------------------

export interface PreferencesAdapter {
  matching(project: string, intent: string): Promise<Preference[]>;
  record(project: string, pref: Preference): Promise<void>;
}
