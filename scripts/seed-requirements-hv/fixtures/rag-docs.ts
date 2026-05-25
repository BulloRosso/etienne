/**
 * RAG documents for the requirements-hv seed project.
 *
 * Eighteen markdown documents covering:
 *   - Source-volume excerpts (German, paraphrased — the customer's
 *     requirement text the agent parses + normalises against).
 *   - The late-clarifications memo (German).
 *   - Past-spec excerpts from the firm's reuse base (English — what the
 *     agent retrieves during the *transform* step).
 *   - Type-test report excerpts.
 *   - Internal style guide + handover notes.
 *
 * All content is stylised / paraphrased — no real customer or contractor
 * specification text is shipped.
 */

export interface RagDocDraft {
  filename: string;
  body: string;
}

export const RAG_DOCS: RagDocDraft[] = [
  // --- Source-volume excerpts (German) -----
  {
    filename: 'source-volume-1-functional-spec-excerpt.md',
    body: `# Volume 1 — Funktionsspezifikation (Auszug)

**Kunde:** Nordseeübertragungs-Netz GmbH (NSÜN)
**Projekt:** NU-525-Lot-3 — Onshore-Stationseinheit der HGÜ-Verbindung
**Stand:** 2026-02-12

## §2 Nenngrößen

§2.1 Die Konverterstation muss für eine dauerhafte Nenn-Gleichspannung
von ±525 kV ausgelegt werden. *(siehe REQ-101)*

§2.2 Die Konverterstation muss für eine dauerhafte Nenn-Wirkleistung
von 2 GW ausgelegt werden. *(siehe REQ-102)*

§2.3 Die Konverterstation muss bidirektional übertragbar sein bei
voller Nennleistung in beide Richtungen. *(siehe REQ-103)*

## §6 Blindleistung

§6.2 Der Konverter muss an jedem Punkt innerhalb der in Annex A §3
definierten PQ-Hüllkurve betrieben werden können. *(siehe REQ-181)*

§6.3 Der Konverter muss kontinuierliche Blindleistungsunterstützung bei
voller Nennwirkleistung bereitstellen. *(siehe REQ-182)*

§6.5 Der Konverter muss einen Blindleistungsbereich von ±0,95
kapazitiv / ±0,95 induktiv bei voller Wirkleistung bereitstellen.
*(siehe REQ-184 — geändert durch Klarstellungsmemo 2026-04-18)*
`,
  },
  {
    filename: 'source-volume-2-annex-a-electrical-performance-excerpt.md',
    body: `# Volume 2 — Annex A: Elektrisches Verhalten (Auszug)

## §6 Wirkleistungsregelung

§6.1 Der Konverter muss einen Wirkleistungssollwert mit einem
stationären Regelfehler von höchstens 0,5 % der Bemessungsleistung
nachführen. *(REQ-241)*

§6.2 Bei einer Sollwertänderung von ≤ 500 MW muss der Konverter den
neuen Sollwert innerhalb von 1,0 s erreichen. *(REQ-242)*

§6.3 Die Wirkleistungs-Anstiegsrate muss zwischen 100 MW/min und
1500 MW/min konfigurierbar sein. *(REQ-243)*

## §7 Fehlerverhalten

**§7.4.3** Spannungseinbrüche / Fault-Ride-Through.

Die Tabelle in §7.4.2 gibt die zulässigen Grenzwerte für
harmonische Verzerrungen an. **Fußnote 2:** Bei einem dreiphasigen
vollständigen Spannungseinbruch am Konverter-AC-Sammelschienen-
anschluss muss der Konverter angeschlossen bleiben und seine
Vorstörungs-Wirkleistung **innerhalb von 250 ms** wieder aufnehmen.
*(REQ-247 — kritische Anforderung, die in einem Fußnotenkontext
unter einer Oberschwingungs-Tabelle verborgen ist.)*

## §8 Blindleistung & Schwingungen

§8.1 Der Konverter muss eine Blindleistungs-Sollwertänderung von
±200 MVAr innerhalb von 100 ms erreichen. *(REQ-251)*

§8.4 Der Konverter muss subsynchrone Schwingungen im Bereich 2–15 Hz
mit einem Dämpfungsmaß ≥ 0,10 dämpfen. *(REQ-252 — derzeit offen,
keine Wiederverwendungsquelle identifiziert.)*
`,
  },
  {
    filename: 'source-volume-3-annex-b-protection-control-excerpt.md',
    body: `# Volume 3 — Annex B: Schutz- und Leittechnik (Auszug)

## §2 Schutzsystem

§2.1 Das Schutzsystem muss redundante Differentialschutz-
Einrichtungen gemäß IEC 61850-9-2 enthalten. *(REQ-211)*

§2.4 Auslösesignale müssen dem Konverter innerhalb von 5 ms nach
Fehlererkennung übermittelt werden. *(REQ-212)*

## §4 Arbitrierung

§4.2 Wenn ein Schwarzstart-Signal anliegt, muss das Leitsystem die
Priorität zwischen Schutz-Auslösung und Schwarzstart-Befehlen
gemäß der Prioritätstabelle in §4.3 arbitrieren. *(REQ-219)*

## §5 Protokollierung

§5.3 Das Leitsystem muss alle Sollwertänderungen mit
millisekundengenauer Zeitstempelung und einer manipulationssicheren
Hash-Kette protokollieren. *(REQ-221)*

## §7 Kommunikation

§7.6 Bei Ausfall der Inter-Stations-Kommunikation muss der Konverter
ohne Auslösung innerhalb von 200 ms in autonomen Steuermodus
übergehen. *(REQ-238 — Abweichung beantragt: 220 ms.)*
`,
  },
  {
    filename: 'source-volume-4-annex-c-harmonics-excerpt.md',
    body: `# Volume 4 — Annex C: Oberschwingungs- und Spannungsqualitätsgrenzen (Auszug)

## §3 Grenzwerte am Verknüpfungspunkt (PCC)

§3.1 Die Konverterstation muss die in Tabelle C.1 angegebenen
Oberschwingungsstromgrenzwerte einhalten. *(REQ-301)*

§3.2 Die Konverterstation muss die in Tabelle C.2 angegebenen
Oberschwingungsspannungs-Verzerrungsgrenzwerte einhalten. *(REQ-302)*

§3.3 Die gesamte harmonische Verzerrung (THD) am Verknüpfungspunkt
darf **bei keinem Betriebspunkt 0,9 % überschreiten**.
*(REQ-303 — strenger als die in vergleichbaren Projekten erzielten
1,5 %.)*

## §4 Filterauslegung

§4.2 Die Oberschwingungsfilter müssen über den gesamten Betriebs-
temperaturbereich gemäß Annex D wirksam bleiben. *(REQ-304)*

## §5 Komponenten und Verluste

§5.1 Oberschwingungs-Filterkomponenten müssen von Lieferanten
bezogen werden, die gemäß §5 qualifiziert sind. *(REQ-305)*

§5.6 Die Filterverluste dürfen 0,15 % der Stationsbemessungsleistung
gemittelt über die Betriebshüllkurve nicht überschreiten. *(REQ-307)*

## §6 Nachweise

§6.1 Die Einhaltung der Oberschwingungs-Emissionen muss durch
Vor-Ort-Messung gemäß IEC 61000-4-7 nachgewiesen werden. *(REQ-308)*
`,
  },
  {
    filename: 'source-volume-5-annex-def-auxiliaries-excerpt.md',
    body: `# Volume 5 — Annex D-F: Hilfsbetriebe / Kühlung / Bautechnik (Auszug)

## Annex D §2.4

Die **Hilfsbetriebe der Reservelinie** müssen aus einer separaten
AC-Hilfssammelschiene versorgt werden. *(REQ-376 — Bereich
mehrdeutig: Werden die Kühlskid-Hilfsbetriebe einbezogen?)*

## Annex E §3.1

Das bauseitige HVAC-System muss für einen Umgebungstemperaturbereich
von **–25 °C bis +40 °C** ausgelegt werden. *(REQ-411 — implizit
widersprüchlich zum Klarstellungsmemo 2026-04-18, das in der
Wärmeabfuhr-Klausel –30 °C zitiert.)*

## Annex E §6.2

Das Brandschutzsystem in der Konverterhalle muss als
Inertgas-System gemäß VdS CEA 4001 ausgeführt werden. *(REQ-433 —
Abweichung beantragt: Wassernebel gemäß FM Global 5560.)*

## Annex F §1.4

Das Kühlwassersystem muss als geschlossener Kreislauf mit einer
Verfügbarkeit von ≥ 99,5 % ausgelegt werden. *(REQ-451 — offen.)*
`,
  },
  {
    filename: 'source-volume-6-grid-code-excerpt.md',
    body: `# Volume 6 — Netzanschluss-Konformität (Auszug)

## §1 Geltungsbereich

§1.1 Die Konverterstation muss alle obligatorischen Bestimmungen
der EU-Verordnung 2016/1447 (NC-HVDC) erfüllen. *(REQ-601)*

§1.2 Die Konverterstation muss die landespezifischen Überlagerungen
der BNetzA TAB-HS 2024 erfüllen. *(REQ-602)*

§1.4 Die Konformitätsnachweise müssen in der innerhalb der
technischen Spezifikation gelieferten Konformitätsmatrix mit
nachvollziehbaren IDs dargestellt werden. *(REQ-603)*

## §4 Verhältnis zu IEEE-Normen

§4.2 Soweit IEEE 1547 in Annex E zitiert wird, ist es ausschließlich
**informativ** zu behandeln; bindend ist die BNetzA TAB-HS.
*(REQ-621)*

## §5 Firmware-Typprüfung

§5.3 Alle Firmware-Versionen sicherheitskritischer Steuerungsgeräte
müssen gemäß BNetzA TAB-HS 2024 §11 typgeprüft sein. *(REQ-904 —
offen.)*
`,
  },
  {
    filename: 'source-late-clarifications-2026-04-18.md',
    body: `# Klarstellungs-Memo NSÜN — Stand 2026-04-18

**Geltend für:** NU-525-Lot-3 — Onshore-Konverterstation
**Anzahl geänderter Klauseln:** 41

Dieses Memo ergänzt die in der Ausschreibung enthaltenen Volumina 1–4.
Es wurde nach Schließung des Bieterfragen-Fensters herausgegeben.

## §4 Geänderte Klauseln (Auszug)

### §4.2 — Blindleistungsbereich (überschreibt Vol.1 §6.5)
Der Blindleistungsbereich gemäß Volume 1 §6.5 wird ersetzt durch
**±0,90 kapazitiv / ±0,95 induktiv** bei voller Nennwirkleistung.
Begründung: Netzstabilitätsanalyse Q1/2026.

→ **Betrifft REQ-184.** *Vorsicht:* Wiederverwendungsentwürfe aus
Projekten mit dem ursprünglichen Profil ±0,95/±0,95 erfüllen die
neue Anforderung nicht — Anpassung erforderlich.

### §4.7 — Umgebungstemperatur (überschreibt Annex E §3.1)
Im Zusammenhang mit der Wärmeabfuhr-Klausel ist der untere
Temperaturwert auf **–30 °C** zu korrigieren.

→ **Betrifft REQ-411.** Implizit widersprüchlich zur ursprünglichen
Annex-E-Klausel mit –25 °C. **Klärung empfohlen.**

### §4.14 — Verbleibende geänderte Klauseln
(39 weitere Änderungen, jeweils mit Querverweis auf die
ursprüngliche Klausel — zur vollständigen Liste siehe Anlage 1 des
Memos.)
`,
  },

  // --- Past-spec excerpts (English, the reuse base) -----
  {
    filename: 'reuse-northshore-2022-mmc-control.md',
    body: `# Northshore-2022 — MMC Control Scheme (excerpt)

**Project:** Northshore HVDC link
**Year:** 2022
**Type:** Delivered technical specification

## Active-power control (excerpt)

The converter uses a vector-current-controlled modular-multilevel
topology (MMC). Active-power setpoint tracking is implemented with a
two-stage cascade: an outer power loop and an inner current loop, both
running at 10 kHz on the converter-control rack.

Setpoint changes of up to 600 MW are achieved within 1.2 s with a
steady-state error of 0.3 % of rating. The ramp rate is configurable
between 80 MW/min and 1800 MW/min via the IEC 61850 MMS interface.

## Fault-ride-through

The Northshore design rides through a three-phase fully-depressed
voltage fault at the AC bus and resumes pre-fault active-power output
within 220 ms. The mechanism is the MMC's internal energy buffer
combined with a damping control that suppresses post-fault oscillation.

**Type-tested at:** KEMA-Labs Arnhem, 2022-08-14.
**Certified profile:** 3-phase fully-depressed voltage, ≤ 280 ms
duration, full ride-through with no trip.

## Reuse note for NU-525-Lot-3

This scheme answers REQ-104, REQ-241–246, REQ-247 (FRT-250ms), and
REQ-251–254 with adaptation of the setpoint and ramp-rate values to
the customer's range. Translate into German per the
[style guide](./reuse-internal-german-style-guide.md).
`,
  },
  {
    filename: 'reuse-northshore-2022-frt-type-test.md',
    body: `# Northshore-2022 — FRT Type-Test Report (excerpt)

**Project:** Northshore HVDC link
**Test facility:** KEMA-Labs Arnhem
**Test date:** 2022-08-14
**Witnessed by:** TÜV Süd

## Test profile
- 3-phase fully-depressed voltage at the converter AC bus.
- Sustained for 250 ms.
- Pre-fault active-power output: 1800 MW.

## Result
- Converter remained connected throughout.
- Active-power output recovered to within 2 % of pre-fault setpoint
  by **218 ms** after voltage restoration.
- No protection trip, no shutdown, no controlled-mode degradation.

## Margin
Test profile margin against REQ-247 (250 ms ride-through): **32 ms**.

## Reuse note
This report is the certified evidence for the FRT-250ms answer on
REQ-247. The drafted response references this test by ID
(KEMA-NS22-FRT-014). The compliance matrix carries the certificate
filename forward into the deliverable.
`,
  },
  {
    filename: 'reuse-capeline-2023-protection.md',
    body: `# Capeline-2023 — Protection Philosophy (excerpt)

**Project:** Capeline HVDC tie
**Year:** 2023
**Type:** Delivered technical specification

## Redundant differential protection

Two independent differential-protection IEDs (intelligent electronic
devices) operate per IEC 61850-9-2 sampled-values. Each delivers a trip
signal to the converter trip bus within 4.5 ms of fault detection,
including IED processing and SV transmission.

## Communications-fallback

If the inter-station communications link fails, the local converter
falls back to autonomous-control mode within **250 ms** without
tripping. The mechanism is a watchdog timer on the inter-station heartbeat;
on three consecutive missed heartbeats, the autonomous-mode controller
takes over.

## Reuse note for NU-525-Lot-3

Capeline answers REQ-211, REQ-212, REQ-219, REQ-221 directly. For
REQ-238 (inter-station fallback within 200 ms), Capeline's 250 ms is
**too slow** — formal deviation proposed, with a 220 ms offer based on
a control-card variant that has not been type-tested. See the
deviation rationale on REQ-238.
`,
  },
  {
    filename: 'reuse-reefnet-2020-harmonic-filters.md',
    body: `# Reefnet-2020 — Harmonic Filter Design (excerpt)

**Project:** Reefnet offshore connection
**Year:** 2020
**Type:** Delivered technical specification

## Filter topology
A passive C-type filter for 3rd, 5th, 7th, and 11th harmonics, supplemented
by a tuned high-pass branch above 13th.

## Performance
At the point of common coupling, the design delivered total harmonic
distortion (THD) of **≤ 1.5 %** across the operating envelope (verified
by site measurement per IEC 61000-4-7).

## Reuse note — IMPORTANT
The natural reuse for the Annex C cluster (REQ-301..REQ-308) is the
Reefnet filter design. **However**, NSÜN's REQ-303 requires **THD ≤ 0.9 %**
at the PCC — significantly stricter than Reefnet's 1.5 %.

Re-using this design as-is would silently miss the limit. The cluster
needs **re-tuned filter topology** or a formal deviation. Cluster head:
REQ-303 → REQ-304, REQ-305, REQ-307.

A retune to active filtering (hybrid passive + active harmonic
compensator) was evaluated in the Aurora-2024 design and meets ≤ 0.7 %.
Cross-pull from that design before drafting Annex C.
`,
  },
  {
    filename: 'reuse-aurora-2024-reactive-power.md',
    body: `# Aurora-2024 — Reactive-Power Capability Curve (excerpt)

**Project:** Aurora HVDC bipole
**Year:** 2024
**Type:** Delivered technical specification

## PQ envelope (as delivered)
At full active-power output, Aurora's converter operated across a
reactive-power range of **±0.95 leading / ±0.95 lagging**.

## Reuse note for NU-525-Lot-3
The Aurora envelope answers REQ-181, REQ-182, REQ-183 directly.

For REQ-184, the late-clarifications memo of 2026-04-18 amended the
required leading-side range from ±0.95 to **±0.90**. The Aurora reuse
passage **answered the original ±0.95 profile** and must be adapted
before commit. **Override edge present in the knowledge graph;
override chip visible on the coverage dashboard.**
`,
  },
  {
    filename: 'reuse-internal-german-style-guide.md',
    body: `# Internal — German Technical-Spec Style Guide (excerpt)

**Audience:** Proposal-desk engineers and the translation-drafting agent
**Last revised:** 2025-11

## Normative verbs
| Force | German | When |
|---|---|---|
| Mandatory | **muss** | Always; the bid's binding commitments. |
| Permitted | **darf** | Permissive constructions only. |
| Recommended | **sollte** | Recommendations; never for binding commitments. |

**Never use** the colloquial **soll** — it is ambiguous in legal
German between "shall" and "should" and has caused at least one
documented site-acceptance dispute.

## Numbers and units
- Decimal separator: comma (e.g., **1,5 MW**).
- Thousand separator: thin space or none (**1 500 MW** or **1500 MW**).
- Units in SI; °C with the degree symbol.
- Setpoint ranges with en-dash: **–25 °C bis +40 °C**.

## Terms that are never translated
Standard references (IEC 62271-1, EU NC-HVDC), requirement IDs
(REQ-247), annex references (Annex C §3.3), project names.

## Tone
Direct, declarative, no marketing voice. The deliverable is a
contractual document, not a sales document.
`,
  },

  // --- Internal style + handover notes -----
  {
    filename: 'internal-handover-anke-vogt-controls.md',
    body: `# Internal handover — Controls & Protection (A. Vogt)

The MMC control scheme on Northshore-2022 is our reference design for
this bid's REQ-104 + REQ-241..268. Two important caveats before the
draft is committed:

1. Northshore is rated 1800 MW; this bid is 2 GW. The active-power ramp
   table needs proportional rescaling. The agent's draft does this
   correctly, but cross-check the steady-state error figure against the
   updated current-loop bandwidth.

2. REQ-247 (FRT-250ms) has a 32 ms margin against the Northshore type-
   test. We are inside the envelope but the certification reference
   filename in the compliance matrix must be the **KEMA-NS22-FRT-014**
   report, not the summary in §7 of the Northshore spec. Confirm the
   reference in the exported PDF.

REQ-252 (sub-synchronous damping) is **open** — Northshore did not have
this requirement explicitly. Either a clarify on the damping-ratio
measurement standard or a fresh draft pulled from the analytical model.
Discussed with B. Haag 2026-05-21.
`,
  },
  {
    filename: 'internal-handover-bernd-haag-harmonics.md',
    body: `# Internal handover — Power Quality (B. Haag)

The Annex C cluster (REQ-301..REQ-308) is the bid's biggest reuse-mismatch
risk. Reefnet-2020 is the natural reuse but delivered THD ≤ 1.5 %.
NSÜN's REQ-303 is **0.9 %**. The agent has flagged the four affected
requirements (REQ-303, REQ-304, REQ-305, REQ-307) with a
**reuse-mismatch** chip on the coverage dashboard.

Options:

- **Re-tune** to a hybrid passive + active topology (Aurora-2024 reached
  ≤ 0.7 %). Adds capex; engineering effort ~2 weeks.
- **Deviate** with a commercial alternative (Reefnet-style passive
  filter at 1.5 % THD + post-award measurement protocol). High risk of
  bid disadvantage.
- **Clarify** whether the THD limit applies at the PCC or at the
  converter terminals (the NSÜN clause is ambiguous on this in the
  English standard-references section).

Decision required at engineering-review gate G2. No commit allowed
before then.
`,
  },
  {
    filename: 'internal-post-mortem-bid-2024.md',
    body: `# Internal post-mortem — Bid loss, 2024-Q4

**Bid:** Similar 525 kV HVDC converter station, different TSO.
**Outcome:** Bid lost on a technical non-compliance discovered by the
customer's review team — a single requirement under a harmonics table
that committed to a 200 ms FRT response when the source required 100 ms.

## Root cause
Reuse passage was pulled from a project that answered the more lenient
200 ms profile. The draft was bulk-committed in the last week before
submission. No engineer read the specific clause; the coverage matrix
showed *committed* and the proposal desk moved on.

## What changed in our process
1. **No bulk-commit of drafted rows.** A *drafted* row moves to
   *committed* only through an individual engineer's decision, on the
   record.
2. **Override flag on every late-clarification.** Source-clause amendments
   are tracked as a separate edge in the knowledge graph; the draft is
   never silently merged with the amendment.
3. **The agent will not draft for an ambiguous requirement.** It flags
   for the clarify queue instead. An invented measurable criterion is
   how disputes are lost at site acceptance.

## What the requirements-hv project must continue to enforce
The coverage dashboard makes the *drafted vs. committed* distinction
visible at all times. The export step refuses to render any row not in
*committed / deviation / clarify*. These guards exist because of this
post-mortem.
`,
  },
  {
    filename: 'internal-coverage-dashboard-spec.md',
    body: `# Coverage dashboard — internal spec

## Purpose
The single view of the bid's progress. Every requirement is a row,
every row has a state.

## States (must be visible per-row)
- **open** — parsed + normalised; no draft.
- **drafted** — agent has retrieved + adapted + translated; no engineer
  has read.
- **reviewed** — engineer has read; iterating.
- **committed** — explicit human decision; locked.
- **deviation** — bid will deviate; rationale recorded.
- **clarify** — ambiguous; customer clarification requested.

## Chips
- **override** — amended by late-clarifications memo.
- **reuse-mismatch** — drafted from a reuse source that does not meet
  the requirement.
- **clarify** — requirement is ambiguous (separate from the *clarify*
  state; a *drafted* row can still carry a *clarify* chip when there is
  a subordinate ambiguity that has not yet escalated to clarify-state).
- **reuse: <source>** — which past spec the draft was pulled from.

## Aggregate views
- By state (counts).
- By source volume.
- By responsible engineer.
- By submission gate (G1 / G2 / G3).

## Gate enforcement
At G3 (commit gate), the export refuses to run if any row is in
*open / drafted / reviewed*. The blockers are listed with their owners.
`,
  },
];
