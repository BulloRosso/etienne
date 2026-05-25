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
  requirement('REQ-119', 'The station shall be designed for adequate seismic resilience.', {
    state: 'clarify',
    sourceVolume: 'source-volume-1-functional-spec',
    sourceLocation: 'Vol.1 §4.7',
    clarifyReason: 'No seismic zone or DIN/EN 1998-1 ground type cited — ambiguous as authored.',
    responsibleEngineer: 'engineer-clara-mueller',
  }),
  requirement('REQ-141', 'The converter shall provide black-start capability when the offshore wind farm is offline.', {
    state: 'drafted',
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
  }),
  requirement('REQ-181', 'The converter shall be capable of operating at any point inside the PQ-capability envelope defined in Annex A §3.', {
    state: 'committed',
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
    sourceVolume: 'source-volume-2-annex-a-electrical-performance',
    sourceLocation: 'Annex A §2.3',
    draftedFrom: 'reuse-northshore-2022-mmc-control',
    responsibleEngineer: 'engineer-anke-vogt',
  }),
  requirement('REQ-241', 'The converter shall track an active-power setpoint with steady-state error not exceeding 0.5% of rating.', {
    state: 'drafted',
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
