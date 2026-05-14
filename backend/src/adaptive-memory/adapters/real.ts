/**
 * Real adapter implementations wrapping the existing backend services.
 *
 * These are the production wires for Picker / Packer / writeback tools. Each
 * class implements the corresponding adapter interface (from `adapter.types`)
 * and delegates to the underlying NestJS service.
 *
 * Design notes:
 *   - We don't modify the underlying services' signatures (RagService,
 *     KnowledgeGraphService) because they have other callers across the
 *     codebase. Where the PRD asks for a method that doesn't exist yet
 *     (subgraph, prune, deleteChunk), we build it in the adapter using the
 *     primitives the service already exposes.
 *   - Classification flows through Chroma metadata for RAG and through RDF
 *     properties for the KG. Existing callers that don't set classification
 *     get a synthesised `'private'` default at the read boundary (matching
 *     WikiService.synthesiseProvenance — the "no data migration" stance).
 */

import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGraphService } from '../../knowledge-graph/knowledge-graph.service';
import { MemoriesService } from '../../memories/memories.service';
import { RagService } from '../../rag/rag.service';
import { WikiService } from '../../wiki/wiki.service';
import { McpRegistryService } from '../../mcp-registry/mcp-registry.service';
import type {
  Classification,
  KGEdge,
  KGEntity,
  Preference,
  Provenance,
  RAGFragment,
  WikiPage,
} from '../../memory/types';
import type {
  KGAdapter,
  PreferencesAdapter,
  RAGAdapter,
  SORAdapter,
  SORConnector,
  WikiAdapter,
  WikiPageSource,
} from './adapter.types';

// --- Wiki ----------------------------------------------------------------

@Injectable()
export class RealWikiAdapter implements WikiAdapter {
  constructor(private readonly wiki: WikiService) {}

  async getPage(project: string, slug: string): Promise<WikiPage | null> {
    return this.wiki.getPage(project, slug);
  }

  async search(
    project: string,
    keywords: string[],
    opts?: { limit?: number },
  ): Promise<Array<{ slug: string; score: number }>> {
    const hits = await this.wiki.search(project, keywords, opts);
    return hits.map((h) => ({ slug: h.slug, score: h.score }));
  }

  async putPage(
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
  ): Promise<{ slug: string }> {
    const r = await this.wiki.putPage(project, page);
    return { slug: r.slug };
  }

  async delete(project: string, slug: string, reason?: string): Promise<{ noop: boolean }> {
    const r = await this.wiki.deletePage(project, slug, { reason });
    return { noop: r.noop };
  }
}

// --- Knowledge Graph -----------------------------------------------------

@Injectable()
export class RealKGAdapter implements KGAdapter {
  private readonly logger = new Logger(RealKGAdapter.name);

  constructor(private readonly kg: KnowledgeGraphService) {}

