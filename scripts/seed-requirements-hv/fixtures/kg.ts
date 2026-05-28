/**
 * Knowledge-graph seed for the requirements-hv project.
 *
 * A representative slice of the bid: ~40 EARS-normalised requirements
 * spanning the source volumes, plus the source-volume nodes themselves,
 * the late-clarifications memo, ~6 reuse-source nodes (past specifications
 * and type-test reports), the relevant standards (NC-HVDC, BNetzA-TAB-HS,
 * IEC 62271 / 61850 / 60076), and the responsible-engineer nodes.
 *
 * The article's two load-bearing cases are wired up:
 *  - REQ-247 (FRT-250ms) → draftedFrom Northshore-2022 MMC + type-test.
 *  - REQ-184 (reactive-power range) is overridden by the 2026-04-18
 *    late-clarifications memo (separate node, explicit `overrides` edge).
 *  - REQ-303 through REQ-307 are draftedFrom Reefnet-2020 but Reefnet's
 *    THD ≤ 1.5% does not meet NSÜN's 0.9% Annex-C limit — the seed's
 *    cascade case (analogous to long-horizon's Refuted→cascade).
 *
 * Wire types are restricted to Person|Company|Product|Document — the real
 * domain type is carried in properties.domainType (same convention as the
 * long-horizon-commitments and desalination seeds).
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

const requirement = (
  id: string,
  ears: string,
  extra: Record<string, string> = {},
): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Requirement', label: id, ears, ...extra },
});

const sourceVolume = (
  id: string,
  label: string,
  extra: Record<string, string> = {},
): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'SourceVolume', label, ...extra },
});

const clarification = (
  id: string,
  label: string,
  extra: Record<string, string> = {},
): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'LateClarification', label, ...extra },
});

const reuseSource = (
  id: string,
  label: string,
  extra: Record<string, string> = {},
): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'ReuseSource', label, ...extra },
});

const standard = (
  id: string,
  label: string,
  extra: Record<string, string> = {},
): EntityDraft => ({
  id,
  type: 'Document',
  properties: { domainType: 'Standard', label, ...extra },
});

const engineer = (
  id: string,
  label: string,
  extra: Record<string, string> = {},
): EntityDraft => ({
  id,
  type: 'Person',
  properties: { domainType: 'Engineer', label, ...extra },
});

const customer = (
  id: string,
  label: string,
  extra: Record<string, string> = {},
): EntityDraft => ({
  id,
  type: 'Company',
  properties: { domainType: 'Customer', label, ...extra },
});

// --- entities -----------------------------------------------------------

const ENTITIES_CUSTOMER_ENGINEERS: EntityDraft[] = [
  customer('customer-nsun', 'Nordseeübertragungs-Netz GmbH (NSÜN)', {
    role: 'transmission system operator',
    country: 'DE',
  }),
  engineer('engineer-anke-vogt', 'Anke Vogt', {
    role: 'principal engineer — controls & protection',
    responsibility: 'REQ-241..268',
  }),
  engineer('engineer-bernd-haag', 'Bernd Haag', {
    role: 'principal engineer — power-quality',
    responsibility: 'REQ-301..308 (Annex C)',
  }),
  engineer('engineer-clara-mueller', 'Clara Müller', {
    role: 'lead engineer — primary equipment',
    responsibility: 'REQ-101..184 (Volume 1 + Annex A)',
  }),
  engineer('engineer-dirk-stein', 'Dirk Stein', {
    role: 'proposal-desk lead',
    responsibility: 'coverage + commit-gate G3',
  }),
];

const ENTITIES_STANDARDS: EntityDraft[] = [
  standard('std-nc-hvdc', 'EU Regulation 2016/1447 — NC-HVDC', {
    bindingForBid: 'true',
  }),
  standard('std-bnetza-tab-hs-2024', 'BNetzA TAB-HS 2024', {
    bindingForBid: 'true',
    countryOverlay: 'DE',
  }),
  standard('std-iec-62271-1', 'IEC 62271-1 — High-voltage switchgear (common)', {
    domain: 'switchgear',
  }),
  standard('std-iec-62271-302', 'IEC 62271-302 — Switchgear (DC-side)', {
    domain: 'switchgear',
  }),
  standard('std-iec-61850', 'IEC 61850 — Substation communications', {
    domain: 'protection-control',
  }),
  standard('std-iec-60076', 'IEC 60076 — Power transformers', {
    domain: 'converter-transformers',
  }),
  standard('std-iec-60633', 'IEC 60633 — HVDC terminology', {
    domain: 'glossary',
  }),
  standard('std-iec-60919', 'IEC 60919 — HVDC system planning', {
    domain: 'system-planning',
  }),
];

const ENTITIES_SOURCE_VOLUMES: EntityDraft[] = [
  sourceVolume('source-volume-0-general-conditions', 'Volume 0 — General conditions', {
    pages: '42',
    language: 'de',
  }),
  sourceVolume('source-volume-1-functional-spec', 'Volume 1 — Functional specification', {
    pages: '218',
    language: 'de',
  }),
  sourceVolume('source-volume-2-annex-a-electrical-performance', 'Volume 2 — Annex A: Electrical performance', {
    pages: '156',
    language: 'de',
  }),
  sourceVolume('source-volume-3-annex-b-protection-control', 'Volume 3 — Annex B: Protection & control', {
    pages: '184',
    language: 'de',
  }),
  sourceVolume('source-volume-4-annex-c-harmonics', 'Volume 4 — Annex C: Harmonics & power-quality limits', {
    pages: '94',
    language: 'de',
  }),
  sourceVolume('source-volume-5-annex-def-auxiliaries', 'Volume 5 — Annex D-F: Auxiliaries, cooling, civil', {
    pages: '128',
    language: 'de',
  }),
  sourceVolume('source-volume-6-grid-code', 'Volume 6 — Grid-code compliance', {
    pages: '76',
    language: 'de',
  }),
  clarification('source-late-clarifications-2026-04-18', 'Late clarifications memo (2026-04-18)', {
    pages: '14',
    amendsClauses: '41',
    arrivedAfterQuestionsWindowClosed: 'true',
  }),
];

const ENTITIES_REUSE_SOURCES: EntityDraft[] = [
  reuseSource('reuse-northshore-2022-mmc-control', 'Northshore-2022 — MMC control scheme', {
    project: 'Northshore HVDC link, 2022',
    language: 'en',
    answers: 'REQ-241..254, REQ-261..268, REQ-247',
  }),
  reuseSource('reuse-northshore-2022-frt-type-test', 'Northshore-2022 — FRT type-test report', {
    project: 'Northshore HVDC link, 2022',
    language: 'en',
    answers: 'REQ-247',
    certifiedProfile: '3-phase fully-depressed-voltage, 250 ms ride-through',
  }),
  reuseSource('reuse-capeline-2023-protection', 'Capeline-2023 — Protection philosophy', {
    project: 'Capeline HVDC tie, 2023',
    language: 'en',
    answers: 'REQ-201..238 (Annex B)',
  }),
  reuseSource('reuse-reefnet-2020-harmonic-filters', 'Reefnet-2020 — Harmonic filter design', {
    project: 'Reefnet offshore connection, 2020',
    language: 'en',
    answers: 'REQ-301..308 (Annex C)',
    thdAchieved: '1.5%',
    nsunThdRequired: '0.9%',
    mismatch: 'true',
  }),
  reuseSource('reuse-aurora-2024-reactive-power', 'Aurora-2024 — Reactive-power capability curve', {
    project: 'Aurora HVDC bipole, 2024',
    language: 'en',
    answers: 'REQ-181..184',
  }),
  reuseSource('reuse-internal-german-style-guide', 'Internal — German technical-spec style guide', {
    project: 'cross-project',
    language: 'de',
    governs: 'translation step',
  }),
];

// --- 40 EARS requirements distributed across volumes -------------------
//
// State distribution chosen for a realistic in-progress bid (~40 of a
// notional 1,800):
//   committed: 10
//   drafted:   12
//   reviewed:  6
//   deviation: 3
//   clarify:   3
//   open:      6
//   (override flag is orthogonal: REQ-184 is drafted + override)
//   (reuseMismatch flag is orthogonal: REQ-303..307 are drafted + mismatch)

const ENTITIES_REQUIREMENTS: EntityDraft[] = [
  // --- Volume 1 — Functional specification (REQ-101..184) -----
  requirement('REQ-101', 'The converter station shall be designed for a continuous rated DC voltage of ±525 kV.', {
    state: 'committed',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §2.1',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-102', 'The converter station shall be designed for a continuous rated active-power transfer of 2 GW.', {
    state: 'committed',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §2.2',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-103', 'The converter station shall be capable of bidirectional active-power transfer at the rated 2 GW in both directions.', {
    state: 'committed',
    // Mindestanforderung — bidirectional 2 GW is a knock-out criterion in
    // §2.3 of the TKW (Technische Kennwerte). Already committed so the
    // gate stays happy on this row.
    isKnockout: 'true',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §2.3',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-104', 'The converter shall use modular-multilevel-converter (MMC) topology.', {
    state: 'committed',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §3.1',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-119', 'The station shall be designed for adequate seismic resilience where appropriate.', {
    state: 'clarify',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §4.7',
    clarifyReason: 'No seismic zone or DIN/EN 1998-1 ground type cited — ambiguous as authored.',
    responsibleEngineer: 'engineer-clara-mueller',
    // EARS structural fields — populated so the Phase-1 validator can fire
    // both vague-modal (`where appropriate`) and missing-measurable
    // (`adequate` with no number/unit in the constraint).
    earsType: 'ubiquitous',
    action: 'design for seismic resilience',
    constraint: 'adequate',
    ambiguityFlag: 'true',
    ambiguityNotes: 'No seismic zone (e.g. DIN EN 1998-1 ground type) is cited',
  }),
  requirement('REQ-141', 'The converter shall provide black-start capability when the offshore wind farm is offline.', {
    state: 'drafted',
    loadBearing: 'true',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §5.4',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-142', 'When islanded operation is initiated, the converter shall establish AC voltage and frequency within 200 ms.', {
    state: 'drafted',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §5.5',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
    // EARS structural fields — fully populated so the validator
    // confirms it has nothing to flag (the "happy path" reference).
    earsType: 'event_driven',
    trigger: 'When islanded operation is initiated',
    action: 'establish AC voltage and frequency',
    constraint: 'within 200 ms',
  }),
  // Phase-1 demo row: intentionally compound — "X and also Y" — so the
  // splitter produces two atoms (REQ-143-a / REQ-143-b) and the cockpit
  // can show splitFrom provenance. State stays `open` since splitting
  // changes what an engineer has to commit to.
  requirement('REQ-143', 'When islanded operation ends, the converter shall resynchronise to the AC grid and shall also restore reactive-power support within 500 ms.', {
    state: 'open',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §5.6',
    responsibleEngineer: 'engineer-anke-vogt',
    earsType: 'event_driven',
    trigger: 'When islanded operation ends',
    action: 'resynchronise to the AC grid; restore reactive-power support',
    constraint: 'within 500 ms',
  }),
  // Phase-1 demo row: deliberately event_driven *without* a trigger so
  // the validator fires `missing-trigger`. Authored as a real bid hazard
  // — a clause that reads like a trigger but never declares one.
  requirement('REQ-144', 'The converter shall trip the protection within 80 ms.', {
    state: 'open',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §5.7',
    responsibleEngineer: 'engineer-bernd-haag',
    earsType: 'event_driven',
    trigger: '',
    action: 'trip the protection',
    constraint: 'within 80 ms',
    ambiguityFlag: 'true',
    ambiguityNotes: 'The triggering fault condition is not specified — under-voltage, over-current, or differential?',
  }),
  requirement('REQ-181', 'The converter shall be capable of operating at any point inside the PQ-capability envelope defined in Annex A §3.', {
    state: 'committed',
    loadBearing: 'true',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §6.2',
    draftedFrom: 'reuse-aurora-2024-reactive-power',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-182', 'The converter shall provide continuous reactive-power support at full active-power output.', {
    state: 'reviewed',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §6.3',
    draftedFrom: 'reuse-aurora-2024-reactive-power',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-183', 'The converter shall maintain reactive-power capability across the full operating temperature range specified in Annex D.', {
    state: 'drafted',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §6.4',
    draftedFrom: 'reuse-aurora-2024-reactive-power',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-184', 'The converter shall provide reactive-power range of ±0.90 leading / ±0.95 lagging at full active-power output, as amended by the 2026-04-18 clarifications memo.', {
    state: 'drafted',
    overrideFlag: 'true',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §6.5 (amended)',
    draftedFrom: 'reuse-aurora-2024-reactive-power',
    responsibleEngineer: 'engineer-clara-mueller',
    overrideNote: 'Original ±0.95/±0.95 replaced by ±0.90 leading / ±0.95 lagging. Reuse passage answered the original; draft needs adapting.',
  }),

  // --- Volume 2 — Annex A (REQ-201..247, electrical performance + FRT) -----
  requirement('REQ-201', 'The converter shall meet the steady-state voltage tolerance of ±10% of nominal.', {
    state: 'committed',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §2.1',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-202', 'When grid frequency deviates outside 49.5–50.5 Hz, the converter shall provide frequency-response active-power modulation per NC-HVDC Article 11.', {
    state: 'reviewed',
    loadBearing: 'true',
    // Grid-code compliance is a textbook Ausschlusskriterium — NC-HVDC
    // Article 11 is referenced in the TKW as "ohne Ausnahme". Reviewed
    // but not yet committed → caution-level rather than no-go.
    isKnockout: 'true',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §2.3',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-241', 'The converter shall track an active-power setpoint with steady-state error not exceeding 0.5% of rating.', {
    state: 'drafted',
    loadBearing: 'true',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §6.1',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-242', 'When an active-power setpoint change of ≤500 MW is commanded, the converter shall achieve the new setpoint within 1.0 s.', {
    state: 'drafted',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §6.2',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-243', 'The active-power ramp rate shall be configurable between 100 MW/min and 1500 MW/min.', {
    state: 'reviewed',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §6.3',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-247', 'When a three-phase fully-depressed-voltage fault occurs at the converter AC bus, the converter shall remain connected and resume pre-fault active-power output within 250 ms.', {
    state: 'drafted',
    loadBearing: 'true',
    // FRT 250 ms is the Mindestanforderung in Annex A §7.4.3 (cf.
    // footnote 2 cross-referencing NC-HVDC Art. 13). Currently in
    // `drafted` so this is the row that will surface the gate's
    // headline no-go reason in the cockpit banner.
    isKnockout: 'true',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §7.4.3, footnote 2',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    typeTestEvidence: 'reuse-northshore-2022-frt-type-test',
    responsibleEngineer: 'engineer-anke-vogt',
    storyNote: 'The article\'s headline find — a single shall under a harmonics table.',
  }),
  requirement('REQ-251', 'The converter shall achieve a reactive-power setpoint change of ±200 MVAr within 100 ms.', {
    state: 'drafted',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §8.1',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-252', 'The converter shall damp sub-synchronous oscillations across the 2–15 Hz band with damping ratio ≥ 0.10.', {
    state: 'open',
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §8.4',
    responsibleEngineer: 'engineer-anke-vogt',
  }),

  // --- Volume 3 — Annex B (protection & control, REQ-261..238) -----
  // Phase-4 dedup demo: REQ-210 paraphrases REQ-101 (Vol.1 §2.1 rated DC
  // voltage). Same clause, different volume — the kind of cross-volume
  // restatement that clogs a 1 200-row matrix.
  requirement('REQ-210', 'The protection scheme shall be coordinated for continuous operation at the rated DC voltage of ±525 kV across the converter station.', {
    state: 'drafted',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §1.2',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-211', 'The protection system shall include redundant differential protection per IEC 61850-9-2.', {
    state: 'committed',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §2.1',
    draftedFrom: 'reuse-capeline-2023-protection',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-212', 'Protection trip signals shall be delivered to the converter within 5 ms of fault detection.', {
    state: 'committed',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §2.4',
    draftedFrom: 'reuse-capeline-2023-protection',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-219', 'Where a black-start signal is asserted, the control system shall arbitrate priority between protection-trip and black-start commands per the priority table in Annex B §4.', {
    state: 'reviewed',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §4.2',
    draftedFrom: 'reuse-capeline-2023-protection',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-221', 'The control system shall log all setpoint changes with millisecond-precision timestamps and a tamper-evident hash chain.', {
    state: 'drafted',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §5.3',
    draftedFrom: 'reuse-capeline-2023-protection',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-238', 'If an inter-station communications link fails, then the converter shall fall back to autonomous-control mode within 200 ms without tripping.', {
    state: 'deviation',
    deviationRationale: 'Capeline-2023 design fails over within 250 ms; tightening to 200 ms requires a control-card change that is not type-tested. Formally deviating and proposing 220 ms.',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §7.6',
    draftedFrom: 'reuse-capeline-2023-protection',
    responsibleEngineer: 'engineer-anke-vogt',
  }),

  // --- Volume 4 — Annex C (harmonics, REQ-301..308) — the reuse-mismatch cluster -----
  requirement('REQ-301', 'The converter station shall meet the harmonic-current emission limits in Table C.1.', {
    state: 'drafted',
    reuseMismatch: 'true',
    sourceVolume: 'source-volume-4-annex-c-harmonics',
    sourceLocation: 'Annex C §3.1',
    draftedFrom: 'reuse-reefnet-2020-harmonic-filters',
    responsibleEngineer: 'engineer-bernd-haag',
  }),
  requirement('REQ-302', 'The converter station shall meet the harmonic-voltage distortion limits in Table C.2.', {
    state: 'drafted',
    sourceVolume: 'source-volume-4-annex-c-harmonics',
    sourceLocation: 'Annex C §3.2',
    draftedFrom: 'reuse-reefnet-2020-harmonic-filters',
    responsibleEngineer: 'engineer-bernd-haag',
  }),
  requirement('REQ-303', 'Total harmonic distortion at the point of common coupling shall not exceed 0.9% at any operating point.', {
    state: 'drafted',
    reuseMismatch: 'true',
    loadBearing: 'true',
    sourceVolume: 'source-volume-4-annex-c-harmonics',
    sourceLocation: 'Annex C §3.3',
    draftedFrom: 'reuse-reefnet-2020-harmonic-filters',
    responsibleEngineer: 'engineer-bernd-haag',
    mismatchNote: 'Reefnet-2020 delivered THD ≤ 1.5%; this requirement is 0.9%. Cluster head — REQ-304/305/307 depend on the same filter topology.',
  }),
  requirement('REQ-304', 'The harmonic filters shall be designed to remain effective across the full operating temperature range specified in Annex D.', {
    state: 'drafted',
    reuseMismatch: 'true',
    sourceVolume: 'source-volume-4-annex-c-harmonics',
    sourceLocation: 'Annex C §4.2',
    draftedFrom: 'reuse-reefnet-2020-harmonic-filters',
    responsibleEngineer: 'engineer-bernd-haag',
  }),
  requirement('REQ-305', 'Harmonic-filter components shall be sourced from suppliers qualified per Annex C §5.', {
    state: 'drafted',
    reuseMismatch: 'true',
    sourceVolume: 'source-volume-4-annex-c-harmonics',
    sourceLocation: 'Annex C §5.1',
    draftedFrom: 'reuse-reefnet-2020-harmonic-filters',
    responsibleEngineer: 'engineer-bernd-haag',
  }),
  requirement('REQ-307', 'The harmonic-filter losses shall not exceed 0.15% of station rated power averaged across the operating envelope.', {
    state: 'drafted',
    reuseMismatch: 'true',
    sourceVolume: 'source-volume-4-annex-c-harmonics',
    sourceLocation: 'Annex C §5.6',
    draftedFrom: 'reuse-reefnet-2020-harmonic-filters',
    responsibleEngineer: 'engineer-bernd-haag',
  }),
  requirement('REQ-308', 'Harmonic-emission compliance shall be verified by site-acceptance measurement per IEC 61000-4-7.', {
    state: 'committed',
    sourceVolume: 'source-volume-4-annex-c-harmonics',
    sourceLocation: 'Annex C §6.1',
    draftedFrom: 'reuse-reefnet-2020-harmonic-filters',
    responsibleEngineer: 'engineer-bernd-haag',
  }),

  // --- Volume 5 — Annex D-F (auxiliaries, cooling, civil) -----
  requirement('REQ-376', 'The auxiliaries of the reserve line ("Hilfsbetriebe der Reservelinie") shall be supplied from a separate AC auxiliary bus.', {
    state: 'clarify',
    sourceVolume: 'source-volume-5-annex-def-auxiliaries',
    sourceLocation: 'Annex D §2.4',
    clarifyReason: 'Scope ambiguity: term is used inconsistently in Annexes D and E. Clarify whether the cooling-skid auxiliaries are included.',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-411', 'The civil-works HVAC system shall be designed for ambient temperature range -25°C to +40°C.', {
    state: 'clarify',
    sourceVolume: 'source-volume-5-annex-def-auxiliaries',
    sourceLocation: 'Annex E §3.1',
    clarifyReason: 'Implicit contradiction: the 2026-04-18 clarifications memo cites -30°C in the heat-rejection clause. Clarify which prevails.',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-433', 'The fire-suppression system in the converter hall shall be inert-gas based per VdS CEA 4001.', {
    state: 'deviation',
    deviationRationale: 'Our standard suppression system is water-mist per FM Global 5560. Formally deviating with type-test evidence; commercially neutral.',
    sourceVolume: 'source-volume-5-annex-def-auxiliaries',
    sourceLocation: 'Annex E §6.2',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-451', 'The cooling-water system shall be designed for closed-loop operation with ≥ 99.5% availability.', {
    state: 'open',
    sourceVolume: 'source-volume-5-annex-def-auxiliaries',
    sourceLocation: 'Annex F §1.4',
    responsibleEngineer: 'engineer-clara-mueller',
  }),

  // --- Volume 6 — Grid-code compliance -----
  requirement('REQ-601', 'The converter station shall comply with all mandatory provisions of EU Regulation 2016/1447 (NC-HVDC).', {
    state: 'committed',
    sourceVolume: 'source-volume-6-grid-code',
    sourceLocation: 'Vol.6 §1.1',
    responsibleEngineer: 'engineer-dirk-stein',
  }),
  requirement('REQ-602', 'The converter station shall comply with the BNetzA TAB-HS 2024 country-specific overlays.', {
    state: 'reviewed',
    sourceVolume: 'source-volume-6-grid-code',
    sourceLocation: 'Vol.6 §1.2',
    responsibleEngineer: 'engineer-dirk-stein',
  }),
  // Phase-4 dedup demo: REQ-605 restates the rated DC voltage in a
  // grid-code context. Buyers commonly repeat the headline rating in
  // every volume — this is the third member of the REQ-101 / REQ-210
  // / REQ-605 cluster the dedup pass should surface.
  requirement('REQ-605', 'The HVDC converter station shall maintain continuous operation at the rated ±525 kV DC voltage in accordance with the grid code.', {
    state: 'open',
    sourceVolume: 'source-volume-6-grid-code',
    sourceLocation: 'Vol.6 §2.3',
    responsibleEngineer: 'engineer-dirk-stein',
  }),
  requirement('REQ-603', 'Compliance evidence shall be presented in the compliance matrix shipped inside the technical specification, with traceable IDs.', {
    state: 'committed',
    sourceVolume: 'source-volume-6-grid-code',
    sourceLocation: 'Vol.6 §1.4',
    responsibleEngineer: 'engineer-dirk-stein',
  }),
  requirement('REQ-621', 'Where IEEE 1547 is cited in Annex E, it shall be treated as informative only; the binding standard is the BNetzA TAB-HS.', {
    state: 'reviewed',
    sourceVolume: 'source-volume-6-grid-code',
    sourceLocation: 'Vol.6 §4.2',
    responsibleEngineer: 'engineer-dirk-stein',
  }),

  // --- A few open rows to populate the dashboard -----
  requirement('REQ-901', 'The station shall be commissioned per the staged plan in Annex F §9.', {
    state: 'open',
    sourceVolume: 'source-volume-5-annex-def-auxiliaries',
    sourceLocation: 'Annex F §9.1',
    responsibleEngineer: 'engineer-dirk-stein',
  }),
  requirement('REQ-902', 'When a station-wide protection event occurs, an event report shall be generated within 30 s.', {
    state: 'open',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §9.2',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-903', 'The station shall support remote configuration of all setpoints via IEC 61850 MMS services.', {
    state: 'open',
    sourceVolume: 'source-volume-3-annex-b-protection-control',
    sourceLocation: 'Annex B §10.3',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-904', 'All firmware in safety-critical control devices shall be type-approved per BNetzA TAB-HS 2024 §11.', {
    state: 'open',
    sourceVolume: 'source-volume-6-grid-code',
    sourceLocation: 'Vol.6 §5.3',
    responsibleEngineer: 'engineer-anke-vogt',
  }),

  // ─── Bulk fill: additional EARS requirements to bring the demo to ~148 ───
  //
  // Authored in the same shape as the load-bearing rows above, distributed
  // across volumes / engineers / states so the cockpit's filters land on
  // realistic counts. No new chips or KG cross-edges — these are filler
  // mass for the cockpit, not new narrative.

  // --- Volume 1 — Functional spec (REQ-105..170, 35 rows) -----
  requirement('REQ-105', 'The converter station shall be configured as a symmetrical monopole.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.2', draftedFrom: 'reuse-northshore-2022-mmc-control', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-106', 'The converter station shall be designed for an operating life of 40 years.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.3', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-107', 'The converter station shall support unmanned operation with remote supervision from the dispatch centre.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.4', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-108', 'The converter station shall support remote diagnostics via the IEC 60870-5-104 protocol.', { state: 'reviewed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.5', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-109', 'The converter station shall maintain operational availability of ≥ 99.0% per calendar year.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.6', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-110', 'The converter station shall provide a 6-hour energy autonomy of station auxiliaries under loss of off-site supply.', { state: 'open', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.7', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-111', 'The DC-side return path shall be implemented as a metallic neutral conductor.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.8', draftedFrom: 'reuse-northshore-2022-mmc-control', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-112', 'The AC switchyard shall be configured as a double-busbar arrangement.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.9', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-113', 'The AC switchyard shall include redundant disconnectors per outgoing feeder.', { state: 'reviewed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.10', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-114', 'The DC switchgear shall include hybrid HVDC breakers per pole.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.11', draftedFrom: 'reuse-northshore-2022-mmc-control', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-115', 'The control-room HMI shall present a single-line diagram of the AC and DC switchgear.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.12', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-116', 'The HMI shall present alarms classified into emergency, urgent, and routine categories.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.13', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-117', 'The HMI shall record every operator setpoint change with the operator id, timestamp, and the prior value.', { state: 'reviewed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.14', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-118', 'The HMI shall enforce two-person authorisation for setpoint changes that affect protection coordination.', { state: 'open', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §3.15', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-121', 'Buildings shall be designed to withstand a 1-in-200-year wind load.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §4.8', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-122', 'Buildings shall meet the fire-protection requirements of DIN 4102 class A2.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §4.9', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-123', 'The civil works shall accommodate a future second bipole on the same site.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §4.10', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-124', 'Outdoor equipment shall be specified for an ambient temperature of -25 °C to +40 °C.', { state: 'clarify', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §4.11', clarifyReason: 'Conflicts with the 2026-04-18 clarifications memo which cites -30 °C for the heat-rejection clause.', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-131', 'The converter shall provide a black-start commissioning mode.', { state: 'reviewed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.1', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-132', 'When commissioning mode is active, the converter shall refuse setpoint changes from the dispatch centre.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.2', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-133', 'The converter shall log the entry to and exit from commissioning mode with cryptographic integrity.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.3', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-134', 'The black-start sequence shall reach 10% rated active power within 90 s of arming.', { state: 'open', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.6', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-135', 'The black-start sequence shall reach rated active power within 30 min of arming.', { state: 'open', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.7', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-151', 'The control system shall support N-1 redundancy of the central control unit.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.10', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-152', 'Failover between redundant control units shall complete within 50 ms without active-power interruption.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.11', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-153', 'The control system shall be hardened against the IEC 62443 SL-3 security level.', { state: 'reviewed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.12', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-154', 'All software updates shall be cryptographically signed and verified at boot.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.13', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-155', 'Where a software update fails verification, the control system shall revert to the previous version.', { state: 'open', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §5.14', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-161', 'Civil works shall be sized for the noise emission limits in TA-Lärm category III at the site boundary.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §6.1', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-162', 'Cooling-tower noise shall not exceed 45 dB(A) at the nearest residence by night.', { state: 'reviewed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §6.2', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-163', 'Transformer noise shall not exceed 80 dB(A) at 2 m at rated load.', { state: 'drafted', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §6.3', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-164', 'The site shall be illuminated for safe night-time operation per DIN EN 12464-2.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §6.4', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-165', 'Lighting shall be controlled to minimise light pollution towards the neighbouring nature reserve.', { state: 'open', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §6.5', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-166', 'The site shall include a permanent grounding grid bonded to all metallic structures.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §6.6', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-168', 'Lightning protection shall be designed per IEC 62305 protection level I.', { state: 'committed', sourceVolume: 'source-volume-1-functional-spec', sourceLocation: 'Vol.1 §6.8', responsibleEngineer: 'engineer-clara-mueller' }),

  // --- Volume 2 — Annex A: Electrical performance (REQ-203..258, 20 rows) -----
  requirement('REQ-203', 'When grid frequency deviates outside 47.5–51.5 Hz, the converter shall remain connected for at least 30 s.', { state: 'committed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §2.4', draftedFrom: 'reuse-northshore-2022-mmc-control', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-204', 'When grid frequency falls below 47.5 Hz, the converter shall trip after 200 ms.', { state: 'reviewed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §2.5', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-205', 'The converter shall provide synthetic inertia per NC-HVDC Article 14.', { state: 'drafted', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §2.6', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-206', 'The synthetic inertia gain shall be operator-configurable in the range 2–10 s.', { state: 'drafted', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §2.7', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-207', 'The converter shall provide POD (power oscillation damping) for inter-area modes in the 0.1–1 Hz band.', { state: 'open', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §2.8', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-208', 'The POD function shall be selectable on/off via the dispatch centre.', { state: 'open', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §2.9', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-244', 'The active-power ramp rate during disturbance ride-through shall be limited to 200 MW/s.', { state: 'drafted', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §6.4', draftedFrom: 'reuse-northshore-2022-mmc-control', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-245', 'The converter shall reject step changes in DC voltage of up to ±5% without trip.', { state: 'reviewed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §6.5', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-246', 'When a station-side AC fault occurs, the converter shall remain in service if the residual voltage exceeds 0.15 pu.', { state: 'committed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §6.6', draftedFrom: 'reuse-northshore-2022-frt-type-test', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-248', 'After FRT, the converter shall resume the pre-fault reactive-power setpoint within 200 ms.', { state: 'drafted', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §7.5', draftedFrom: 'reuse-northshore-2022-frt-type-test', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-249', 'Repeated FRT events within a 10 s window shall not derate the converter.', { state: 'reviewed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §7.6', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-253', 'The converter shall arrest sub-synchronous oscillations within 5 s of detection.', { state: 'drafted', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §8.5', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-254', 'The converter shall publish 100 ms-resolution oscillation telemetry to the dispatch centre.', { state: 'committed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §8.6', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-255', 'Telemetry shall be time-synchronised to UTC with an accuracy of ±1 ms.', { state: 'committed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §8.7', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-256', 'Time synchronisation shall be obtained from at least two independent sources.', { state: 'reviewed', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §8.8', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-257', 'Loss of all time sources shall be alarmed but shall not trip the converter.', { state: 'drafted', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §8.9', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-258', 'Telemetry payloads shall be signed end-to-end per IEC 62351-8.', { state: 'open', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §8.10', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-261', 'The converter control shall publish a digital twin for offline training of dispatch operators.', { state: 'open', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §9.1', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-262', 'The digital twin shall match measured behaviour to within 5% on type-test scenarios.', { state: 'open', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §9.2', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-263', 'The digital twin shall be re-validated after every major firmware release.', { state: 'deviation', deviationRationale: 'Type-approval body requires a 6-month validation cycle; bidder proposes 4-month with type-test evidence.', sourceVolume: 'source-volume-2-annex-a-electrical-performance', sourceLocation: 'Annex A §9.3', responsibleEngineer: 'engineer-anke-vogt' }),

  // --- Volume 3 — Annex B: Protection & control (REQ-213..236, 14 rows) -----
  requirement('REQ-213', 'The protection system shall provide overcurrent protection per IEC 61850-7-4 functional logical nodes.', { state: 'committed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §2.5', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-214', 'The protection system shall provide distance protection on the AC connection lines.', { state: 'committed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §2.6', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-215', 'The protection system shall coordinate with the transmission network protection per NC-HVDC §17.', { state: 'reviewed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §2.7', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-216', 'Trip signals shall be recorded as IEC 61850 GOOSE messages with millisecond timestamps.', { state: 'drafted', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §2.8', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-217', 'GOOSE messages shall be delivered between protection IEDs within 4 ms.', { state: 'reviewed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §2.9', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-218', 'Where a GOOSE message fails to arrive, the receiving IED shall raise an alarm within 100 ms.', { state: 'drafted', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §2.10', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-220', 'Disturbance recordings shall be stored for at least 12 months on station servers.', { state: 'committed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §3.1', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-222', 'Sampled-value streams shall comply with IEC 61869-9.', { state: 'committed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §5.4', draftedFrom: 'reuse-capeline-2023-protection', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-223', 'Merging units shall provide redundant fibre paths to each protection IED.', { state: 'drafted', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §5.5', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-224', 'The protection arrangement shall be tested via secondary injection during commissioning.', { state: 'committed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §5.6', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-231', 'Protection settings shall be version-controlled with engineer signature and timestamp.', { state: 'reviewed', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §7.1', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-232', 'A protection setting change shall require two-person approval.', { state: 'drafted', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §7.2', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-233', 'Where a protection setting is changed, the change shall be replicated to the redundant IED within 1 s.', { state: 'open', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §7.3', responsibleEngineer: 'engineer-anke-vogt' }),
  requirement('REQ-234', 'The protection arrangement shall be tested for selectivity against the AC network model annually.', { state: 'open', sourceVolume: 'source-volume-3-annex-b-protection-control', sourceLocation: 'Annex B §7.4', responsibleEngineer: 'engineer-anke-vogt' }),

  // --- Volume 4 — Annex C: Harmonics & power-quality (REQ-309..335, 12 rows) -----
  requirement('REQ-309', 'Voltage flicker at the PCC shall meet the Pst ≤ 0.8 limit per IEC 61000-3-7.', { state: 'committed', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §6.2', draftedFrom: 'reuse-reefnet-2020-harmonic-filters', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-310', 'Voltage unbalance at the PCC shall not exceed 1.0% under normal operation.', { state: 'committed', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §6.3', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-311', 'Interharmonic emissions shall be limited per IEC 61000-2-4 class 2.', { state: 'drafted', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §6.4', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-312', 'The harmonic filter banks shall be sectionalised for graceful degradation under filter outage.', { state: 'drafted', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §6.5', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-313', 'Filter capacitors shall be sized to meet the 5-year operating margin under derated conditions.', { state: 'reviewed', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §6.6', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-314', 'Filter reactors shall be designed to avoid resonance with the network impedance envelope.', { state: 'open', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §6.7', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-315', 'Filter performance shall be re-validated whenever the network impedance envelope changes by > 10%.', { state: 'open', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §6.8', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-321', 'DC-side ripple shall not exceed 1.0% of rated DC voltage.', { state: 'committed', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §7.1', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-322', 'DC-side harmonic currents shall be measured continuously and trended over 12 months.', { state: 'drafted', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §7.2', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-323', 'Where DC-side ripple exceeds 1.5%, the converter shall raise an alarm.', { state: 'drafted', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §7.3', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-324', 'Power quality at the PCC shall be reported to the TSO monthly per a standard exchange format.', { state: 'reviewed', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §7.4', responsibleEngineer: 'engineer-bernd-haag' }),
  requirement('REQ-325', 'Power quality reports shall be retained for 10 years.', { state: 'committed', sourceVolume: 'source-volume-4-annex-c-harmonics', sourceLocation: 'Annex C §7.5', responsibleEngineer: 'engineer-bernd-haag' }),

  // --- Volume 5 — Annex D-F: Auxiliaries / cooling / civil (REQ-371..490, 14 rows) -----
  requirement('REQ-371', 'The closed-loop cooling system shall deliver rated heat rejection at +40 °C ambient.', { state: 'committed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §1.1', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-372', 'The cooling system shall remain operational with one redundant pump out of service.', { state: 'reviewed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §1.2', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-373', 'Cooling-water make-up shall be filtered to remove particles > 5 µm.', { state: 'drafted', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §1.3', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-374', 'Cooling-water chemistry shall be monitored continuously for conductivity and pH.', { state: 'committed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §2.1', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-375', 'Cooling-tower discharge shall not exceed 30 °C at any time of year.', { state: 'open', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §2.2', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-377', 'The cooling-water reservoir shall be sized for 24 hours of full-load operation without make-up.', { state: 'reviewed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §2.5', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-378', 'Auxiliary AC supply shall be backed by two diesel generators rated 1.25× peak load.', { state: 'committed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §2.6', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-379', 'Diesel generators shall start automatically within 30 s of loss of off-site supply.', { state: 'drafted', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §2.7', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-380', 'Diesel fuel storage shall be sized for 72 hours of full-load operation.', { state: 'committed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §2.8', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-381', 'The auxiliary UPS shall provide 60 minutes of ride-through for the protection and control systems.', { state: 'reviewed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex D §2.9', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-412', 'The civil-works HVAC system shall maintain control-room temperature between 18 °C and 26 °C.', { state: 'committed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex E §3.2', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-413', 'The HVAC system shall provide a redundant chiller train for the control room.', { state: 'drafted', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex E §3.3', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-481', 'Fire detection shall include early-warning aspirating smoke detection in the converter hall.', { state: 'reviewed', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex F §6.1', responsibleEngineer: 'engineer-clara-mueller' }),
  requirement('REQ-482', 'Fire alarms shall be repeated to the local fire-and-rescue service within 30 s.', { state: 'open', sourceVolume: 'source-volume-5-annex-def-auxiliaries', sourceLocation: 'Annex F §6.2', responsibleEngineer: 'engineer-clara-mueller' }),

  // --- Volume 6 — Grid-code compliance (REQ-604..705, 10 rows) -----
  requirement('REQ-604', 'Compliance evidence shall include type-test certificates issued by an accredited laboratory.', { state: 'committed', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §2.1', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-605', 'Compliance evidence shall be presented in both German and English.', { state: 'committed', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §2.2', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-606', 'Compliance evidence shall be cross-referenced to the requirements numbering of this tender.', { state: 'reviewed', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §2.3', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-622', 'Where the bidder claims compliance through testing, the bidder shall identify the test laboratory.', { state: 'drafted', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §4.3', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-623', 'Where the bidder claims compliance through analysis, the bidder shall provide reproducible models.', { state: 'open', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §4.4', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-701', 'The bidder shall submit a compliance matrix indexed by requirement number.', { state: 'committed', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §6.1', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-702', 'The compliance matrix shall identify each requirement as comply, comply partially, deviate, or clarify.', { state: 'committed', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §6.2', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-703', 'For deviations, the bidder shall propose an alternative and quantify the commercial implication.', { state: 'deviation', deviationRationale: 'Bidder lists three deviations (REQ-238, REQ-263, REQ-433); commercial impact summarised in Annex G.', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §6.3', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-704', 'The bidder shall maintain the compliance matrix until completion of site-acceptance tests.', { state: 'reviewed', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §6.4', responsibleEngineer: 'engineer-dirk-stein' }),
  requirement('REQ-705', 'Material changes to the compliance matrix after award shall require TSO approval.', { state: 'drafted', sourceVolume: 'source-volume-6-grid-code', sourceLocation: 'Vol.6 §6.5', responsibleEngineer: 'engineer-dirk-stein' }),
];

export const KG_ENTITIES: EntityDraft[] = [
  ...ENTITIES_CUSTOMER_ENGINEERS,
  ...ENTITIES_STANDARDS,
  ...ENTITIES_SOURCE_VOLUMES,
  ...ENTITIES_REUSE_SOURCES,
  ...ENTITIES_REQUIREMENTS,
];

// --- relationships ------------------------------------------------------

const rel = (
  subject: string,
  predicate: string,
  object: string,
  properties?: Record<string, string>,
): RelationshipDraft => ({ subject, predicate, object, properties });

const RELATIONSHIPS_SOURCE_OF: RelationshipDraft[] = [
  ...ENTITIES_REQUIREMENTS.map((req) => {
    const vol = req.properties.sourceVolume;
    return rel(req.id, 'sourcedFrom', vol);
  }),
];

const RELATIONSHIPS_DRAFTED_FROM: RelationshipDraft[] = ENTITIES_REQUIREMENTS
  .filter((r) => r.properties.draftedFrom)
  .map((r) => rel(r.id, 'draftedFrom', r.properties.draftedFrom));

const RELATIONSHIPS_RESPONSIBLE: RelationshipDraft[] = ENTITIES_REQUIREMENTS
  .filter((r) => r.properties.responsibleEngineer)
  .map((r) => rel(r.id, 'responsibleEngineer', r.properties.responsibleEngineer));

const RELATIONSHIPS_OVERRIDE: RelationshipDraft[] = [
  rel('source-late-clarifications-2026-04-18', 'overrides', 'REQ-184', {
    originalText: 'Reactive-power range ±0.95 leading / ±0.95 lagging at full active output',
    amendedText: 'Reactive-power range ±0.90 leading / ±0.95 lagging at full active output',
    citedReason: 'Local grid-stability assessment of 2026-Q1',
  }),
  rel('source-late-clarifications-2026-04-18', 'overrides', 'REQ-411', {
    originalText: '-25°C to +40°C ambient range',
    amendedText: '-30°C to +40°C ambient range (heat-rejection clause)',
    citedReason: 'Operational temperature extreme observed at neighbouring station 2025-12.',
  }),
];

const RELATIONSHIPS_TYPE_TEST: RelationshipDraft[] = [
  rel('REQ-247', 'typeTestEvidence', 'reuse-northshore-2022-frt-type-test'),
];

const RELATIONSHIPS_REUSE_MISMATCH: RelationshipDraft[] = [
  rel('REQ-303', 'cascadesTo', 'REQ-304'),
  rel('REQ-303', 'cascadesTo', 'REQ-305'),
  rel('REQ-303', 'cascadesTo', 'REQ-307'),
  rel('reuse-reefnet-2020-harmonic-filters', 'doesNotMeet', 'REQ-303', {
    reason: 'Reefnet delivered THD ≤ 1.5%; REQ-303 requires THD ≤ 0.9%.',
  }),
];

const RELATIONSHIPS_STANDARD_REFS: RelationshipDraft[] = [
  rel('REQ-104', 'references', 'std-iec-60633'),
  rel('REQ-202', 'references', 'std-nc-hvdc'),
  rel('REQ-211', 'references', 'std-iec-61850'),
  rel('REQ-212', 'references', 'std-iec-61850'),
  rel('REQ-308', 'references', 'std-iec-62271-1'),
  rel('REQ-601', 'references', 'std-nc-hvdc'),
  rel('REQ-602', 'references', 'std-bnetza-tab-hs-2024'),
  rel('REQ-621', 'references', 'std-bnetza-tab-hs-2024'),
  rel('REQ-904', 'references', 'std-bnetza-tab-hs-2024'),
];

const RELATIONSHIPS_CUSTOMER_AUTHORED: RelationshipDraft[] = ENTITIES_SOURCE_VOLUMES
  .map((v) => rel('customer-nsun', 'authored', v.id));

export const KG_RELATIONSHIPS: RelationshipDraft[] = [
  ...RELATIONSHIPS_SOURCE_OF,
  ...RELATIONSHIPS_DRAFTED_FROM,
  ...RELATIONSHIPS_RESPONSIBLE,
  ...RELATIONSHIPS_OVERRIDE,
  ...RELATIONSHIPS_TYPE_TEST,
  ...RELATIONSHIPS_REUSE_MISMATCH,
  ...RELATIONSHIPS_STANDARD_REFS,
  ...RELATIONSHIPS_CUSTOMER_AUTHORED,
];
