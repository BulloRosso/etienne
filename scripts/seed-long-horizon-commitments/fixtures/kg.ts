/**
 * Knowledge-graph seed for the long-horizon-commitments project.
 *
 * Five vessels, four historical Meridian decisions, the eight Meridian
 * assumptions (with ageingState), one dry-dock gate with three deferred
 * items, five vessel projection cones, and the regulatory/parameter
 * backdrop the agent cites when ageing assumptions.
 *
 * Wire types are restricted to Person|Company|Product|Document — the real
 * domain type is carried in properties.domainType (same convention as the
 * desalination seed).
 */

export interface EntityDraft {
  id: string;
  type: 'Person' | 'Company' | 'Product' | 'Document';
  properties: Record<string, string>;
}

export interface RelationshipDraft {
  subject: string;
  predicate: string;
  object: string;
  properties?: Record<string, string>;
}

// --- entity helpers -----------------------------------------------------

const vessel = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Product',
  properties: { domainType: 'Vessel', label, ...extra },
});

const decision = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Decision', label, ...extra },
});

const assumption = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Assumption', label, ...extra },
});

const gate = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Gate', label, ...extra },
});

const deferredItem = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'DeferredItem', label, status: 'deferred', ...extra },
});

const projection = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Projection', label, ...extra },
});

const regulation = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Regulation', label, ...extra },
});

const counterparty = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Company',
  properties: { domainType: 'Counterparty', label, ...extra },
});

const yard = (id: string, label: string, extra: Record<string, string> = {}): EntityDraft => ({
  id,
  type: 'Company',
  properties: { domainType: 'Yard', label, ...extra },
});

// --- entities -----------------------------------------------------------

