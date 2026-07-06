import { Injectable, Logger } from '@nestjs/common';
import { TtGraphClient, QuadInput, QuadOut, q } from './tt-graph.client';
import {
  CLASS,
  GRAPH_AUDIT,
  GRAPH_CATALOG,
  GRAPH_TENDER,
  GRAPH_TRACKER,
  IRI,
  P,
  RDF_TYPE,
  XSD,
  localId,
} from './tt-vocab';
import {
  AgentRun,
  Baseline,
  CatalogService,
  Capture,
  Claim,
  Clarification,
  ComplianceRecord,
  DeviationReport,
  DocumentSection,
  ImplementationStatus,
  Proposal,
  Requirement,
  RequirementIssueLink,
  RequirementRelation,
  RequirementVersion,
  ServiceRequirementMapping,
  ServiceVersion,
  StaleNotice,
  StatusChange,
  TenderDocument,
  TenderMeta,
  TrackerIssue,
} from '../types/tendertrace-types';

/**
 * Persistence layer: TenderTrace domain shapes ↔ quads in the per-project rdf-store.
 *
 * Storage pattern per node:
 *  - rdf:type + structural quads (version chain, relations, links, decision, file refs …)
 *    carry everything that graph traversal and §11.5-style queries need;
 *  - one tt:record literal holds the full domain record as JSON (the spec's jsonb columns).
 *    The record embeds `_rev`; updates PUT the new record before DELeting the old one, so a
 *    crash can only ever leave an extra record quad — reads pick the highest `_rev`.
 *
 * The graph is append-only apart from: the tt:currentVersion pointer flip (repairable from
 * the tt:supersedes chain, see repairCurrentVersionPointers), record-literal replacement,
 * and the tracker mirror graph (rewritten on sync by design, spec §11.3).
 */
@Injectable()
export class TtRepository {
  private readonly logger = new Logger(TtRepository.name);

  constructor(private readonly graph: TtGraphClient) {}

  // ---------------------------------------------------------------------------
  // Generic record handling
  // ---------------------------------------------------------------------------

  private async writeNode(
    project: string,
    iri: string,
    klass: string,
    graphName: string,
    record: any,
    structural: QuadInput[] = [],
  ): Promise<void> {
    const withRev = { ...record, _rev: 1 };
    const puts: QuadInput[] = [
      q.node(iri, RDF_TYPE, klass, graphName),
      q.literal(iri, P.record, JSON.stringify(withRev), graphName),
      ...structural,
    ];
    await this.graph.put(project, puts);
  }

  /**
   * Replace a node's record literal (and optionally adjust structural quads).
   * Crash-safe ordering: put new record → delete old record + retired structural quads.
   */
  private async updateNode(
    project: string,
    iri: string,
    graphName: string,
    record: any,
    opts: { putStructural?: QuadInput[]; delStructural?: QuadInput[] } = {},
  ): Promise<void> {
    const existing = await this.graph.match(project, {
      subject: iri,
      predicate: P.record,
      graph: graphName,
    });
    const prevRev = existing
      .map((quad) => this.parseRecord(quad)?._rev ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);
    const withRev = { ...record, _rev: prevRev + 1 };

    await this.graph.put(project, [
      q.literal(iri, P.record, JSON.stringify(withRev), graphName),
      ...(opts.putStructural ?? []),
    ]);
    const dels: QuadInput[] = existing.map((quad) => ({
      subject: iri,
      predicate: P.record,
      object: quad.object.value,
      objectType: 'literal' as const,
      graph: graphName,
    }));
    await this.graph.batch(project, { dels: [...dels, ...(opts.delStructural ?? [])] });
  }

  private parseRecord(quad: QuadOut): any | null {
    try {
      return JSON.parse(quad.object.value);
    } catch {
      return null;
    }
  }

  private async readNode<T>(project: string, iri: string, graphName?: string): Promise<T | null> {
    const quads = await this.graph.match(project, {
      subject: iri,
      predicate: P.record,
      ...(graphName ? { graph: graphName } : {}),
    });
    if (quads.length === 0) return null;
    const records = quads
      .map((quad) => this.parseRecord(quad))
      .filter(Boolean)
      .sort((a, b) => (b._rev ?? 0) - (a._rev ?? 0));
    if (records.length === 0) return null;
    const { _rev, ...record } = records[0];
    return record as T;
  }

