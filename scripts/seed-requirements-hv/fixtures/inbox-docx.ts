/**
 * Inbox fixture — English Word documents written to <project>/inbox/.
 *
 * These are the *incoming* customer specifications: the English originals
 * that the proposal desk receives from NSÜN. The seed produces them as
 * .docx files so the workspace demonstrates the realistic input format
 * (Word, not Markdown). The in-house translation to the working language
 * (German) lives in documents/source-volume-*-excerpt.md and is what the
 * agent operates on.
 *
 * Each entry's body is intentionally the English back-translation of the
 * corresponding German source-volume excerpt in rag-docs.ts. Keeping the
 * two in sync is the seed's responsibility — they describe the same
 * clauses and reference the same REQ-* IDs.
 */

export interface InboxDocDraft {
  filename: string;
  title: string;
  body: string;
}

export const INBOX_DOCS: InboxDocDraft[] = [
  {
    filename: 'NU-525-Lot-3-Volume-1-Functional-Spec.docx',
    title: 'Volume 1 — Functional Specification (excerpt)',
    body: `Customer: Nordseeübertragungs-Netz GmbH (NSÜN)
Project: NU-525-Lot-3 — onshore HVDC converter-station unit
Issue date: 2026-02-12

## §2 Rated quantities

§2.1 The converter station shall be designed for a continuous rated DC voltage of ±525 kV. (see REQ-101)

§2.2 The converter station shall be designed for a continuous rated active power of 2 GW. (see REQ-102)

§2.3 The converter station shall be capable of bidirectional power transfer at full rated power in both directions. (see REQ-103)

## §6 Reactive power

§6.2 The converter shall be capable of operating at any point inside the PQ envelope defined in Annex A §3. (see REQ-181)

§6.3 The converter shall provide continuous reactive-power support at full rated active power. (see REQ-182)

§6.5 The converter shall provide a reactive-power range of ±0.95 leading / ±0.95 lagging at full active power output. (see REQ-184 — amended by clarifications memo 2026-04-18)
`,
  },
  {
    filename: 'NU-525-Lot-3-Volume-2-Annex-A-Electrical-Performance.docx',
    title: 'Volume 2 — Annex A: Electrical Performance (excerpt)',
    body: `## §6 Active-power control

§6.1 The converter shall track an active-power setpoint with a steady-state regulation error of at most 0.5 % of rated power. (REQ-241)

§6.2 On a setpoint change of ≤ 500 MW the converter shall reach the new setpoint within 1.0 s. (REQ-242)

§6.3 The active-power ramp rate shall be configurable between 100 MW/min and 1500 MW/min. (REQ-243)

## §7 Fault behaviour

§7.4.3 Voltage dips / fault ride-through.

The table in §7.4.2 lists the permitted limits for harmonic distortion. Footnote 2: On a three-phase fully-depressed voltage fault at the converter AC busbar the converter shall remain connected and shall resume its pre-fault active-power output within 250 ms. (REQ-247 — load-bearing requirement, hidden inside a footnote context under a harmonics table.)

## §8 Reactive power & oscillations

§8.1 The converter shall reach a reactive-power setpoint change of ±200 MVAr within 100 ms. (REQ-251)

§8.4 The converter shall damp sub-synchronous oscillations in the 2–15 Hz range with a damping ratio ≥ 0.10. (REQ-252 — currently open, no reuse source identified.)
`,
  },
  {
    filename: 'NU-525-Lot-3-Volume-3-Annex-B-Protection-Control.docx',
    title: 'Volume 3 — Annex B: Protection & Control (excerpt)',
    body: `## §2 Protection system

§2.1 The protection system shall include redundant differential-protection devices per IEC 61850-9-2. (REQ-211)

§2.4 Trip signals shall be delivered to the converter within 5 ms of fault detection. (REQ-212)

## §4 Arbitration

§4.2 When a black-start signal is present, the control system shall arbitrate priority between protection-trip and black-start commands per the priority table in §4.3. (REQ-219)

## §5 Logging

§5.3 The control system shall log every setpoint change with millisecond-resolution timestamping and a tamper-evident hash chain. (REQ-221)

## §7 Communications

§7.6 On loss of inter-station communications the converter shall transition to autonomous-control mode within 200 ms without tripping. (REQ-238 — deviation requested: 220 ms.)
`,
  },
  {
    filename: 'NU-525-Lot-3-Volume-4-Annex-C-Harmonics.docx',
    title: 'Volume 4 — Annex C: Harmonics & Power-Quality Limits (excerpt)',
    body: `## §3 Limits at the point of common coupling (PCC)

§3.1 The converter station shall comply with the harmonic-current limits listed in Table C.1. (REQ-301)

§3.2 The converter station shall comply with the harmonic-voltage-distortion limits listed in Table C.2. (REQ-302)

§3.3 The total harmonic distortion (THD) at the point of common coupling shall not exceed 0.9 % at any operating point. (REQ-303 — stricter than the 1.5 % achieved on comparable projects.)

## §4 Filter design

§4.2 The harmonic filters shall remain effective across the full operating temperature range per Annex D. (REQ-304)

## §5 Components and losses

§5.1 Harmonic-filter components shall be sourced from suppliers qualified per §5. (REQ-305)

§5.6 Filter losses shall not exceed 0.15 % of the station's rated power averaged across the operating envelope. (REQ-307)

## §6 Compliance evidence

§6.1 Compliance with the harmonic-emission limits shall be demonstrated by on-site measurement per IEC 61000-4-7. (REQ-308)
`,
  },
  {
    filename: 'NU-525-Lot-3-Volume-5-Annex-DEF-Auxiliaries.docx',
    title: 'Volume 5 — Annex D–F: Auxiliaries / Cooling / Civil (excerpt)',
    body: `## Annex D §2.4

The reserve-line auxiliaries shall be supplied from a separate AC auxiliary busbar. (REQ-376 — scope ambiguous: are the cooling-skid auxiliaries included?)

## Annex E §3.1

The station HVAC system shall be designed for an ambient temperature range of –25 °C to +40 °C. (REQ-411 — implicit conflict with the clarifications memo 2026-04-18, which cites –30 °C in the heat-rejection clause.)

## Annex E §6.2

The fire-protection system in the converter hall shall be implemented as an inert-gas system per VdS CEA 4001. (REQ-433 — deviation requested: water-mist per FM Global 5560.)

## Annex F §1.4

The cooling-water system shall be designed as a closed loop with availability ≥ 99.5 %. (REQ-451 — open.)
`,
  },
  {
    filename: 'NU-525-Lot-3-Volume-6-Grid-Code.docx',
    title: 'Volume 6 — Grid-Connection Compliance (excerpt)',
    body: `## §1 Scope

§1.1 The converter station shall comply with all mandatory provisions of EU Regulation 2016/1447 (NC-HVDC). (REQ-601)

§1.2 The converter station shall comply with the country-specific overlays of BNetzA TAB-HS 2024. (REQ-602)

§1.4 The compliance evidence shall be presented in the compliance matrix included inside the technical specification, with traceable IDs. (REQ-603)

## §4 Relation to IEEE standards

§4.2 Where IEEE 1547 is cited in Annex E it shall be treated as informative only; the binding overlay is BNetzA TAB-HS. (REQ-621)

## §5 Firmware type-testing

§5.3 All firmware versions of safety-critical control devices shall be type-tested per BNetzA TAB-HS 2024 §11. (REQ-904 — open.)
`,
  },
  {
    filename: 'NU-525-Lot-3-Late-Clarifications-2026-04-18.docx',
    title: 'NSÜN Late-Clarifications Memo — 2026-04-18',
    body: `Applies to: NU-525-Lot-3 — onshore converter station
Number of amended clauses: 41

This memo supplements Volumes 1–4 of the tender. It was issued after the bidders' questions window had closed.

## §4 Amended clauses (excerpt)

### §4.2 — Reactive-power range (supersedes Vol.1 §6.5)
The reactive-power range per Volume 1 §6.5 is replaced by ±0.90 leading / ±0.95 lagging at full rated active power. Rationale: grid-stability analysis Q1/2026.

Affects REQ-184. Caution: reuse drafts pulled from projects answering the original ±0.95/±0.95 profile do NOT meet the new requirement — adaptation required.

### §4.7 — Ambient temperature (supersedes Annex E §3.1)
In the context of the heat-rejection clause the lower temperature value is corrected to –30 °C.

Affects REQ-411. Implicit conflict with the original Annex E clause at –25 °C. Clarification recommended.

### §4.14 — Remaining amended clauses
(39 further amendments, each with a cross-reference to the original clause — see Annex 1 of the memo for the complete list.)
`,
  },
];