export const KG_ENTITIES: EntityDraft[] = [
  // Vessels (5) — strategy alignment matches the article screenshot.
  vessel('meridian', 'Meridian', {
    imo: '9712334', built: '2015', dwt: '113200', flag: 'Marshall Islands',
    nextSurvey: '2027-06-15', strategyAlignment: '38', status: 'off-strategy',
    note: 'No scrubber; FuelEU exposure rising',
  }),
  vessel('aurora', 'Aurora', {
    imo: '9788321', built: '2018', dwt: '104800', flag: 'Liberia',
    nextSurvey: '2029-02-01', strategyAlignment: '84', status: 'aligned',
  }),
  vessel('nordic-star', 'Nordic Star', {
    imo: '9745667', built: '2017', dwt: '110100', flag: 'Marshall Islands',
    nextSurvey: '2028-06-01', strategyAlignment: '72', status: 'aligned',
    note: 'EUA cost monitored',
  }),
  vessel('cape-pioneer', 'Cape Pioneer', {
    imo: '9723145', built: '2016', dwt: '108400', flag: 'Panama',
    nextSurvey: '2028-11-01', strategyAlignment: '55', status: 'watch',
    note: 'Allowance cost trending up',
  }),
  vessel('orion', 'Orion', {
    imo: '9831226', built: '2020', dwt: '114900', flag: 'Liberia',
    nextSurvey: '2030-08-01', strategyAlignment: '91', status: 'aligned',
  }),

  // Meridian historical decisions (4)
  decision('decision-no-scrubber-2018', 'No scrubber fitted (2018)', {
    decidedAt: '2018-05-10', vessel: 'meridian',
    rationale: 'Fuel spread expected to narrow; capex not justified',
  }),
  decision('decision-long-charter-2021', 'Long-term charter re-let (2021)', {
    decidedAt: '2021-09-22', vessel: 'meridian',
    rationale: 'Terms sensible only if 2018 no-scrubber bet held',
  }),
  decision('decision-refinanced-2023', 'Refinanced against residual-value glide (2023)', {
    decidedAt: '2023-04-14', vessel: 'meridian',
    rationale: 'Refi premised on rates settling below plan',
  }),
  decision('decision-comply-via-allowances-2025', 'Comply via allowances (2025)', {
    decidedAt: '2025-01-15', vessel: 'meridian',
    rationale: 'Meet EU ETS exposure via EUA purchase rather than retrofit',
  }),

  // Meridian assumptions (8) — ageingState carries the lifecycle.
  // Article timeline: 2018 cohort expired; 2021 cohort one ageing/one fresh;
  // 2023 cohort one expired/one ageing; 2025 cohort one expired/one ageing.
  assumption('assumption-fuel-spread-narrows', 'Fuel spread narrows', {
    ageingState: 'expired', cohort: '2018', vessel: 'meridian',
    falsifiedAt: '2020-04', evidence: 'doc-fuel-spread-analyst-2024',
  }),
  assumption('assumption-low-sulphur-premium-small', 'Low-sulphur premium small', {
    ageingState: 'expired', cohort: '2018', vessel: 'meridian',
    falsifiedAt: '2020-04', evidence: 'doc-fuel-spread-analyst-2024',
  }),
  assumption('assumption-charter-rate-holds', 'Charter rate holds at plan', {
    ageingState: 'ageing', cohort: '2021', vessel: 'meridian',
    evidence: 'doc-charter-review-2024',
  }),
  assumption('assumption-counterparty-solid', 'Counterparty solid', {
    ageingState: 'fresh', cohort: '2021', vessel: 'meridian',
  }),
  assumption('assumption-rates-below-plan', 'Refi rates stay below plan', {
    ageingState: 'expired', cohort: '2023', vessel: 'meridian',
    falsifiedAt: '2023-Q3',
  }),
  assumption('assumption-residual-value', 'Residual value glide holds', {
    ageingState: 'ageing', cohort: '2023', vessel: 'meridian',
    evidence: 'doc-broker-valuation-meridian-2026',
  }),
  assumption('assumption-eua-price-stable', 'EUA price stable at 2025 plan', {
    ageingState: 'expired', cohort: '2025', vessel: 'meridian',
    falsifiedAt: '2025-Q4',
  }),
  assumption('assumption-no-retrofit-yet', 'No retrofit needed yet', {
    ageingState: 'ageing', cohort: '2025', vessel: 'meridian',
    note: 'Forced choice at the 2027 dry-dock',
  }),

  // The live Meridian dry-dock gate (the article countdown anchor).
  gate('gate-meridian-drydock-2027', 'Meridian dry-dock window 2027', {
    vessel: 'meridian', kind: 'special-survey', dueDate: '2027-06-15',
    windowOpensMonthsOut: '14', costOutOfCycleMultiplier: '3x',
  }),
  // Other vessels' next gates (for the countdown panel).
  gate('gate-nordic-star-drydock-2028', 'Nordic Star dry-dock 2028', {
    vessel: 'nordic-star', kind: 'special-survey', dueDate: '2028-06-01',
  }),
  gate('gate-cape-pioneer-drydock-2028', 'Cape Pioneer dry-dock 2028', {
    vessel: 'cape-pioneer', kind: 'special-survey', dueDate: '2028-11-01',
  }),
  gate('gate-aurora-drydock-2029', 'Aurora dry-dock 2029', {
    vessel: 'aurora', kind: 'special-survey', dueDate: '2029-02-01',
  }),
  gate('gate-orion-drydock-2030', 'Orion dry-dock 2030', {
    vessel: 'orion', kind: 'special-survey', dueDate: '2030-08-01',
  }),

  // Deferred items parked at the Meridian 2027 gate.
  deferredItem('item-scrubber-retrofit', 'Scrubber retrofit (Meridian)', {
    vessel: 'meridian', deferredSince: '2018',
    cheapWindowMultiplierIfMissed: '3x', urgency: 'urgent',
  }),
  deferredItem('item-ballast-water-treatment', 'Ballast-water treatment (Meridian)', {
    vessel: 'meridian', kind: 'compliance', urgency: 'due',
  }),
  deferredItem('item-fuel-system-prep', 'Fuel-system preparation (Meridian)', {
    vessel: 'meridian', kind: 'future-fuel readiness', urgency: 'planning',
  }),

  // Projection cones (one per vessel). breachedAt marks the Meridian.
  projection('projection-meridian-lifetime-earnings', 'Meridian lifetime earnings projection', {
    vessel: 'meridian', baselineYear: '2018',
    originalForecastEndYear: '2030',
    uncertaintyBandPct: '15',
    actualsSeriesStart: '2018',
    breachedAt: '2023-Q2',
    status: 'review-requested',
    rebaselined: 'false',
  }),
  projection('projection-aurora-lifetime-earnings', 'Aurora lifetime earnings projection', {
    vessel: 'aurora', baselineYear: '2018', status: 'within-band',
  }),
  projection('projection-nordic-star-lifetime-earnings', 'Nordic Star lifetime earnings projection', {
    vessel: 'nordic-star', baselineYear: '2017', status: 'within-band',
  }),
  projection('projection-cape-pioneer-lifetime-earnings', 'Cape Pioneer lifetime earnings projection', {
    vessel: 'cape-pioneer', baselineYear: '2016', status: 'on-lower-edge',
  }),
  projection('projection-orion-lifetime-earnings', 'Orion lifetime earnings projection', {
    vessel: 'orion', baselineYear: '2020', status: 'within-band',
  }),

  // Regulations (the agent cites these when ageing assumptions).
  regulation('eu-ets-shipping', 'EU ETS — shipping coverage', {
    jurisdiction: 'EU', phase2024: '40', phase2025: '70', phase2026: '100',
  }),
  regulation('fueleu-maritime', 'FuelEU Maritime', {
    jurisdiction: 'EU', step2025: '-2', step2030: '-6', step2035: '-14.5',
    step2040: '-31', step2050: '-80',
  }),
  regulation('imo-2027-framework', 'IMO 2027 net-zero framework', {
    jurisdiction: 'global', adoptedYear: '2025', entryIntoForce: '2027',
    status: 'implementation-details-settling',
  }),
  regulation('marpol-annex-vi', 'MARPOL Annex VI — air pollution', {
    jurisdiction: 'global', sulphurCapGlobal_pct: '0.50',
  }),

  // Counterparties + yards (light — just enough to attach).
  counterparty('charter-counterparty-meridian', 'Meridian charterer (AA-rated)', {
    creditRating: 'AA', sinceYear: '2021',
  }),
  yard('yard-meridian-2027', 'Yard slot — Meridian 2027 dry-dock', {
    location: 'Singapore', slotConfirmed: 'true',
  }),
];