  private async readNodesByType<T>(
    project: string,
    klass: string,
    graphName: string,
  ): Promise<T[]> {
    const typeQuads = await this.graph.match(project, {
      predicate: RDF_TYPE,
      object: klass,
      graph: graphName,
    });
    const results: T[] = [];
    for (const quad of typeQuads) {
      const record = await this.readNode<T>(project, quad.subject.value, graphName);
      if (record) results.push(record);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Counters (id:meta/counters) — callers must hold the per-project write lock
  // ---------------------------------------------------------------------------

  async nextKey(project: string, counter: string, prefix: string, pad = 4): Promise<string> {
    const value = (await this.getCounter(project, counter)) + 1;
    await this.setCounter(project, counter, value);
    return `${prefix}${String(value).padStart(pad, '0')}`;
  }

  async getCounter(project: string, counter: string): Promise<number> {
    const iri = IRI.counters();
    const predicate = `${P.counterValue}/${counter}`;
    const quads = await this.graph.match(project, {
      subject: iri,
      predicate,
      graph: GRAPH_TENDER,
    });
    if (quads.length === 0) return 0;
    return quads.map((quad) => parseInt(quad.object.value, 10) || 0).reduce((a, b) => Math.max(a, b), 0);
  }

  private async setCounter(project: string, counter: string, value: number): Promise<void> {
    const iri = IRI.counters();
    const predicate = `${P.counterValue}/${counter}`;
    const existing = await this.graph.match(project, {
      subject: iri,
      predicate,
      graph: GRAPH_TENDER,
    });
    await this.graph.put(project, [
      q.typed(iri, predicate, String(value), `${XSD}integer`, GRAPH_TENDER),
    ]);
    if (existing.length > 0) {
      await this.graph.batch(project, {
        dels: existing.map((quad) => ({
          subject: iri,
          predicate,
          object: quad.object.value,
          objectType: 'literal' as const,
          datatype: `${XSD}integer`,
          graph: GRAPH_TENDER,
        })),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Tender meta
  // ---------------------------------------------------------------------------

  async saveTenderMeta(project: string, meta: TenderMeta): Promise<void> {
    const existing = await this.getTenderMeta(project);
    if (existing) {
      await this.updateNode(project, IRI.tender(), GRAPH_TENDER, meta);
    } else {
      await this.writeNode(project, IRI.tender(), CLASS.Tender, GRAPH_TENDER, meta);
    }
  }

  async getTenderMeta(project: string): Promise<TenderMeta | null> {
    return this.readNode<TenderMeta>(project, IRI.tender(), GRAPH_TENDER);
  }

  // ---------------------------------------------------------------------------
  // Documents & sections
  // ---------------------------------------------------------------------------

  async saveDocument(project: string, doc: TenderDocument): Promise<void> {
    const iri = IRI.doc(doc.id);
    const existing = await this.readNode(project, iri, GRAPH_TENDER);
    if (existing) {
      await this.updateNode(project, iri, GRAPH_TENDER, doc);
    } else {
      await this.writeNode(project, iri, CLASS.Document, GRAPH_TENDER, doc, [
        q.literal(iri, P.title, doc.title, GRAPH_TENDER),
      ]);
    }
  }

  async getDocument(project: string, docId: string): Promise<TenderDocument | null> {
    return this.readNode<TenderDocument>(project, IRI.doc(docId), GRAPH_TENDER);
  }

  async listDocuments(project: string): Promise<TenderDocument[]> {
    const docs = await this.readNodesByType<TenderDocument>(project, CLASS.Document, GRAPH_TENDER);
    return docs.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Lightweight section nodes (no text — text lives in parsed/<docId>/sections.json). */
  async saveSections(project: string, sections: DocumentSection[]): Promise<void> {
    const puts: QuadInput[] = [];
    for (const section of sections) {
      const iri = IRI.section(section.documentId, section.id.split('/sec/').pop() ?? section.id);
      puts.push(q.node(iri, RDF_TYPE, CLASS.Section, GRAPH_TENDER));
      puts.push(
        q.literal(
          iri,
          P.record,
          JSON.stringify({
            id: section.id,
            documentId: section.documentId,
            headingPath: section.headingPath,
            pageFrom: section.pageFrom,
            pageTo: section.pageTo,
            charFrom: section.charFrom,
            charTo: section.charTo,
            _rev: 1,
          }),
          GRAPH_TENDER,
        ),
      );
    }
    if (puts.length > 0) await this.graph.put(project, puts);
  }

  // ---------------------------------------------------------------------------
  // Requirements & versions
  // ---------------------------------------------------------------------------

  async createRequirement(
    project: string,
    requirement: Requirement,
    firstVersion: RequirementVersion,
  ): Promise<void> {
    const reqIri = IRI.req(requirement.id);
    const versionIri = IRI.reqVersion(firstVersion.requirementId, firstVersion.versionNo);
    const puts: QuadInput[] = [
      q.node(reqIri, RDF_TYPE, CLASS.Requirement, GRAPH_TENDER),
      q.literal(reqIri, P.record, JSON.stringify({ ...requirement, _rev: 1 }), GRAPH_TENDER),
      q.node(reqIri, P.currentVersion, versionIri, GRAPH_TENDER),
      ...this.versionQuads(versionIri, reqIri, firstVersion),
    ];
    await this.graph.put(project, puts);
  }

  private versionQuads(
    versionIri: string,
    reqIri: string,
    version: RequirementVersion,
  ): QuadInput[] {
    const quads: QuadInput[] = [
      q.node(versionIri, RDF_TYPE, CLASS.RequirementVersion, GRAPH_TENDER),
      q.literal(versionIri, P.record, JSON.stringify({ ...version, _rev: 1 }), GRAPH_TENDER),
      q.node(versionIri, P.versionOf, reqIri, GRAPH_TENDER),
      q.typed(versionIri, P.versionNo, String(version.versionNo), `${XSD}integer`, GRAPH_TENDER),
      q.node(versionIri, P.wasGeneratedBy, IRI.proposal(version.createdFromProposalId), GRAPH_TENDER),
      q.typed(versionIri, P.atTime, version.createdAt, `${XSD}dateTime`, GRAPH_TENDER),
    ];
    if (version.earsText) {
      quads.push(
        version.language
          ? q.lang(versionIri, P.earsText, version.earsText, version.language, GRAPH_TENDER)
          : q.literal(versionIri, P.earsText, version.earsText, GRAPH_TENDER),
      );
    }
    if (version.sourceRef?.quote) {
      quads.push(q.literal(versionIri, P.quote, version.sourceRef.quote, GRAPH_TENDER));
    }
    if (version.sourceRef?.documentId && version.sourceRef?.sectionId) {
      quads.push(
        q.node(
          versionIri,
          P.sourceSection,
          IRI.section(version.sourceRef.documentId, version.sourceRef.sectionId),
          GRAPH_TENDER,
        ),
      );
    }
    if (version.supersedesVersionId) {
      quads.push(
        q.node(
          versionIri,
          P.supersedes,
          IRI.reqVersion(version.requirementId, version.versionNo - 1),
          GRAPH_TENDER,
        ),
      );
    }
    return quads;
  }

  /**
   * Append a new version and flip the tt:currentVersion pointer.
   * Order: put version + new pointer → delete old pointer (crash leaves two pointers;
   * repairCurrentVersionPointers resolves to the version no other version supersedes).
   */
  async addVersion(
    project: string,
    requirement: Requirement,
    version: RequirementVersion,
  ): Promise<void> {
    const reqIri = IRI.req(requirement.id);
    const versionIri = IRI.reqVersion(version.requirementId, version.versionNo);
    await this.graph.put(project, [
      ...this.versionQuads(versionIri, reqIri, version),
      q.node(reqIri, P.currentVersion, versionIri, GRAPH_TENDER),
    ]);
    const oldPointers = await this.graph.match(project, {
      subject: reqIri,
      predicate: P.currentVersion,
      graph: GRAPH_TENDER,
    });
    const dels = oldPointers
      .filter((quad) => quad.object.value !== versionIri)
      .map((quad) => ({
        subject: reqIri,
        predicate: P.currentVersion,
        object: quad.object.value,
        objectType: 'namedNode' as const,
        graph: GRAPH_TENDER,
      }));
    if (dels.length > 0) await this.graph.batch(project, { dels });
    await this.updateNode(project, reqIri, GRAPH_TENDER, {
      ...requirement,
      currentVersionId: `${version.requirementId}/v/${version.versionNo}`,
    });
  }

  async updateRequirement(project: string, requirement: Requirement): Promise<void> {
    await this.updateNode(project, IRI.req(requirement.id), GRAPH_TENDER, requirement);
  }

  async getRequirement(project: string, reqId: string): Promise<Requirement | null> {
    return this.readNode<Requirement>(project, IRI.req(reqId), GRAPH_TENDER);
  }

  async listRequirements(project: string): Promise<Requirement[]> {
    const requirements = await this.readNodesByType<Requirement>(
      project,
      CLASS.Requirement,
      GRAPH_TENDER,
    );
    return requirements.sort((a, b) => a.id.localeCompare(b.id));
  }

  async getVersion(
    project: string,
    reqId: string,
    versionNo: number,
  ): Promise<RequirementVersion | null> {
    return this.readNode<RequirementVersion>(
      project,
      IRI.reqVersion(reqId, versionNo),
      GRAPH_TENDER,
    );
  }

  async getVersions(project: string, reqId: string): Promise<RequirementVersion[]> {
    const versionQuads = await this.graph.match(project, {
      predicate: P.versionOf,
      object: IRI.req(reqId),
      graph: GRAPH_TENDER,
    });
    const versions: RequirementVersion[] = [];
    for (const quad of versionQuads) {
      const version = await this.readNode<RequirementVersion>(
        project,
        quad.subject.value,
        GRAPH_TENDER,
      );
      if (version) versions.push(version);
    }
    return versions.sort((a, b) => a.versionNo - b.versionNo);
  }

  /** Startup/consistency repair: current version = the one no other version supersedes. */
  async repairCurrentVersionPointers(project: string): Promise<number> {
    let repaired = 0;
    const requirements = await this.listRequirements(project);
    for (const requirement of requirements) {
      const pointers = await this.graph.match(project, {
        subject: IRI.req(requirement.id),
        predicate: P.currentVersion,
        graph: GRAPH_TENDER,
      });
      if (pointers.length <= 1) continue;
      const versions = await this.getVersions(project, requirement.id);
      const latest = versions[versions.length - 1];
      if (!latest) continue;
      const latestIri = IRI.reqVersion(requirement.id, latest.versionNo);
      const dels = pointers
        .filter((quad) => quad.object.value !== latestIri)
        .map((quad) => ({
          subject: IRI.req(requirement.id),
          predicate: P.currentVersion,
          object: quad.object.value,
          objectType: 'namedNode' as const,
          graph: GRAPH_TENDER,
        }));
      if (dels.length > 0) {
        await this.graph.batch(project, { dels });
        repaired++;
      }
    }
    if (repaired > 0) {
      this.logger.warn(`Repaired ${repaired} currentVersion pointers in project ${project}`);
    }
    return repaired;
  }

  // ---------------------------------------------------------------------------
  // Proposals
  // ---------------------------------------------------------------------------

  async saveProposal(project: string, proposal: Proposal): Promise<void> {
    const iri = IRI.proposal(proposal.id);
    const structural: QuadInput[] = [
      q.node(iri, P.kind, `${P.kind}/${proposal.kind}`, GRAPH_TENDER),
      q.typed(iri, P.created, proposal.createdAt, `${XSD}dateTime`, GRAPH_TENDER),
    ];
    for (const reqId of proposal.affectedRequirementIds ?? []) {
      structural.push(q.node(iri, P.affectsRequirement, IRI.req(reqId), GRAPH_TENDER));
    }
    if (proposal.sourceArtifactId) {
      structural.push(q.node(iri, P.wasDerivedFrom, IRI.doc(proposal.sourceArtifactId), GRAPH_TENDER));
    }
    if (proposal.evidence?.quote) {
      structural.push(q.literal(iri, P.quote, proposal.evidence.quote, GRAPH_TENDER));
    }
    await this.writeNode(project, iri, CLASS.Proposal, GRAPH_TENDER, proposal, structural);
  }

  /**
   * Record a decision. `proposed` is the absence of a tt:decision quad, so this is a
   * pure append apart from the record-literal replacement.
   */
  async updateProposal(project: string, proposal: Proposal): Promise<void> {
    const iri = IRI.proposal(proposal.id);
    const putStructural: QuadInput[] = [];
    if (proposal.decision && proposal.decidedAt) {
      putStructural.push(
        q.node(iri, P.decision, `${P.decision}/${proposal.decision}`, GRAPH_TENDER),
        q.literal(iri, P.creator, proposal.decidedBy ?? 'unknown', GRAPH_TENDER),
        q.typed(iri, P.atTime, proposal.decidedAt, `${XSD}dateTime`, GRAPH_TENDER),
      );
    }
    await this.updateNode(project, iri, GRAPH_TENDER, proposal, { putStructural });
  }

  async getProposal(project: string, proposalId: string): Promise<Proposal | null> {
    return this.readNode<Proposal>(project, IRI.proposal(proposalId), GRAPH_TENDER);
  }

  async listProposals(
    project: string,
    filter: { kind?: string; status?: string } = {},
  ): Promise<Proposal[]> {
    const proposals = await this.readNodesByType<Proposal>(project, CLASS.Proposal, GRAPH_TENDER);
    return proposals
      .filter((p) => !filter.kind || p.kind === filter.kind)
      .filter((p) => !filter.status || p.status === filter.status)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  // ---------------------------------------------------------------------------
  // Relations (§3.6)
  // ---------------------------------------------------------------------------

  async saveRelation(project: string, relation: RequirementRelation): Promise<void> {
    const iri = IRI.relation(relation.id);
    await this.writeNode(project, iri, CLASS.Relation, GRAPH_TENDER, relation, [
      q.node(iri, P.relationFrom, IRI.req(relation.fromRequirementId), GRAPH_TENDER),
      q.node(iri, P.relationTo, IRI.req(relation.toRequirementId), GRAPH_TENDER),
      q.literal(iri, P.relationKind, relation.kind, GRAPH_TENDER),
    ]);
  }

  async updateRelation(project: string, relation: RequirementRelation): Promise<void> {
    await this.updateNode(project, IRI.relation(relation.id), GRAPH_TENDER, relation);
  }

  async listRelations(
    project: string,
    reqId?: string,
  ): Promise<RequirementRelation[]> {
    const relations = await this.readNodesByType<RequirementRelation>(
      project,
      CLASS.Relation,
      GRAPH_TENDER,
    );
    const filtered = reqId
      ? relations.filter(
          (r) => r.fromRequirementId === reqId || r.toRequirementId === reqId,
        )
      : relations;
    return filtered.sort((a, b) => a.id.localeCompare(b.id));
  }

  // ---------------------------------------------------------------------------
  // Baselines
  // ---------------------------------------------------------------------------

  async saveBaseline(project: string, baseline: Baseline): Promise<void> {
    const iri = IRI.baseline(baseline.label);
    const structural = baseline.requirementVersionIds.map((versionId) => {
      const [reqId, , versionNo] = versionId.split('/');
      return q.node(iri, P.includesVersion, IRI.reqVersion(reqId, parseInt(versionNo, 10)), GRAPH_TENDER);
    });
    await this.writeNode(project, iri, CLASS.Baseline, GRAPH_TENDER, baseline, structural);
  }

  async getBaseline(project: string, label: string): Promise<Baseline | null> {
    return this.readNode<Baseline>(project, IRI.baseline(label), GRAPH_TENDER);
  }

  async listBaselines(project: string): Promise<Baseline[]> {
    const baselines = await this.readNodesByType<Baseline>(project, CLASS.Baseline, GRAPH_TENDER);
    return baselines.sort((a, b) => (a.frozenAt < b.frozenAt ? -1 : 1));
  }

  // ---------------------------------------------------------------------------
  // Catalog (id:graph/catalog)
  // ---------------------------------------------------------------------------

  async saveService(project: string, service: CatalogService): Promise<void> {
    const iri = IRI.service(service.id);
    const existing = await this.readNode(project, iri, GRAPH_CATALOG);
    if (existing) {
      await this.updateNode(project, iri, GRAPH_CATALOG, service);
    } else {
      await this.writeNode(project, iri, CLASS.Service, GRAPH_CATALOG, service, [
        q.literal(iri, P.title, service.title, GRAPH_CATALOG),
      ]);
    }
  }

  async getService(project: string, serviceId: string): Promise<CatalogService | null> {
    return this.readNode<CatalogService>(project, IRI.service(serviceId), GRAPH_CATALOG);
  }

  async listServices(project: string): Promise<CatalogService[]> {
    const services = await this.readNodesByType<CatalogService>(
      project,
      CLASS.Service,
      GRAPH_CATALOG,
    );
    return services.sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveServiceVersion(project: string, version: ServiceVersion): Promise<void> {
    const iri = IRI.serviceVersion(version.serviceId, version.versionNo);
    const existing = await this.readNode(project, iri, GRAPH_CATALOG);
    if (existing) {
      await this.updateNode(project, iri, GRAPH_CATALOG, version);
      return;
    }
    await this.writeNode(project, iri, CLASS.ServiceVersion, GRAPH_CATALOG, version, [
      q.node(iri, P.versionOf, IRI.service(version.serviceId), GRAPH_CATALOG),
      q.typed(iri, P.versionNo, String(version.versionNo), `${XSD}integer`, GRAPH_CATALOG),
    ]);
  }

  async getServiceVersion(
    project: string,
    serviceId: string,
    versionNo: number,
  ): Promise<ServiceVersion | null> {
    return this.readNode<ServiceVersion>(
      project,
      IRI.serviceVersion(serviceId, versionNo),
      GRAPH_CATALOG,
    );
  }

  async listServiceVersions(project: string, serviceId: string): Promise<ServiceVersion[]> {
    const versionQuads = await this.graph.match(project, {
      predicate: P.versionOf,
      object: IRI.service(serviceId),
      graph: GRAPH_CATALOG,
    });
    const versions: ServiceVersion[] = [];
    for (const quad of versionQuads) {
      const version = await this.readNode<ServiceVersion>(
        project,
        quad.subject.value,
        GRAPH_CATALOG,
      );
      if (version) versions.push(version);
    }
    return versions.sort((a, b) => a.versionNo - b.versionNo);
  }

  // ---------------------------------------------------------------------------
  // Mappings & compliance
  // ---------------------------------------------------------------------------

  async saveMapping(project: string, mapping: ServiceRequirementMapping): Promise<void> {
    const iri = IRI.mapping(mapping.id);
    const [serviceId, , versionNo] = mapping.serviceVersionId.split('/');
    await this.writeNode(project, iri, CLASS.Mapping, GRAPH_TENDER, mapping, [
      q.node(iri, P.mapsRequirement, IRI.req(mapping.requirementId), GRAPH_TENDER),
      q.node(
        iri,
        P.mapsServiceVersion,
        IRI.serviceVersion(serviceId, parseInt(versionNo, 10)),
        GRAPH_TENDER,
      ),
      q.literal(iri, P.coverage, mapping.coverage, GRAPH_TENDER),
    ]);
  }

  async updateMapping(project: string, mapping: ServiceRequirementMapping): Promise<void> {
    await this.updateNode(project, IRI.mapping(mapping.id), GRAPH_TENDER, mapping);
  }

  async listMappings(
    project: string,
    filter: { requirementId?: string; stale?: boolean } = {},
  ): Promise<ServiceRequirementMapping[]> {
    const mappings = await this.readNodesByType<ServiceRequirementMapping>(
      project,
      CLASS.Mapping,
      GRAPH_TENDER,
    );
    return mappings
      .filter((m) => !filter.requirementId || m.requirementId === filter.requirementId)
      .filter((m) => filter.stale === undefined || Boolean(m.staleSince) === filter.stale)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveCompliance(project: string, record: ComplianceRecord): Promise<void> {
    const iri = IRI.compliance(record.requirementId);
    const existing = await this.readNode(project, iri, GRAPH_TENDER);
    const structural = [
      q.node(iri, P.aboutRequirement, IRI.req(record.requirementId), GRAPH_TENDER),
      q.literal(iri, P.verdict, record.verdict, GRAPH_TENDER),
    ];
    if (existing) {
      await this.updateNode(project, iri, GRAPH_TENDER, record, { putStructural: structural });
    } else {
      await this.writeNode(project, iri, CLASS.ComplianceRecord, GRAPH_TENDER, record, structural);
    }
  }

  async listCompliance(project: string): Promise<ComplianceRecord[]> {
    return this.readNodesByType<ComplianceRecord>(project, CLASS.ComplianceRecord, GRAPH_TENDER);
  }

  // ---------------------------------------------------------------------------
  // Tracker mirror (id:graph/tracker — rewritten on sync) & links
  // ---------------------------------------------------------------------------

  async rewriteTrackerMirror(project: string, issues: TrackerIssue[]): Promise<void> {
    await this.graph.deleteGraph(project, GRAPH_TRACKER);
    const puts: QuadInput[] = [];
    for (const issue of issues) {
      const iri = IRI.issue(issue.key);
      puts.push(q.node(iri, RDF_TYPE, CLASS.Issue, GRAPH_TRACKER));
      puts.push(q.literal(iri, P.record, JSON.stringify({ ...issue, _rev: 1 }), GRAPH_TRACKER));
      puts.push(q.literal(iri, P.status, issue.statusCategory, GRAPH_TRACKER));
    }
    if (puts.length > 0) await this.graph.put(project, puts);
  }

  async getIssue(project: string, key: string): Promise<TrackerIssue | null> {
    return this.readNode<TrackerIssue>(project, IRI.issue(key), GRAPH_TRACKER);
  }

  async listIssues(project: string): Promise<TrackerIssue[]> {
    const issues = await this.readNodesByType<TrackerIssue>(project, CLASS.Issue, GRAPH_TRACKER);
    return issues.sort((a, b) => a.key.localeCompare(b.key));
  }

  async saveLink(project: string, link: RequirementIssueLink): Promise<void> {
    const iri = IRI.link(link.id);
    await this.writeNode(project, iri, CLASS.IssueLink, GRAPH_TENDER, link, [
      q.node(iri, P.linksRequirement, IRI.req(link.requirementId), GRAPH_TENDER),
      q.node(iri, P.linksIssue, IRI.issue(link.issueKey), GRAPH_TENDER),
      q.literal(iri, P.relationship, link.relationship, GRAPH_TENDER),
    ]);
  }

  async updateLink(project: string, link: RequirementIssueLink): Promise<void> {
    await this.updateNode(project, IRI.link(link.id), GRAPH_TENDER, link);
  }

  async listLinks(
    project: string,
    filter: { requirementId?: string; issueKey?: string; stale?: boolean; status?: string } = {},
  ): Promise<RequirementIssueLink[]> {
    const links = await this.readNodesByType<RequirementIssueLink>(
      project,
      CLASS.IssueLink,
      GRAPH_TENDER,
    );
    return links
      .filter((l) => !filter.requirementId || l.requirementId === filter.requirementId)
      .filter((l) => !filter.issueKey || l.issueKey === filter.issueKey)
      .filter((l) => !filter.status || l.status === filter.status)
      .filter((l) => filter.stale === undefined || Boolean(l.staleSince) === filter.stale)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveStaleNotice(project: string, notice: StaleNotice): Promise<void> {
    await this.writeNode(project, IRI.staleNotice(notice.id), CLASS.StaleNotice, GRAPH_TENDER, notice);
  }

  async updateStaleNotice(project: string, notice: StaleNotice): Promise<void> {
    await this.updateNode(project, IRI.staleNotice(notice.id), GRAPH_TENDER, notice);
  }

  async listStaleNotices(project: string): Promise<StaleNotice[]> {
    const notices = await this.readNodesByType<StaleNotice>(
      project,
      CLASS.StaleNotice,
      GRAPH_TENDER,
    );
    return notices.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  // ---------------------------------------------------------------------------
  // Claims, reports, captures, clarifications
  // ---------------------------------------------------------------------------

  async saveClaim(project: string, claim: Claim): Promise<void> {
    const existing = await this.readNode(project, IRI.claim(claim.id), GRAPH_TENDER);
    if (existing) {
      await this.updateNode(project, IRI.claim(claim.id), GRAPH_TENDER, claim);
    } else {
      await this.writeNode(project, IRI.claim(claim.id), CLASS.Claim, GRAPH_TENDER, claim);
    }
  }

  async getClaim(project: string, claimId: string): Promise<Claim | null> {
    return this.readNode<Claim>(project, IRI.claim(claimId), GRAPH_TENDER);
  }

  async listClaims(project: string): Promise<Claim[]> {
    const claims = await this.readNodesByType<Claim>(project, CLASS.Claim, GRAPH_TENDER);
    return claims.sort((a, b) => a.id.localeCompare(b.id));
  }

  async saveReport(project: string, report: DeviationReport): Promise<void> {
    const existing = await this.readNode(project, IRI.report(report.id), GRAPH_TENDER);
    if (existing) {
      await this.updateNode(project, IRI.report(report.id), GRAPH_TENDER, report);
    } else {
      await this.writeNode(project, IRI.report(report.id), CLASS.DeviationReport, GRAPH_TENDER, report);
    }
  }

  async getReport(project: string, reportId: string): Promise<DeviationReport | null> {
    return this.readNode<DeviationReport>(project, IRI.report(reportId), GRAPH_TENDER);
  }

  async listReports(project: string): Promise<DeviationReport[]> {
    const reports = await this.readNodesByType<DeviationReport>(
      project,
      CLASS.DeviationReport,
      GRAPH_TENDER,
    );
    return reports.sort((a, b) => (a.generatedAt < b.generatedAt ? -1 : 1));
  }

  async saveCapture(project: string, capture: Capture): Promise<void> {
    const existing = await this.readNode(project, IRI.capture(capture.id), GRAPH_TENDER);
    if (existing) {
      await this.updateNode(project, IRI.capture(capture.id), GRAPH_TENDER, capture);
    } else {
      await this.writeNode(project, IRI.capture(capture.id), CLASS.Capture, GRAPH_TENDER, capture);
    }
  }

  async getCapture(project: string, captureId: string): Promise<Capture | null> {
    return this.readNode<Capture>(project, IRI.capture(captureId), GRAPH_TENDER);
  }

  async listCaptures(project: string): Promise<Capture[]> {
    const captures = await this.readNodesByType<Capture>(project, CLASS.Capture, GRAPH_TENDER);
    return captures.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async saveClarification(project: string, clarification: Clarification): Promise<void> {
    const iri = IRI.clarification(clarification.id);
    const structural: QuadInput[] = [];
    if (clarification.proposalId) {
      structural.push(q.node(IRI.proposal(clarification.proposalId), P.clarifiedBy, iri, GRAPH_TENDER));
    }
    await this.writeNode(project, iri, CLASS.Clarification, GRAPH_TENDER, clarification, structural);
  }

  async listClarifications(project: string, captureId?: string): Promise<Clarification[]> {
    const clarifications = await this.readNodesByType<Clarification>(
      project,
      CLASS.Clarification,
      GRAPH_TENDER,
    );
    return clarifications.filter((c) => !captureId || c.captureId === captureId);
  }

  // ---------------------------------------------------------------------------
  // Audit graph: agent runs & status changes (append-only)
  // ---------------------------------------------------------------------------

  async saveAgentRun(project: string, run: AgentRun): Promise<void> {
    const existing = await this.readNode(project, IRI.run(run.id), GRAPH_AUDIT);
    if (existing) {
      await this.updateNode(project, IRI.run(run.id), GRAPH_AUDIT, run);
    } else {
      await this.writeNode(project, IRI.run(run.id), CLASS.AgentRun, GRAPH_AUDIT, run, [
        q.typed(IRI.run(run.id), P.atTime, run.startedAt, `${XSD}dateTime`, GRAPH_AUDIT),
      ]);
    }
  }

  async listAgentRuns(project: string, pipeline?: string): Promise<AgentRun[]> {
    const runs = await this.readNodesByType<AgentRun>(project, CLASS.AgentRun, GRAPH_AUDIT);
    return runs
      .filter((r) => !pipeline || r.pipeline === pipeline)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  }

  async appendStatusChange(project: string, change: StatusChange): Promise<void> {
    const iri = IRI.statusChange(change.requirementId, change.at.replace(/[:.]/g, '-'));
    await this.graph.put(project, [
      q.node(iri, RDF_TYPE, CLASS.StatusChange, GRAPH_AUDIT),
      q.node(iri, P.requirement, IRI.req(change.requirementId), GRAPH_AUDIT),
      q.literal(iri, P.statusFrom, change.from ?? 'none', GRAPH_AUDIT),
      q.literal(iri, P.statusTo, change.to, GRAPH_AUDIT),
      q.typed(iri, P.atTime, change.at, `${XSD}dateTime`, GRAPH_AUDIT),
    ]);
  }

  async listStatusChanges(project: string, reqId?: string): Promise<StatusChange[]> {
    const pattern = reqId
      ? { predicate: P.requirement, object: IRI.req(reqId), graph: GRAPH_AUDIT }
      : { predicate: RDF_TYPE, object: CLASS.StatusChange, graph: GRAPH_AUDIT };
    const quads = await this.graph.match(project, pattern);
    const changes: StatusChange[] = [];
    for (const quad of quads) {
      const subjectQuads = await this.graph.match(project, {
        subject: quad.subject.value,
        graph: GRAPH_AUDIT,
      });
      const get = (predicate: string) =>
        subjectQuads.find((sq) => sq.predicate.value === predicate)?.object.value;
      const requirement = get(P.requirement);
      const to = get(P.statusTo);
      const at = get(P.atTime);
      if (!requirement || !to || !at) continue;
      const from = get(P.statusFrom);
      changes.push({
        requirementId: localId(requirement).replace('req/', ''),
        from: from === 'none' ? null : (from as ImplementationStatus),
        to: to as ImplementationStatus,
        at,
      });
    }
    return changes.sort((a, b) => (a.at < b.at ? -1 : 1));
  }
}
