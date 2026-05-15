/**
 * Ontology entities + relationships for factory-line-sim.
 *
 * Bootstrapped via POST /api/decision-support/ontology-bootstrap/<project>
 * BEFORE the decision graphs are written, so the graphs' targetEntityId
 * fields resolve to real entities and the Decision Support Studio's
 * Ontology view shows a connected mesh instead of "Missing Entities (N)".
 *
 * Properties must be Record<string, string> (the bootstrap endpoint's
 * declared shape — see decision-support.controller.ts:354).
 */

import { MACHINES } from './machines';
import { PRODUCTION_ORDERS } from './production-orders';

export interface OntologyEntity {
  id: string;
  type: string;
  properties: Record<string, string>;
}

export interface OntologyRelationship {
  subject: string;
  predicate: string;
  object: string;
}

// ── Machines (3) ────────────────────────────────────────────────────
const MACHINE_ENTITIES: OntologyEntity[] = MACHINES.map((m) => ({
  id: m.id,
  type: 'Machine',
  properties: {
    name: m.name,
    cell: m.cell,
    region: m.region,
    sequence: String(m.sequence),
    description: m.description,
  },
}));

// ── Operators (2) ───────────────────────────────────────────────────
const OPERATOR_ENTITIES: OntologyEntity[] = [
  {
    id: 'cell-a-shift-lead',
    type: 'Operator',
    properties: {
      role: 'shift_lead',
      cell: 'Cell A',
      operates: 'CNC-5AX',
    },
  },
  {
    id: 'cell-b-shift-lead',
    type: 'Operator',
    properties: {
      role: 'shift_lead',
      cell: 'Cell B',
      operates: 'DEBURR-HAND, QA-INSP',
    },
  },
];

// ── Quality observation windows (per inspection machine) ────────────
// QualityWindow is a virtual entity referenced by conditions like
// "surface defects in last 4h on QA-INSP". Same id as the machine,
// different type (the studio keys by id+type internally).
const QUALITY_WINDOW_ENTITIES: OntologyEntity[] = [
  {
    id: 'QA-INSP',
    type: 'QualityWindow',
    properties: {
      machine: 'QA-INSP',
      defaultLookbackHours: '4',
      tracksDefectTypes: 'surface_finish, surface_staining, dimensional, edge',
    },
  },
];

// ── Production orders (5) ──────────────────────────────────────────
const ORDER_ENTITIES: OntologyEntity[] = PRODUCTION_ORDERS.map((o) => ({
  id: o.order_id,
  type: 'ProductionOrder',
  properties: {
    part_number: o.part_number,
    customer: o.customer,
    priority: o.priority,
    qty_ordered: String(o.qty_ordered),
    qty_completed: String(o.qty_completed),
    qty_scrapped: String(o.qty_scrapped),
    material: o.material,
    tolerance_grade: o.tolerance_grade,
    status: o.status,
    due_date: o.due_date,
  },
}));

// ── Materials (2) — the lots referenced in the wiki ────────────────
const MATERIAL_ENTITIES: OntologyEntity[] = [
  {
    id: 'Al-7075-Lot-A',
    type: 'Material',
    properties: {
      family: 'Al-7075',
      lot_ref: 'BM-AL75-A-2026-04',
      hardness_HV: '158',
      tensile_MPa: '568',
      notes: 'Standard lot. Used by PO-1001, PO-1004.',
    },
  },
  {
    id: 'Al-7075-Lot-B',
    type: 'Material',
    properties: {
      family: 'Al-7075',
      lot_ref: 'BM-AL75-B-2026-05',
      hardness_HV: '172',
      tensile_MPa: '591',
      notes: 'High-end-of-spec hardness; one point above ceiling. Used by PO-1003. Elevates spindle load ~8% vs Lot A.',
    },
  },
];

// ── Tools — referenced by the tool-wear decision graph ─────────────
const TOOL_ENTITIES: OntologyEntity[] = [
  {
    id: 'T07',
    type: 'Tool',
    properties: {
      family: 'end_mill_3flute_carbide',
      mounted_on: 'CNC-5AX',
      cycle_limit: '1000',
      override_steel: '700',
      notes: 'Damaged in chip-jam incident on 2026-05-11; swapped EOD.',
    },
  },
  {
    id: 'T12',
    type: 'Tool',
    properties: {
      family: 'end_mill_3flute_carbide',
      mounted_on: 'CNC-5AX',
      cycle_limit: '1000',
      override_aluminium: '850',
      notes: 'Currently in primary slot; near 90% of life on PO-1004.',
    },
  },
];

export const ONTOLOGY_ENTITIES: OntologyEntity[] = [
  ...MACHINE_ENTITIES,
  ...OPERATOR_ENTITIES,
  ...QUALITY_WINDOW_ENTITIES,
  ...ORDER_ENTITIES,
  ...MATERIAL_ENTITIES,
  ...TOOL_ENTITIES,
];

// ── Relationships ──────────────────────────────────────────────────
// Three classes of edge so the ontology graph forms a real mesh:
//   1. Machine flow      (precedes)
//   2. Operator coverage (operates)
//   3. Quality coverage  (observes)
//   4. Order routing     (runOn)
//   5. Order material    (usesMaterial)
//   6. Tool mounting     (mountedOn)
export const ONTOLOGY_RELATIONSHIPS: OntologyRelationship[] = [
  // Machine flow (line topology)
  { subject: 'CNC-5AX',     predicate: 'precedes', object: 'DEBURR-HAND' },
  { subject: 'DEBURR-HAND', predicate: 'precedes', object: 'QA-INSP' },

  // Operator coverage
  { subject: 'cell-a-shift-lead', predicate: 'operates', object: 'CNC-5AX' },
  { subject: 'cell-b-shift-lead', predicate: 'operates', object: 'DEBURR-HAND' },
  { subject: 'cell-b-shift-lead', predicate: 'operates', object: 'QA-INSP' },

  // Quality observation: QualityWindow QA-INSP observes the upstream
  // machines whose defects it surfaces.
  { subject: 'QA-INSP', predicate: 'observes', object: 'CNC-5AX' },
  { subject: 'QA-INSP', predicate: 'observes', object: 'DEBURR-HAND' },

  // Order routing — every order runs on every machine (line is sequential).
  ...PRODUCTION_ORDERS.flatMap((o) => o.routing.map((r) => ({
    subject: o.order_id,
    predicate: 'runsOn',
    object: r.machine,
  }))),

  // Order ↔ material — only the orders we have certs for.
  { subject: 'PO-1001', predicate: 'usesMaterial', object: 'Al-7075-Lot-A' },
  { subject: 'PO-1004', predicate: 'usesMaterial', object: 'Al-7075-Lot-A' },
  { subject: 'PO-1003', predicate: 'usesMaterial', object: 'Al-7075-Lot-B' },

  // Tools mounted on CNC-5AX
  { subject: 'T07', predicate: 'mountedOn', object: 'CNC-5AX' },
  { subject: 'T12', predicate: 'mountedOn', object: 'CNC-5AX' },
];