// --- relationships ------------------------------------------------------

export const KG_RELATIONSHIPS: RelationshipDraft[] = [
  // Decisions belong to vessels.
  { subject: 'decision-no-scrubber-2018', predicate: 'concernsVessel', object: 'meridian' },
  { subject: 'decision-long-charter-2021', predicate: 'concernsVessel', object: 'meridian' },
  { subject: 'decision-refinanced-2023', predicate: 'concernsVessel', object: 'meridian' },
  { subject: 'decision-comply-via-allowances-2025', predicate: 'concernsVessel', object: 'meridian' },

  // Decisions derived from assumptions (the load-bearing dependency chain).
  { subject: 'decision-no-scrubber-2018', predicate: 'derivedFrom', object: 'assumption-fuel-spread-narrows' },
  { subject: 'decision-no-scrubber-2018', predicate: 'derivedFrom', object: 'assumption-low-sulphur-premium-small' },
  { subject: 'decision-long-charter-2021', predicate: 'derivedFrom', object: 'assumption-charter-rate-holds' },
  { subject: 'decision-long-charter-2021', predicate: 'derivedFrom', object: 'assumption-counterparty-solid' },
  { subject: 'decision-refinanced-2023', predicate: 'derivedFrom', object: 'assumption-rates-below-plan' },
  { subject: 'decision-refinanced-2023', predicate: 'derivedFrom', object: 'assumption-residual-value' },
  { subject: 'decision-comply-via-allowances-2025', predicate: 'derivedFrom', object: 'assumption-eua-price-stable' },
  { subject: 'decision-comply-via-allowances-2025', predicate: 'derivedFrom', object: 'assumption-no-retrofit-yet' },

  // Gates concern vessels.
  { subject: 'gate-meridian-drydock-2027', predicate: 'concernsVessel', object: 'meridian' },
  { subject: 'gate-nordic-star-drydock-2028', predicate: 'concernsVessel', object: 'nordic-star' },
  { subject: 'gate-cape-pioneer-drydock-2028', predicate: 'concernsVessel', object: 'cape-pioneer' },
  { subject: 'gate-aurora-drydock-2029', predicate: 'concernsVessel', object: 'aurora' },
  { subject: 'gate-orion-drydock-2030', predicate: 'concernsVessel', object: 'orion' },

  // Deferred items parked at the Meridian gate.
  { subject: 'item-scrubber-retrofit', predicate: 'parkedAt', object: 'gate-meridian-drydock-2027' },
  { subject: 'item-ballast-water-treatment', predicate: 'parkedAt', object: 'gate-meridian-drydock-2027' },
  { subject: 'item-fuel-system-prep', predicate: 'parkedAt', object: 'gate-meridian-drydock-2027' },

  // The scrubber retrofit is the negation of the 2018 decision — flag it.
  { subject: 'item-scrubber-retrofit', predicate: 'reopens', object: 'decision-no-scrubber-2018' },

  // Projections cover vessels.
  { subject: 'projection-meridian-lifetime-earnings', predicate: 'covers', object: 'meridian' },
  { subject: 'projection-aurora-lifetime-earnings', predicate: 'covers', object: 'aurora' },
  { subject: 'projection-nordic-star-lifetime-earnings', predicate: 'covers', object: 'nordic-star' },
  { subject: 'projection-cape-pioneer-lifetime-earnings', predicate: 'covers', object: 'cape-pioneer' },
  { subject: 'projection-orion-lifetime-earnings', predicate: 'covers', object: 'orion' },

  // Regulatory impact — drives the assumption ageing rationale.
  { subject: 'eu-ets-shipping', predicate: 'impacts', object: 'assumption-eua-price-stable' },
  { subject: 'fueleu-maritime', predicate: 'impacts', object: 'assumption-no-retrofit-yet' },
  { subject: 'imo-2027-framework', predicate: 'impacts', object: 'assumption-no-retrofit-yet' },
  { subject: 'marpol-annex-vi', predicate: 'impacts', object: 'assumption-fuel-spread-narrows' },

  // Counterparty / yard.
  { subject: 'charter-counterparty-meridian', predicate: 'partyTo', object: 'decision-long-charter-2021' },
  { subject: 'yard-meridian-2027', predicate: 'hostsGate', object: 'gate-meridian-drydock-2027' },
];
