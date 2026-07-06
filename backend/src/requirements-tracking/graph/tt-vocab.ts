/**
 * TenderTrace RDF vocabulary and IRI scheme (spec §11.3).
 *
 * Base https://w3id.org/tendertrace/ — `tt:` = vocab#, `id:` = id/.
 * One etienne project = one tender, so instance IRIs drop the spec's
 * tender/<key> segment: id:req/REQ-047/v/3, id:doc/D-01, id:baseline/v1.0.
 */

export const TT = 'https://w3id.org/tendertrace/vocab#';
export const ID = 'https://w3id.org/tendertrace/id/';
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
export const DCT = 'http://purl.org/dc/terms/';
export const PROV = 'http://www.w3.org/ns/prov#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';

export const tt = (local: string): string => `${TT}${local}`;
export const id = (local: string): string => `${ID}${local}`;
export const dct = (local: string): string => `${DCT}${local}`;
export const prov = (local: string): string => `${PROV}${local}`;
export const xsd = (local: string): string => `${XSD}${local}`;

/** Strip the id: prefix from an instance IRI ("…/id/req/REQ-047" → "req/REQ-047"). */
export const localId = (iri: string): string =>
  iri.startsWith(ID) ? iri.slice(ID.length) : iri;

// Named graphs — partition by lifecycle and access scope (spec §11.3)
export const GRAPH_TENDER = id('graph/tender');
export const GRAPH_CATALOG = id('graph/catalog');
export const GRAPH_TRACKER = id('graph/tracker'); // rewritten on sync — the only non-append-only graph
export const GRAPH_AUDIT = id('graph/audit'); // agent runs, decisions (PROV), tt:StatusChange

// Classes (one per §3.4 table)
export const CLASS = {
  Tender: tt('Tender'),
  Document: tt('Document'),
  Section: tt('Section'),
  Requirement: tt('Requirement'),
  RequirementVersion: tt('RequirementVersion'),
  Proposal: tt('Proposal'),
  Baseline: tt('Baseline'),
  Relation: tt('Relation'),
  Service: tt('Service'),
  ServiceVersion: tt('ServiceVersion'),
  Mapping: tt('Mapping'),
  ComplianceRecord: tt('ComplianceRecord'),
  Issue: tt('Issue'),
  IssueLink: tt('IssueLink'),
  StaleNotice: tt('StaleNotice'),
  Claim: tt('Claim'),
  DeviationReport: tt('DeviationReport'),
  ResponseSection: tt('ResponseSection'),
  Capture: tt('Capture'),
  Clarification: tt('Clarification'),
  AgentRun: tt('AgentRun'),
  StatusChange: tt('StatusChange'),
  File: tt('File'),
  Counters: tt('Counters'),
} as const;

// Properties
export const P = {
  // version chain
  currentVersion: tt('currentVersion'),
  versionOf: tt('versionOf'),
  supersedes: tt('supersedes'),
  versionNo: tt('versionNo'),
  // requirement↔requirement relations (§3.6) — carried on tt:Relation nodes
  relationKind: tt('relationKind'),
  relationFrom: tt('relationFrom'),
  relationTo: tt('relationTo'),
  // requirement content + provenance
  sourceSection: tt('sourceSection'),
  quote: tt('quote'),
  page: tt('page'),
  earsPattern: tt('earsPattern'),
  earsText: tt('earsText'),
  modality: tt('modality'),
  category: tt('category'),
  // status-ish
  status: tt('status'),
  kind: tt('kind'),
  decision: tt('decision'),
  implementationStatus: tt('implementationStatus'),
  // mappings
  mapsRequirement: tt('mapsRequirement'),
  mapsServiceVersion: tt('mapsServiceVersion'),
  coverage: tt('coverage'),
  staleSince: tt('staleSince'),
  // tracker linking
  linksIssue: tt('linksIssue'),
  linksRequirement: tt('linksRequirement'),
  relationship: tt('relationship'),
  // compliance
  verdict: tt('verdict'),
  aboutRequirement: tt('aboutRequirement'),
  // baseline
  includesVersion: tt('includesVersion'),
  // capture
  captureMethod: tt('captureMethod'),
  clarifiedBy: tt('clarifiedBy'),
  // proposal linkage
  affectsRequirement: tt('affectsRequirement'),
  classification: tt('classification'),
  // status history (audit graph)
  statusFrom: tt('statusFrom'),
  statusTo: tt('statusTo'),
  requirement: tt('requirement'),
  // node → file
  originalFile: tt('originalFile'),
  parsedMarkdown: tt('parsedMarkdown'),
  bodyFile: tt('bodyFile'),
  hasImage: tt('hasImage'),
  renderedFile: tt('renderedFile'),
  snapshotFile: tt('snapshotFile'),
  // file metadata — tt:relativePath is the ONLY place a path exists
  relativePath: tt('relativePath'),
  sha256: tt('sha256'),
  byteCount: tt('byteCount'),
  // full-record JSON literal (pragmatic complement to the typed quads; see tt-repository.ts)
  record: tt('record'),
  // counters
  counterValue: tt('counter'),
  // dcterms / prov
  title: dct('title'),
  format: dct('format'),
  created: dct('created'),
  creator: dct('creator'),
  wasGeneratedBy: prov('wasGeneratedBy'),
  wasDerivedFrom: prov('wasDerivedFrom'),
  atTime: prov('atTime'),
} as const;

// Instance IRI builders
export const IRI = {
  tender: (): string => id('tender'),
  doc: (docId: string): string => id(`doc/${docId}`),
  section: (docId: string, sectionId: string): string => id(`doc/${docId}/sec/${sectionId}`),
  req: (reqId: string): string => id(`req/${reqId}`),
  reqVersion: (reqId: string, versionNo: number): string => id(`req/${reqId}/v/${versionNo}`),
  proposal: (pid: string): string => id(`proposal/${pid}`),
  baseline: (label: string): string => id(`baseline/${label}`),
  relation: (relId: string): string => id(`rel/${relId}`),
  service: (sid: string): string => id(`service/${sid}`),
  serviceVersion: (sid: string, versionNo: number): string => id(`service/${sid}/v/${versionNo}`),
  mapping: (mid: string): string => id(`mapping/${mid}`),
  compliance: (reqId: string): string => id(`compliance/${reqId}`),
  issue: (key: string): string => id(`issue/${key}`),
  link: (lid: string): string => id(`link/${lid}`),
  staleNotice: (nid: string): string => id(`stalenotice/${nid}`),
  claim: (cid: string): string => id(`claim/${cid}`),
  report: (rid: string): string => id(`report/${rid}`),
  responseSection: (sid: string): string => id(`response/${sid}`),
  capture: (cid: string): string => id(`capture/${cid}`),
  clarification: (qid: string): string => id(`clarification/${qid}`),
  run: (rid: string): string => id(`run/${rid}`),
  statusChange: (reqId: string, seq: number | string): string =>
    id(`statuschange/${reqId}/${seq}`),
  file: (sha256Prefix: string): string => id(`file/${sha256Prefix}`),
  counters: (): string => id('meta/counters'),
} as const;
