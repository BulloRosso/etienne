import { Injectable, Logger } from '@nestjs/common';
import { TtGraphClient, QuadOut } from './tt-graph.client';
import { GRAPH_AUDIT, GRAPH_TENDER, P, RDF_TYPE } from './tt-vocab';

/**
 * Whole-graph snapshot with in-memory join indexes — the analytical query layer
 * (deviation report, compliance matrix, dashboards) in place of SPARQL (plan §Storage).
 * A tender graph is low tens of thousands of quads (spec §11.6), so a full fetch
 * plus TypeScript joins is cheap; the snapshot is cached briefly and invalidated
 * on every write.
 */
export class TtSnapshot {
  /** subject IRI → parsed tt:record (highest _rev wins) */
  readonly records = new Map<string, any>();
  /** rdf:type class IRI → subject IRIs */
  readonly byType = new Map<string, string[]>();
  /** subject IRI → quads */
  readonly bySubject = new Map<string, QuadOut[]>();
  /** predicate IRI → quads */
  readonly byPredicate = new Map<string, QuadOut[]>();

  constructor(quads: QuadOut[]) {
    const revs = new Map<string, number>();
    for (const quad of quads) {
      const subject = quad.subject.value;
      const predicate = quad.predicate.value;

      let subjectQuads = this.bySubject.get(subject);
      if (!subjectQuads) this.bySubject.set(subject, (subjectQuads = []));
      subjectQuads.push(quad);

      let predicateQuads = this.byPredicate.get(predicate);
      if (!predicateQuads) this.byPredicate.set(predicate, (predicateQuads = []));
      predicateQuads.push(quad);

      if (predicate === RDF_TYPE) {
        let subjects = this.byType.get(quad.object.value);
        if (!subjects) this.byType.set(quad.object.value, (subjects = []));
        subjects.push(subject);
      } else if (predicate === P.record) {
        try {
          const record = JSON.parse(quad.object.value);
          const rev = record._rev ?? 0;
          if (rev >= (revs.get(subject) ?? -1)) {
            revs.set(subject, rev);
            delete record._rev;
            this.records.set(subject, record);
          }
        } catch {
          // ignore unparseable record literals
        }
      }
    }
  }

  recordsOfType<T>(klass: string): T[] {
    return (this.byType.get(klass) ?? [])
      .map((iri) => this.records.get(iri))
      .filter(Boolean) as T[];
  }

  record<T>(iri: string): T | null {
    return (this.records.get(iri) as T) ?? null;
  }

  /** Objects of (subject, predicate) */
  objects(subject: string, predicate: string): string[] {
    return (this.bySubject.get(subject) ?? [])
      .filter((quad) => quad.predicate.value === predicate)
      .map((quad) => quad.object.value);
  }

  /** Subjects with (predicate, object) */
  subjects(predicate: string, object: string): string[] {
    return (this.byPredicate.get(predicate) ?? [])
      .filter((quad) => quad.object.value === object)
      .map((quad) => quad.subject.value);
  }
}

interface CacheEntry {
  snapshot: TtSnapshot;
  loadedAt: number;
}

@Injectable()
export class TtSnapshotService {
  private readonly logger = new Logger(TtSnapshotService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5000;

  constructor(private readonly graph: TtGraphClient) {}

  /** Snapshot of one named graph (default: the tender graph). */
  async get(project: string, graphName: string = GRAPH_TENDER): Promise<TtSnapshot> {
    const key = `${project}::${graphName}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.loadedAt < this.ttlMs) {
      return cached.snapshot;
    }
    const quads = await this.graph.match(project, { graph: graphName });
    const snapshot = new TtSnapshot(quads);
    this.cache.set(key, { snapshot, loadedAt: Date.now() });
    return snapshot;
  }

  /** Snapshot of tender + audit graphs combined (as-of reports need StatusChange history). */
  async getWithAudit(project: string): Promise<TtSnapshot> {
    const key = `${project}::tender+audit`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.loadedAt < this.ttlMs) {
      return cached.snapshot;
    }
    const [tenderQuads, auditQuads] = await Promise.all([
      this.graph.match(project, { graph: GRAPH_TENDER }),
      this.graph.match(project, { graph: GRAPH_AUDIT }),
    ]);
    const snapshot = new TtSnapshot([...tenderQuads, ...auditQuads]);
    this.cache.set(key, { snapshot, loadedAt: Date.now() });
    return snapshot;
  }

  /** Call after every write. */
  invalidate(project: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${project}::`)) this.cache.delete(key);
    }
  }
}