  /**
   * BFS subgraph from `rootId` to `depth`. Uses `findEntityById` +
   * `findRelationshipsByEntity` rather than SPARQL CONSTRUCT — keeps the
   * adapter independent of the Quadstore query language so it works with
   * whatever SPARQL flavour the service exposes.
   */
  async subgraph(
    project: string,
    rootId: string,
    depth: number,
  ): Promise<{ entities: KGEntity[]; edges: KGEdge[] }> {
    const visitedEntityIds = new Set<string>();
    const visitedEntities: KGEntity[] = [];
    const visitedEdges: KGEdge[] = [];
    const seenEdgeKeys = new Set<string>();

    let frontier: string[] = [rootId];
    for (let d = 0; d <= depth; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        if (visitedEntityIds.has(id)) continue;
        visitedEntityIds.add(id);
        const ent = await this.fetchEntity(project, id);
        if (ent) visitedEntities.push(ent);
        if (d === depth) continue;
        const rels = await this.kg
          .findRelationshipsByEntity(project, id)
          .catch((err) => {
            this.logger.warn(
              `findRelationshipsByEntity(${id}) failed: ${err.message}`,
            );
            return [] as any[];
          });
        for (const r of rels ?? []) {
          const key = `${r.subject}|${r.predicate}|${r.object}`;
          if (seenEdgeKeys.has(key)) continue;
          seenEdgeKeys.add(key);
          visitedEdges.push(this.toKGEdge(r));
          const neighbour = r.subject === id ? r.object : r.subject;
          if (neighbour && !visitedEntityIds.has(neighbour)) next.push(neighbour);
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }
    return { entities: visitedEntities, edges: visitedEdges };
  }

  async assertEntity(project: string, entity: KGEntity): Promise<void> {
    // KnowledgeGraphService.addEntity takes a narrower Entity shape; we squash
    // PRD attributes + classification onto its `properties` map.
    await this.kg.addEntity(project, {
      id: entity.id,
      type: entity.type as any,
      properties: {
        ...stringifyProperties(entity.attributes),
        label: entity.label,
        classification: entity.classification,
        ...flattenProvenance(entity.provenance),
      },
    });
  }

  async assertEdge(project: string, edge: KGEdge): Promise<void> {
    await this.kg.addRelationship(project, {
      subject: edge.subject,
      predicate: edge.predicate,
      object: edge.object,
      properties: {
        edgeId: edge.id,
        classification: edge.classification,
        ...flattenProvenance(edge.provenance),
      },
    });
  }

  /**
   * Prune entities by id. Underlying service has `deleteEntity` per id; we
   * loop. Edges referencing pruned entities are removed by `deleteEntity`
   * itself.
   */
  async prune(project: string, entityIds: string[]): Promise<{ removed: number }> {
    let removed = 0;
    for (const id of entityIds) {
      try {
        await this.kg.deleteEntity(project, id);
        removed += 1;
      } catch (err: any) {
        this.logger.warn(`deleteEntity(${id}) failed: ${err.message}`);
      }
    }
    return { removed };
  }

  // --- helpers -----------------------------------------------------------

  private async fetchEntity(project: string, id: string): Promise<KGEntity | null> {
    try {
      const raw = await this.kg.findEntityById(project, id);
      if (!raw) return null;
      // KnowledgeGraphService.findEntityById returns properties FLAT at the
      // top level (id + type are extracted, every other predicate key is set
      // directly on the returned object). Treat the whole thing minus id/type
      // as the property bag.
      const { id: _id, type, ...rest } = raw as Record<string, unknown> & {
        id?: string;
        type?: string;
      };
      const props = rest as Record<string, string>;
      return {
        id: raw.id ?? id,
        type: String(type ?? 'Unknown'),
        label: String(props.label ?? id),
        attributes: stripReservedProperties(props),
        classification: isClassification(props.classification)
          ? props.classification
          : 'private',
        provenance: reconstructProvenance(props),
      };
    } catch (err: any) {
      this.logger.warn(`findEntityById(${id}) failed: ${err.message}`);
      return null;
    }
  }

  private toKGEdge(raw: any): KGEdge {
    const props = (raw.properties ?? {}) as Record<string, string>;
    return {
      id: String(props.edgeId ?? `${raw.subject}-${raw.predicate}-${raw.object}`),
      subject: String(raw.subject),
      predicate: String(raw.predicate),
      object: String(raw.object),
      classification: isClassification(props.classification)
        ? props.classification
        : 'private',
      provenance: reconstructProvenance(props),
      attributes: undefined as any,
    } as KGEdge;
  }
}

// --- RAG -----------------------------------------------------------------

@Injectable()
export class RealRAGAdapter implements RAGAdapter {
  private readonly logger = new Logger(RealRAGAdapter.name);

  constructor(private readonly rag: RagService) {}

  /**
   * Query with classification filter applied at the Chroma `where` layer.
   *
   * RagService doesn't yet accept a `where` argument on its public `indexSearch`,
   * but its private `queryCollection` does. Rather than reach into the private
   * method, we use `indexSearch` and post-filter on the returned metadata.
   * This is slightly less efficient but stays inside the public API; we can
   * push the filter down once we add a public overload.
   */
  async query(
    project: string,
    text: string,
    opts: { topK: number; classificationFilter?: Classification[] },
  ): Promise<RAGFragment[]> {
    const scope = `project_${project}`;
    let raw;
    try {
      raw = await this.rag.indexSearch(scope, text);
    } catch (err: any) {
      this.logger.warn(`RagService.indexSearch failed: ${err.message}`);
      return [];
    }
    const allow = opts.classificationFilter
      ? new Set<Classification>(opts.classificationFilter)
      : null;
    const fragments: RAGFragment[] = [];
    for (const r of raw.results ?? []) {
      const cls = isClassification(r.metadata?.classification)
        ? r.metadata.classification
        : 'private';
      if (allow && !allow.has(cls)) continue;
      fragments.push({
        id: r.id,
        text: r.content,
        embeddingId: r.id,
        tags: Array.isArray(r.metadata?.tags)
          ? (r.metadata.tags as string[])
          : typeof r.metadata?.tags === 'string'
          ? (r.metadata.tags as string).split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        classification: cls,
        provenance: reconstructProvenance(r.metadata),
      });
      if (fragments.length >= opts.topK) break;
    }
    return fragments;
  }

  async index(project: string, fragment: RAGFragment): Promise<void> {
    const scope = `project_${project}`;
    // RagService.indexText doesn't accept metadata; on this real adapter we
    // can only attach what its API allows. Classification ends up in the
    // automatically-attached metadata via the chunk metadata path — but for
    // explicit classification metadata we'd need a public `indexTextWith
    // Metadata` overload. We document this limitation and return; the
    // dreaming pipeline today doesn't write through this path.
    try {
      await this.rag.indexText(scope, fragment.text);
    } catch (err: any) {
      this.logger.warn(`RagService.indexText failed: ${err.message}`);
      throw err;
    }
    // TODO(adaptive-memory): once RagService exposes a metadata overload,
    // attach { classification, provenance, tags } so the firewall filter at
    // query time has the data it needs.
  }

  async delete(project: string, id: string): Promise<{ removed: boolean }> {
    // RagService has no public deleteChunk; future work is to add one.
    this.logger.warn(
      `RealRAGAdapter.delete(${id}) is a no-op; RagService.deleteChunk does not exist yet`,
    );
    return { removed: false };
  }
}

// --- SOR -----------------------------------------------------------------

@Injectable()
export class RealSORAdapter implements SORAdapter {
  private readonly logger = new Logger(RealSORAdapter.name);

  constructor(private readonly registry: McpRegistryService) {}

  async listAvailable(_project: string): Promise<SORConnector[]> {
    // McpRegistryService exposes registered servers; surface them as SOR connectors.
    // Each MCP registry implementation is slightly different — be defensive.
    const registry = this.registry as unknown as {
      list?: () => Promise<Array<{ name: string; description?: string }>>;
      getAll?: () => Promise<Array<{ name: string; description?: string }>>;
    };
    const list =
      (await registry.list?.()) ?? (await registry.getAll?.()) ?? [];
    return list.map((s) => ({
      name: s.name,
      description: s.description ?? '',
    }));
  }

  async read(
    _project: string,
    connector: string,
    _query: unknown,
  ): Promise<{ source: string; payload: unknown }> {
    // Real SOR reads through the MCP transport in the existing codebase; the
    // exact entry point varies by tool. For now the real adapter is a stub
    // that surfaces the connector name only — calling code should not depend
    // on payload until we wire the MCP request path.
    this.logger.warn(
      `RealSORAdapter.read(${connector}) is a stub; MCP request transport not yet wired`,
    );
    return { source: connector, payload: null };
  }
}

// --- Preferences ---------------------------------------------------------

@Injectable()
export class RealPreferencesAdapter implements PreferencesAdapter {
  private readonly logger = new Logger(RealPreferencesAdapter.name);

  constructor(private readonly memories: MemoriesService) {}

  async matching(_project: string, intent: string): Promise<Preference[]> {
    // MemoriesService.searchMemories takes a project root + query. Surface
    // hits as Preferences with default `'user'` scope; the real Preferences
    // overlay lives on top of memories — for first iteration this is enough
    // for the Picker to pull contextually-relevant facts.
    const memSvc = this.memories as unknown as {
      searchMemories?: (project: string, query: string, limit?: number) => Promise<any[]>;
      search?: (project: string, query: string, limit?: number) => Promise<any[]>;
    };
    const hits =
      (await memSvc.searchMemories?.(_project, intent, 10).catch(() => [])) ??
      (await memSvc.search?.(_project, intent, 10).catch(() => [])) ??
      [];
    return hits.map((h: any, i: number) => ({
      id: String(h.id ?? `memory-${i}`),
      classification: isClassification(h.classification) ? h.classification : 'private',
      provenance: reconstructProvenance(h),
      scope: (h.scope === 'collaborator' ? 'collaborator' : 'user') as 'user' | 'collaborator',
      subject: h.subject,
      statement: String(h.memory ?? h.statement ?? h.content ?? ''),
      confidence: typeof h.confidence === 'number' ? h.confidence : 0.5,
    }));
  }

  async record(_project: string, _pref: Preference): Promise<void> {
    // MemoriesService writes through its own extraction pipeline; the
    // adaptive-memory direct write surface (preference_record) is not yet
    // wired to MemoriesService. Future work: thread through an `upsert`.
    this.logger.warn(
      `RealPreferencesAdapter.record is a stub; MemoriesService upsert path not yet wired`,
    );
  }
}

// --- module-private helpers ----------------------------------------------

function isClassification(v: unknown): v is Classification {
  return v === 'public' || v === 'private' || v === 'secret';
}

function stringifyProperties(attrs: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

function flattenProvenance(p: Provenance): Record<string, string> {
  const out: Record<string, string> = {
    'prov:createdBy': p.createdBy,
    'prov:createdAt': p.createdAt,
    'prov:updatedAt': p.updatedAt,
  };
  if (p.sourceSessions.length) out['prov:sourceSessions'] = p.sourceSessions.join(',');
  if (p.sourceEntries.length) out['prov:sourceEntries'] = p.sourceEntries.join(',');
  if (p.inferenceTag) out['prov:inferenceTag'] = p.inferenceTag;
  return out;
}

function reconstructProvenance(props: Record<string, any> = {}): Provenance {
  const sourceSessions = typeof props['prov:sourceSessions'] === 'string'
    ? (props['prov:sourceSessions'] as string).split(',').filter(Boolean)
    : Array.isArray(props.sourceSessions) ? props.sourceSessions.map(String) : [];
  const sourceEntries = typeof props['prov:sourceEntries'] === 'string'
    ? (props['prov:sourceEntries'] as string).split(',').filter(Boolean)
    : Array.isArray(props.sourceEntries) ? props.sourceEntries.map(String) : [];
  const createdBy =
    props['prov:createdBy'] === 'agent' || props['prov:createdBy'] === 'ponderer' || props['prov:createdBy'] === 'user'
      ? props['prov:createdBy']
      : 'user';
  const now = new Date(0).toISOString();
  return {
    sourceSessions,
    sourceEntries,
    createdBy,
    createdAt: String(props['prov:createdAt'] ?? props.createdAt ?? now),
    updatedAt: String(props['prov:updatedAt'] ?? props.updatedAt ?? now),
    inferenceTag: typeof props['prov:inferenceTag'] === 'string'
      ? props['prov:inferenceTag']
      : undefined,
  };
}

const RESERVED_PROP_KEYS = new Set([
  'label',
  'classification',
  'prov:createdBy',
  'prov:createdAt',
  'prov:updatedAt',
  'prov:sourceSessions',
  'prov:sourceEntries',
  'prov:inferenceTag',
]);

function stripReservedProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (RESERVED_PROP_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}
