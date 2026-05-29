/**
 * RAG documents for the knowledge-transfer seed.
 *
 * 14 markdown files written to <project>/documents/ and indexed via
 * POST /api/workspace/<project>/rag/index-document. These are the
 * substrate the agent retrieves from when answering trainee questions —
 * separate from the wiki (which is the *structured* knowledge base).
 *
 * Language split (intentional, mirrors Lumitec's reality):
 *   - In-house material in German.
 *   - OEM customer glossary + RFQ excerpts in English.
 *   - Mixed-language documents (e.g. the GB 4599 digest) explicitly
 *     declare a term-mapping at the bottom.
 *
 * Stylised content. No real OEM, no real supplier IP.
 */

export interface RagDocDraft {
  filename: string;
  body: string;
}

export const RAG_DOCS: RagDocDraft[] = [
  {
    filename: 'lumitec-handbook-led-module-development.md',
    body: `# Lumitec Handbuch — LED-Modul-Entwicklung (Auszug)

**Ausgabe:** 2026-Q1, intern.
**Geltungsbereich:** LED-Modul-Team, Geschäftsbereich Beleuchtung.

## §1 Geltungsbereich
Dieses Handbuch beschreibt die hauseigenen Vorgehensweisen zur
Entwicklung von LED- und Matrix-LED-Modulen für die drei aktiven
Plattformprogramme (OEM-A, OEM-B premium, OEM-C commercial-van).
Inhalte sind verbindlich für alle Engineers im Bereich, ergänzend zu
externen Normen (ISO 26262, AUTOSAR, ECE R148/R149).

## §2 Modul-Entwicklungs-Phasen
Pro Programm durchläuft jedes Modul:

1. **Konzeptphase** — Bauteilauswahl, Lessons-Learned-Review,
   thermische Vorauslegung.
2. **A-Muster** — Hardware-Funktionsmuster ohne Spec-Eintragung.
3. **B-Muster** — Hardware in Vor-Serien-Konfiguration, Software in
   Verifizierungs-State.
4. **C-Muster** — Vorserie auf Werks-Linie.
5. **SOP** — Serienanlauf.

Ein Phasenwechsel verlangt Engineer + Team-Lead + Functional-Safety-
Manager-Freigabe (§3.4 unten).

## §3.4 Phasenwechsel-Freigabe
Eine Phasenfreigabe gilt als erteilt, wenn:
- alle Customer-Requirements der Phase in Polarion den Status
  *committed* oder *verified* haben (je nach Phase),
- die FMEDA mindestens auf SPFM ≥ 90 % aktualisiert wurde
  (ASIL-B-Baseline; siehe ISO 26262-5 §8.4.5),
- der EoL-Photometrie-Test in mindestens 3 aufeinanderfolgenden
  Stichproben innerhalb der Spec liegt,
- keine offenen Defects der Schweregrade *blocker* oder *critical*
  im zugeordneten JIRA-Board existieren.

## §4.3 Fertigungsschnittstelle
*[Auszug — siehe Wiki-Seite 2.4 für die ausformulierte Fassung.]*
Vom Die-Bonding über SMT bis zum End-of-Line-Test durchläuft jedes
Modul sechs Stationen. Lumitec-eigene Linien sind die SMT-Linie in
Plauen und der EoL-Test in Reutlingen. Bonding ist extern (japanischer
Chip-Lieferant), Final-Assembly extern (europäischer Kontraktfertiger).

## §6 Lessons Learned
Bei einem Felddefekt mit Marktkonsequenzen ist innerhalb von 5
Werktagen ein 8D-Report durch den Supplier-Quality-Engineer
einzureichen. Die Lessons-Learned daraus werden in der Wiki unter
\`wiki/topics/lessons-learned-<jahr>.md\` verlinkt.
`,
  },
  {
    filename: 'iso-26262-asilb-our-baseline.md',
    body: `# ISO 26262 — Lumitec-Baseline ASIL B (Spickzettel)

**Zweck:** Sieben Seiten Norm in einer halben Stunde Lesedauer.
**Stand:** 2026-04-12, intern.

## Was bedeutet ASIL?
Automotive Safety Integrity Level. Vier Stufen: A < B < C < D, plus
"QM" (kein ASIL — qualitätsgemanagt). Bestimmt aus drei Faktoren:

| Faktor | Wertebereich | Was bedeutet er |
|---|---|---|
| **S** Severity | S0 — S3 | Schwere möglicher Verletzungen |
| **E** Exposure | E0 — E4 | Wahrscheinlichkeit der Situation |
| **C** Controllability | C0 — C3 | Beherrschbarkeit durch Verkehrsteilnehmer |

ASIL wird aus einer Tabelle abgelesen (ISO 26262-3 §7.4.3).

## Lumitec-Baseline für Matrix-LED
| Funktion | S | E | C | ASIL |
|---|---|---|---|---|
| Abblendlicht — Verlust | S2 | E4 | C2 | **B** |
| Fernlicht — ungewolltes Aktivieren | S2 | E3 | C2 | **B** |
| Matrix-Segment — ungewolltes Aktivieren (Blendung) | S2 | E4 | C2 | **B** |
| DRL — Ausfall | S1 | E4 | C1 | **A** |
| dyn. Blinker — fehlerhafte Sequenz | S0 | E4 | C2 | **QM** |
| ADB ohne Kamera-Pipeline | S2 | E3 | C2 | **B** |
| ADB mit Kamera-Pipeline (programmspezifisch) | S2 | E3 | C3 | **C** |

**→ Default-Tier für Lumitec-Programme: ASIL B.** Eine ASIL-C-
Klassifikation entsteht nur, wenn die Kamera-Pipeline in unseren
Scope fällt; das ist programmweise zu entscheiden, nicht generisch.

## Hardware-Metriken (ASIL B)
- **SPFM** (Single-Point Failure Metric) ≥ 90 %.
- **LFM** (Latent Failure Metric) ≥ 60 %.
- **PMHF** (Probabilistic Metric for random Hardware Failures)
  ≤ 100 FIT für Safety Goals.

Quelle: ISO 26262-5 §8.4.5 / §9.4.

## Was du als Junior in den ersten 90 Tagen *nicht* selbst machst
- FMEDA schreiben — der Functional-Safety-Manager (Dr. Erik Wahlroos)
  besitzt das Dokument, du *liest* es.
- ASIL-Klassifikationen kommerziell verhandeln — nie ohne Erik.
- Eine Safety Goal selbst formulieren — du *prüfst* sie, du *schreibst*
  sie nicht.

## Eskalationen
Wenn ein Kunde behauptet, eine Anforderung verlange ASIL C, wir aber
ASIL B in der Klassifikation haben — *immer* an Anke + Erik weitergeben,
*nie* selbst klären.

## Sprach-Notiz (Englisch)
ASIL B in English: same letter, same meaning. SPFM target same number.
"Safety Goal" stays untranslated even in German contexts at Lumitec.
`,
  },
  {
    filename: 'autosar-classic-bsw-for-headlight-ecu.md',
    body: `# AUTOSAR Classic — BSW-Konfiguration des Headlight-ECU (Auszug)

**Stand:** 2026-04-30. **Pflege:** Janet Voss (AUTOSAR-Lead).
**Geltung:** alle drei aktiven OEM-Programme; Abweichungen sind in
\`headlight-ecu/swc/<oem>/\` zu pflegen, *nicht* in der BSW.

## BSW-Module, die wir nutzen
- **COM** + **PduR** + **CanIf** + **Can** — Bus-Kommunikation
  über CAN-FD (500 kBit/s Arbitration, 2 MBit/s Daten-Phase).
- **Dem** — Diagnostic Event Manager. Speichert DTCs (Diagnostic
  Trouble Codes) für die UDS-Schnittstelle.
- **Dcm** — Diagnostic Communication Manager. UDS-Stack.
- **NvM** — Non-volatile Memory. Speichert Kalibrierungs-Daten,
  letzten Funktionsstatus.
- **WdgM** + **WdgIf** + **Wdg** — Watchdog (HW + SW).
- **EcuM** — ECU State Manager. Startup, Shutdown, Schlafmodi.
- **Os** — AUTOSAR-Task-Scheduler (OSEK-basiert).

## Tasks und Schedule
Drei Haupttasks im Headlight-ECU:

| Task | Periode | Was läuft drin |
|---|---|---|
| \`Task_5ms\` | 5 ms | Matrix-Control-Loop, ADB-Algorithm (wenn enabled) |
| \`Task_50ms\` | 50 ms | DRL-Control, Blinker-Sequencer, Status-Update an Zentral-Steuergerät |
| \`Task_500ms\` | 500 ms | Diagnose, NvM-Persist, Health-Monitoring |

Eine Runnable in \`Task_5ms\` darf max. 800 µs Worst-Case-Execution-Time
haben (Schedule-Headroom 20 %). DaVinci meldet WCET-Overrun direkt
bei der RTE-Generierung.

## CAN-FD-Konfiguration (Lumitec-Default)
- 8 Frames im RX (Kommandos vom Zentral-Steuergerät)
- 3 Frames im TX (Status zurück)
- 2 Frames im RX für UDS

DBC-Datei pro OEM unter \`\\\\fileserver\\headlight\\dbc\\<oem>\\\`.

## SPI-Bus zum Treiber-IC
4 Slave-Selects (4 Treiber-IC-Bänke pro Scheinwerfer). SPI-Takt 8 MHz.
Burst-Schreiben aller 84 Segment-PWM-Werte: 18 µs pro Bank, alle 4
Bänke parallel → 18 µs Gesamt-Update.

## Häufige Fragen
**F:** Warum 5 ms Matrix-Control-Loop?
**A:** ADB-Latenz-Anforderung (kundenseitig 50 ms Ende-zu-Ende minus
Kamera-Latenz minus CAN-Latenz minus Render-Latenz → bleiben 5 ms
für unsere Control-Loop). Siehe auch \`iso-26262-asilb-our-baseline.md\`
für die zugeordnete Safety Goal "FRT 250 ms".

## Sprach-Notiz
AUTOSAR-Begriffe bleiben Englisch auch in deutschen Dokumenten:
*Runnable*, *Task*, *BSW*, *RTE*, *SWC*, *CAN-FD*, *Frame*, *DTC*.
`,
  },
  {
    filename: 'oem-a-program-glossary.md',
    body: `# OEM-A Program Glossary (English — Customer Contract Language)

**Purpose:** definitions used by OEM-A in their requirements and in
the weekly status calls. **The contract language is English** — use
these terms unchanged in any document that goes back to OEM-A.

## Lifecycle phases (OEM-A vocabulary)
- **A-sample** — first hardware sample, often hand-assembled. No
  warranty.
- **B-sample** — pre-production hardware, software in verification
  state. Where we are now on the OEM-A program (2026-Q2).
- **C-sample** — production-tooled hardware, full SW release candidate.
- **PPAP submission** — Production Part Approval Process documentation
  package to OEM-A's quality team.
- **SOP** — Start of Production.

## Photometric acceptance terms
- **FRT** — Functional Response Time. The contract spec is 250 ms
  end-to-end for matrix segment activation / deactivation. Internally
  documented as Safety Goal in our ASIL B baseline (see
  \`iso-26262-asilb-our-baseline.md\`).
- **HV point** — horizontal-vertical reference axis of the headlamp
  beam, per ECE R149.
- **B50L point** — glare measurement point 50 m left of the headlamp
  optical axis. ECE R149 limits glare here for left-hand traffic.

## ADB-specific
- **HD beam** — Hidden Detection beam segment, OEM-A-specific term for
  a segment that should be turned off when the camera detects oncoming
  traffic.
- **ADB-off mode** — required fallback: when the camera pipeline
  reports an internal error, the matrix collapses to a fixed low-beam
  pattern within 100 ms.

## Software / functional
- **CAN-FD high-speed** — OEM-A's CAN-FD bus is 500 kbit/s arbitration,
  2 Mbit/s data phase. (Confirm against the DBC file before testing —
  every new platform we get this nailed wrong at least once.)
- **DTC freeze frame** — UDS-defined snapshot when a Diagnostic
  Trouble Code is logged. OEM-A wants 16 bytes of snapshot per DTC.

## Quality / project terms
- **8D** — 8 Disciplines problem-solving methodology. When OEM-A finds
  a field defect, they expect an 8D report from our Supplier-Quality
  Engineer (Mira) within 10 working days.
- **ECR** — Engineering Change Request. The formal mechanism for
  changing a requirement after it has been committed in our Polarion
  workspace.

## What this glossary is **not**
This is a glossary, not a specification. Whenever a contract clause
seems to depend on the *meaning* of a term, fetch the term out of
**OEM-A's own contract document**, not this glossary — we are
translators here, not the source of truth.

## German translations for in-house discussions
For reference when discussing OEM-A internally in German:
- A-sample → *A-Muster*
- FRT → *Funktionsreaktionszeit*
- glare → *Blendung*
- 8D → *8D* (unchanged; established as a German loan-word in
  automotive QM)
`,
  },
  {
    filename: 'oem-b-premium-rfq-2026-q1-excerpt.md',
    body: `# OEM-B Premium — RFQ 2026-Q1 (Excerpt)

**Customer:** OEM-B premium (Western European premium brand).
**Program:** UB6-headlight-LH-RFQ-2026Q1, μAFS variant.
**Sent:** 2026-01-15. **Lumitec response due:** 2026-Q2-end.

> Stylised RFQ — the real customer name and program codes have been
> redacted.

## §1 Scope
OEM-B premium requests a μAFS (high-resolution adaptive front-lighting
system) for an upcoming model-year refresh. Estimated annual volume:
~120,000 units / year (premium segment).

## §2 Headline requirements
- **μAFS resolution:** ≥ 1,024 individually controllable pixels per
  headlamp.
- **Pixel switching latency:** end-to-end ≤ 80 ms (camera to pixel
  output).
- **Photometric standards:** ECE R149 + FMVSS 108 (target market is
  EU and North America). GB 4599 not required for this program.
- **Functional safety:** ASIL B for matrix-segment integrity. The
  ADB algorithm is on OEM-B's side (their domain controller); we
  drive pixels, not the algorithm.
- **Lifecycle:** A-sample 2027-Q3, SOP 2028-Q4.

## §3 Variant requirements
- Three trim variants, differing only in software calibration
  (luminance signature, dynamic indicator pattern). No hardware
  variance between trims.
- Right-hand-drive variant for UK / Japan markets.

## §4 Re-use expectations
OEM-B premium *prefers* Lumitec to re-use components from previous
programs where regulatorily and quality-equivalently possible —
specifically the matrix-driver IC family ("Lumitec Gen-4 driver" in
our internal vocabulary). However: any re-use must come with a
re-validation plan.

## §5 Quality / process
- Lumitec must show **ASPICE Level 2** assessment evidence at the RFQ
  response.
- PPAP at C-sample. Initial samples (A-sample) shipped to OEM-B's
  test track in Sweden.

## §6 Commercial deadlines
- Quote with bill of materials due 2026-Q2-end.
- ECR window closes 14 days before the quote deadline. Late ECRs
  trigger price-adjustment terms.

## What this means for Lumitec
- μAFS is *new territory* compared to matrix-LED — different IC family,
  different optical micro-elements. Tariq's optics team will need to
  carry significant load on the design front.
- Hardware re-use vs. new design: see internal sourcing memo (not in
  this RFQ).
- Safety target ASIL B is consistent with our baseline; no special
  classification effort needed.
`,
  },
  {
    filename: 'oem-c-commercial-van-platform-overview.md',
    body: `# OEM-C Commercial-Van Platform Overview (English — Customer Comms)

**Customer:** OEM-C (European-Asian commercial-van joint venture).
**Program:** CV-light-platform-25kg-payload-class.
**Status:** SOP +90 days. **Volume:** ~80,000 units / year.

## Vehicle context
OEM-C's commercial van targets last-mile delivery and small-commercial
fleets, primarily in **China + South-East Asia + selected European
countries**. Two body lengths (medium / long), single LHD/RHD
variation, two roof heights. Headlamp module unchanged across body
lengths; differs only across LHD vs RHD.

## Regulatory mix
- **GB 4599** — primary market is China. Glare limits at B50L are
  stricter than ECE R149 (Lumitec internal digest in
  \`gb4599-glare-rules-summary.md\`).
- **ECE R149** — European market. Same module, photometric tuning
  validated against both regimes.
- **FMVSS 108** — not required.

## Why this program is *particularly* useful for new engineers
Three things make OEM-C a good training program for someone new:
1. **It is the only post-SOP program in our current portfolio** —
   field defect data flows in continuously. Triaging real failures is
   more instructive than theoretical reviews.
2. **The lifecycle is mature** — you cannot change much. That removes
   "what should I design" from your daily decisions, leaving "how do I
   investigate / document / verify".
3. **Two regulatory regimes** — every photometric question carries
   the "which norm?" follow-up. You learn that habit faster here than
   on a single-market program.

## Current open topics (Q2/2026)
- 11 field defects in JIRA board CVL-FIELD. Severity distribution: 1
  blocker, 3 critical, 7 minor. The blocker is a GB-4599 glare
  border-line case — see internal incident log.
- PPAP refresh due Q3/2026 — change of driver-IC supplier (see
  \`driver-ic-selection-history-2022-2026.md\` for the chronology).

## Stakeholder map
- **Lumitec PM:** Lars Petersen (also OEM-A PM; carries both).
- **OEM-C technical lead:** contact via Lars; no direct comms expected
  from junior engineers.
- **Production line:** Werk 2 (Plauen) — same SMT line as OEM-A.

## What you (as a new engineer) typically do on this program
1. Read the latest 8D for an open field defect (Mira can point you to it).
2. Reproduce on the HiL rig if reproducible.
3. Update Polarion verification status accordingly.
4. If a defect needs a software change: file the JIRA ticket, link
   the Polarion item, route to Janet's SWC team.
`,
  },
  {
    filename: 'gb4599-glare-rules-summary.md',
    body: `# GB 4599 — Glare-Regeln (Auszug, mit Term-Mapping DE↔EN)

**Norm:** GB 4599-2014 mit Updates 2018, 2021 — relevant für OEM-C
commercial-van.
**Stand:** Auszug 2026-04. **Pflege:** Tariq Maleki + externer Berater.

## Was ist anders gegenüber ECE R149?
Drei wesentliche Unterschiede, die *jede* OEM-C-Photometrie-Diskussion
beeinflussen:

1. **Strengere Glare-Limits am Messpunkt B50L**:
   - ECE R149: max. 750 cd
   - GB 4599: **max. 625 cd**
   → OEM-C-Module müssen mit ~20 % Headroom unter dem ECE-Limit
   designt werden, sonst durchfallen in China.
2. **Andere Messpunkt-Positionen** für Hellhell-Verteilung. Der
   "75R"-Punkt liegt geringfügig anders.
3. **Strengere Anforderungen an Farbkonstanz** über den
   Helligkeits-Bereich — was bei Treiber-IC-Auswahl bei niedrigen
   Dimmstufen kratzt.

## Mess-Setup
- Goniometer in einem zertifizierten chinesischen Labor (häufig
  Shanghai oder Wuhan). Lumitec testet vorher in München gegen ECE,
  *zusätzlich* mit chinesischen Mess-Parametern als Trockenlauf.
- Vor SOP wird mindestens ein Scheinwerfer am Ziel-Labor in China
  vorgeführt.

## Term-Mapping DE ↔ EN ↔ ZH (für Kommunikation mit OEM-C)

| Deutsch | English | 中文 (zh-CN) |
|---|---|---|
| Blendung | glare | 眩光 |
| Lichtstärke | luminous intensity | 发光强度 |
| Hellhell-Verteilung | light intensity distribution | 光强分布 |
| Messpunkt | measurement point | 测量点 |
| Hell-Dunkel-Grenze | cut-off line | 截止线 |
| Goniometer | goniophotometer | 测角光度计 |

## Häufige Stolpersteine bei OEM-C
- Photometrie-Daten kommen *teils* in chinesischen Spalten, *teils*
  in englischen — vor dem Auswerten gegen das Mapping prüfen.
- "Strenger glare" wird gerne missverstanden als "weniger Licht
  insgesamt" — das ist *nicht* gemeint. Es geht um Glare-Limits, nicht
  um Gesamtlumen.

## Verweise
- Wiki-Seite [3.5 Photometrie](../wiki/topics/3-5-photometrie.md)
- Szenario [5.2 GB-4599-Failure](../wiki/topics/5-2-gb4599-failure.md)
`,
  },
  {
    filename: 'ece-r148-r149-summary.md',
    body: `# ECE R148 / R149 — Spickzettel

**Geltung:** EU, UK, Türkei, Lateinamerika, Teile Asiens. Hauptnorm
für OEM-A und OEM-B premium.

## R148 vs. R149
- **R148** — Lichtsignaleinrichtungen: Blinker, Bremslicht, Tagfahrlicht,
  Nebelschlussleuchte. Bei uns relevant für DRL und dyn. Blinker.
- **R149** — **Scheinwerfer** für Abblendlicht + Fernlicht.
  Hauptanwendungsbereich für unsere Matrix-LED-Module.

## R149 — die wichtigsten Mess-Setups
- **Photometrie bei 25 m** — Goniometer, Scheinwerfer auf 25 m
  Distanz gegen eine Mess-Wand.
- **Punkt-Mess-Tabelle** — definierte Messpunkte (HV, B50L, 50R, 25L,
  75R, …) mit Minimum- und Maximum-Werten.
- **Hellhell-Verteilung über die Mess-Wand** — Mindestwerte an
  vorgeschriebenen Linien.
- **Hell-Dunkel-Grenze (cut-off line)** — bei Abblendlicht muss die
  Grenze scharf sein (definiert über einen Kontrastwert).

## R149 — Glare
Glare-Limits sind an den Messpunkten **B50L** und **75R** (für
Linksverkehr) bzw. **B50R** und **75L** (für Rechtsverkehr).
- Limit B50L (LH-Traffic): **max. 750 cd**
- Limit 75R (LH-Traffic): **max. 12.000 cd**

## R149 — ADB-Anhang (UN-R149 + Series 03 amendments)
Adaptive Driving Beam ist in R149 explizit zugelassen, wenn:
- die Kamera-Pipeline Gegenverkehr und vorausfahrende Fahrzeuge
  zuverlässig detektiert,
- die Reaktion (Ausblenden) innerhalb von **500 ms** auf detektierte
  Fahrzeuge erfolgt,
- bei Sensor-Ausfall innerhalb von **200 ms** in einen sicheren
  Fallback-Modus (z.B. Abblendlicht) gewechselt wird.

→ **FRT 250 ms** als interne Safety Goal ist deutlich strenger als das
R149-Limit von 500 ms. Das ist eine Lumitec-Konvention — wir machen
*lieber* schneller, damit wir auch FMVSS 108 und potenzielle künftige
Verschärfungen ohne Re-Design treffen.

## R148 — Lichtsignal
Für unsere DRL- und Blinker-Module relevant:
- DRL: Lichtstärke axial 400-1.200 cd, Farbe weiß.
- Dynamische Blinker: Sequenz-Dauer min. 50 ms pro Segment, max. 200 ms
  Gesamt; alle 5 Sekunden ein Blink-Zyklus.

## Häufige Verwechslungen
- "R149" wird häufig im Sprachgebrauch generisch für "die Scheinwerfer-
  Norm" verwendet. Korrekter Bezug ist *immer* "UN-Regelung Nr. 149,
  Series xx" — Series ist relevant, weil Updates dazu kommen.
- Photometrie-Werte werden bei R148/R149 in **cd** angegeben, bei
  R148-Anhang-zu-Tagfahrlicht teilweise in lm. Vor jeder Diskussion
  klären.
`,
  },
  {
    filename: 'matrix-led-thermal-design-guide.md',
    body: `# Matrix-LED — Thermisches Design (Auszug)

**Stand:** 2026-03-22. **Pflege:** Sven Klatt (Thermo-Engineer).
**Geltung:** alle drei Matrix-LED-Programme.

## Wärmequellen
1. **LED-Chips** — Hauptwärmequelle. Bei voller Last (alle 84 Segmente
   100 %) liegen wir bei ~38 W Verlustleistung pro Scheinwerfer.
2. **Treiber-ICs** — sekundäre Quelle. Buck-Boost-Wandler-Verluste +
   Linear-Treiber-Verluste, insgesamt ~6 W bei Vollast.
3. **Steuer-µC + Peripherie** — vernachlässigbar (<0,5 W).

## Wärmesenken
- Aluminium-Heatsink an der Rückseite des LED-Trägers.
- Polycarbonat-Streuscheibe ist **kein** signifikanter Wärmepfad.
- Optionaler aktiver Lüfter bei Hochleistungs-Varianten — wird bei den
  drei aktuellen Programmen *nicht* eingesetzt.

## Auslegungs-Kriterium
- **Junction Temperature** der LED-Chips: max. 125 °C bei
  Umgebungstemperatur **+85 °C** und Lastprofil **80 % Duty Cycle** über
  60 Minuten.
- → Daraus folgt der zulässige thermische Widerstand
  (Junction-Ambient) Rth(j-a) und damit die Heatsink-Auslegung.

## Derating-Modell
Bei einer Junction-Temperatur jenseits 110 °C reduziert der Treiber-IC
den Strom (PWM-Duty-Reduktion oder Linear-Limit). Lumitec-Default:
- 110 °C: keine Reduktion
- 115 °C: -10 % Strom
- 120 °C: -25 % Strom
- 125 °C: Abschaltung des betroffenen Segments + DTC-Eintrag

Das *muss* zur Safety Goal "matrix-segment integrity" passen — eine
Reduktion ist **kein** Sicherheitsvorfall, aber eine Abschaltung muss
geloggt werden.

## Häufige Fragen
**F:** Warum 125 °C als Junction-Limit, nicht 150 °C wie im
Datenblatt?
**A:** Lebensdauer-Konsequenz. Bei 150 °C halbiert sich die L70-
Lifetime gegenüber 125 °C. Wir designen für 100.000 Stunden — daher
das konservative Limit.

**F:** Wann wird der aktive Lüfter relevant?
**A:** Bei μAFS-Designs mit > 1.000 Pixel und entsprechend höherer
Stromdichte. Erste Diskussionen für OEM-B premium laufen. Heute: nicht
relevant.

## Verweis
- Wiki [2.2 Der Scheinwerfer als System](../wiki/topics/2-2-der-scheinwerfer-als-system.md), Sub-System 5.
- Wiki [4.5 HiL-Rig](../wiki/topics/4-5-hil-rig.md) — der HiL kann
  Thermo-Belastung simulieren.
`,
  },
  {
    filename: 'driver-ic-selection-history-2022-2026.md',
    body: `# Treiber-IC-Auswahl-Historie 2022-2026

**Stand:** 2026-05-01. **Pflege:** Strategic-Sourcing + Strategic-
Engineering. **Geltung:** alle Programme.

## Zweck dieses Dokuments
Dokumentiert *warum* bei Lumitec in den letzten vier Jahren die
Entscheidung jeweils so fiel. Das ist die **Reuse-Basis** für
Vorschläge in neuen RFQs — *nicht* die Norm dafür, welcher Treiber
heute optimal ist.

## Chronologie

### 2022 — Treiber-IC "Lumitec Gen-3"
- Lieferant: **Allegro Microsystems (A8514)**.
- Programme: OEM-A Plattform (Vorgänger-Modell), OEM-C-Vorgängerprogramm.
- Begründung der Wahl: bekannte Topologie, EU-Lieferkette, gute
  Verfügbarkeit.
- Erkenntnis im Programm: SPI-Bus läuft an der Grenze bei 8 MHz
  Burst-Schreiben. Bei μAFS-Designs nicht mehr ausreichend.

### 2023 — Treiber-IC "Lumitec Gen-4" (Variante A)
- Lieferant: **Texas Instruments (TPS92520-Q1)**.
- Programme: OEM-A aktuelle Plattform.
- Begründung der Wahl: 12 MHz SPI-Burst, ASIL-B-Eignung mit
  Diagnostik-Coverage > 90 %, Roadmap-Kompatibilität mit μAFS.
- Erkenntnis: Lieferzeit-Drift im H2/2024 hat OEM-A-Lieferplan
  gefährdet. Strategic-Sourcing hat dual-source eingerichtet.

### 2024 — Dual-Source: Lumitec Gen-4 Variante B
- Lieferant: **NXP (PCA9956B-Q1)** als Zweitquelle.
- Programme: OEM-C commercial-van (Vorgänger).
- Begründung: Risiko-Diversifikation, vergleichbares Profil.
- Erkenntnis: Helligkeit-Linearität bei niedrigem Duty-Cycle (< 5 %)
  geringfügig anders. GB-4599-Farbkonstanz-Test war problematisch in
  der ersten Sample-Reihe — Linear-Treiber-Stufe wurde angepasst.

### 2025 — Lumitec Gen-4 in aktueller OEM-C-Plattform
- Aktueller Stand für OEM-C commercial-van.
- Lieferant: weiterhin NXP als Erst-, TI als Zweitquelle.

### 2026 — μAFS-Vorentwicklung
- Für OEM-B premium μAFS wird **Gen-5** entwickelt.
- Lieferant-Kandidaten: **NXP (PCA9959B-Q1, neu)** und **STMicroelectronics
  (μAFS-spezifischer Chip in Vorentwicklung)**.
- **Entscheidung steht aus**. RFQ-Antwort an OEM-B premium ist offen
  ob Gen-4-Refit oder Gen-5-Design.

## Was du als Junior aus dem Dokument lernen sollst
- Lumitec entscheidet Treiber-IC-Wahl **nie** rein technisch — Lieferzeit,
  Lieferanten-Diversifikation und Programmlaufzeit zählen mit.
- Eine "bessere" technische Wahl, die einen einzigen Lieferanten zum
  Single-Source macht, ist bei Lumitec **kein** Vorschlag, sondern ein
  Eskalations-Anlass.

## Wer entscheidet?
Strategic-Sourcing (Lead: nicht im LED-Modul-Team) + Strategic-
Engineering (Lead: nicht im LED-Modul-Team) gemeinsam. Du *prüfst*
technisch, du *wählst nicht* aus.
`,
  },
  {
    filename: 'lucidshape-quickstart.md',
    body: `# LucidShape — Quickstart für die ersten 30 Tage

**Stand:** 2026-02-14. **Pflege:** Tariq Maleki.
**Zielgruppe:** Junior-Engineers im LED-Modul-Team.

## Was LucidShape ist (und was nicht)
- **Ist:** Werkzeug zur **Definition** und **Simulation** von
  Freiformflächen für Beleuchtungs-Optik. Hauptzweck im Team: Design
  der Linsen-Cluster, Reflektor-Geometrien.
- **Ist nicht:** allgemeines CAD-Programm. Mechanik-Bauteile (Heatsink,
  Gehäuse) machst du in Teamcenter.

## Was du in den ersten 30 Tagen tun *wirst*
1. Ein bestehendes LucidShape-Modell **öffnen** und die zugehörige
   Candela-Tabelle interpretieren.
2. Eine **kleine Variante** simulieren (z.B. eine LED um 0,5 mm
   verschoben) und die Photometrie vergleichen.
3. **Reviews** mit Tariq durchgehen, *wenn* die Photometrie an einem
   Messpunkt knapp wird.

## Was du in den ersten 30 Tagen *nicht* tun wirst
- Neue Freiformflächen von Grund auf entwerfen — das ist Tariq.
- LED-Positionen optimieren mit dem Optimizer — Lizenz-Slot-knapp,
  Tariq priorisiert.
- Photorealism-Renderings für Marketing — wird per Speos gemacht (auch
  Tariq).

## Tipp: Photometrie-Werte verstehen
LucidShape liefert eine Candela-Tabelle und die Werte an den
ECE-Messpunkten. Vergleiche **immer**:
- Den Wert am **Maximum**-Punkt mit dem Limit (z.B. B50L).
- Den Wert am **Minimum**-Punkt mit dem Limit (z.B. 50R Min).
- Den **Verlauf entlang der Hell-Dunkel-Grenze** (Cut-off-Linie).

Eine Lösung, die das Maximum trifft aber das Minimum verfehlt, ist
*keine* gültige Lösung — auch wenn der Optimizer sie ausgibt.

## Häufige Anfänger-Fehler
- **Falsche LED-Datei laden** — die LED des Programms hat
  ein anderes Spektrum als die "Default-LED". Photometrie-Werte sehen
  dann gut aus, sind aber nicht relevant.
- **Glare-Limits vergessen** — der Optimizer optimiert nicht auf Glare,
  außer du sagst es ihm explizit. *Immer* nach jeder Optimierung den
  B50L-Wert prüfen.
`,
  },
  {
    filename: 'canoe-restbus-setup-headlight-ecu.md',
    body: `# CANoe-Restbus-Setup für den Headlight-ECU

**Stand:** 2026-05-02. **Pflege:** Janet Voss + Anke Brenner.

## Voraussetzungen
- CANoe-Lizenz (floating, prüfe Status im Lizenz-Manager vor Start).
- DBC-Datei des betreffenden OEM-Programms unter
  \`\\\\fileserver\\headlight\\dbc\\<oem>\\\`. **Niemals** die DBC eines
  anderen Programms verwenden — Signal-Mappings sind verschieden.
- Vector CAN-Interface (VN1640 oder VN1670) am USB-Port deiner
  Workstation.

## Schritt 1 — Projekt anlegen
1. CANoe starten, "Neues Konfigurations-Set" anlegen.
2. Zwei CAN-Channels einrichten: Channel 1 = "Body CAN-FD",
   Channel 2 = "Diagnostik UDS-Bus" (separater physischer Bus).
3. Beide Channels mit der OEM-spezifischen DBC verknüpfen.

## Schritt 2 — Restbus-Knoten erzeugen
4. Im Simulations-Setup einen Knoten "ZentralSteuergerät_Simuliert"
   anlegen.
5. Dem Knoten **alle** TX-Nachrichten zuweisen, die das Zentral-
   Steuergerät im echten Fahrzeug an den Headlight-ECU sendet.
   (Filter-Skript in der DBC liefert dir die Liste.)
6. Default-Werte für jede Signal-Position aus dem
   \`headlight-ecu/swc/<oem>/default-signals.md\` übernehmen.

## Schritt 3 — Headlight-ECU anschließen
7. Echten Headlight-ECU per Vector-Interface anschließen.
8. CANoe-Trace-Window auf den Body-CAN setzen.
9. Vor jedem Test einmal den ECU power-cyclen.

## Schritt 4 — Beispiel-Test: Matrix-Segment-Aktivierung
10. CAPL-Skript \`matrix-segment-toggle.can\` laden (liegt im
    \`headlight-ecu/test-scripts/\`-Repo).
11. Skript sendet 84-mal ein Segment-Setpoint mit 0/100/0/100/…-
    Muster, jede Sequenz 200 ms.
12. Im Trace-Fenster: erwartet sind 84 SPI-Telegramme an die
    Treiber-ICs. Wenn weniger oder mehr — Fehler.

## Tipps
- **Aufzeichnung immer mit-laufen lassen**, auch wenn du nur kurz
  testen wolltest. Beim ersten unerwarteten Verhalten brauchst du den
  Trace.
- **Symbol-Mapping aktivieren** — sonst siehst du nur Hex-Werte,
  keine Signal-Namen.
- **Bei jedem DBC-Update** Restbus-Knoten neu generieren — alte Knoten
  schicken stillschweigend falsche Signal-Längen.

## Verweis
- Wiki [4.1 CANoe](../wiki/topics/4-1-canoe.md)
- Wiki [3.2 AUTOSAR Classic](../wiki/topics/3-2-autosar-classic.md)
`,
  },
  {
    filename: 'hil-rig-booking-and-test-procedure.md',
    body: `# HiL-Rig — Buchung und Testprozedur

**Stand:** 2026-04-30. **Pflege:** HiL-Verantwortliche (Rotations-Rolle,
aktuell Sven Klatt).

## Buchung
- Tool: \`hil-booking.lumitec.intern\`.
- Default-Slot: 2 Stunden. Verlängerung nur, wenn der nachfolgende Slot
  frei ist.
- **Storno-Frist:** 24 Stunden, sonst wird der Slot dir abgerechnet
  (interne Kostenstelle).
- Bei programm-kritischer Phase (B-Muster, SOP) ist die Wartezeit oft
  3 Wochen — plane voraus.

## Sicherheits-Einweisung
**Pflicht vor der ersten Buchung.** Lehrgang dauert 90 Minuten. Themen:
- 12-V- / 24-V-Spannungsführung, Berührschutz.
- Notaus-Schalter in Labor 2.05 (links Eingang).
- Verhalten bei Brand (LED-Module sind selbstlöschend, aber
  Verkabelung nicht).
- Was *nicht* allein gemacht werden darf (Programmieren des CAN-
  Interface unter Spannung).

## Setup vor Testbeginn
1. Reservierten Modulträger anbringen.
2. Versorgungsspannungs-Profil im HiL wählen (12-V-PKW oder
   24-V-Nutzfahrzeug).
3. CAN-Interface mit dem ECU verbinden.
4. CANoe-Konfiguration vom Workstation-Laptop auf den HiL-Steuer-PC
   übertragen.
5. **Kalt prüfen**: kein Spannungsanschluss, alle Verbindungen visuell
   prüfen.
6. Spannungsversorgung manuell einschalten, Strom-Aufnahme im Idle
   plausibilitäts-prüfen.

## Test-Standard-Sequenz
1. Power-on-Reset (POR) — DTC-Liste leer?
2. Restbus-Simulation starten — Status-Telegramme kommen?
3. Funktionstest gemäß dem zugeordneten Test-Skript aus Polarion.
4. Fehlerfall-Test (z.B. Open-LED-Trigger) — wird der DTC gesetzt?
5. Power-off, Trace speichern.

## Auswertung
- Trace ablegen unter
  \`\\\\fileserver\\headlight\\hil-traces\\<programm>\\<datum>\\\`.
- Test-Resultat in Polarion mit Trace-Link verbinden.
- Bei Auffälligkeit: JIRA-Defect anlegen, Polarion-Link in
  Beschreibungsfeld.

## Häufige Fehler
- **Falsche DBC im CANoe geladen** — siehe
  \`canoe-restbus-setup-headlight-ecu.md\` Schritt 4.
- **Spannungs-Profil nicht gesetzt** — der HiL läuft mit Default-12-V,
  auch wenn das Programm 24-V ist.
- **Trace nicht gespeichert** — irreversibel; man muss den Test ggf.
  wiederholen. Lieber zu viel speichern.

## Verweis
- Wiki [4.5 HiL-Rig](../wiki/topics/4-5-hil-rig.md)
- Wiki [4.6 JIRA + Polarion](../wiki/topics/4-6-jira-polarion.md)
`,
  },
  {
    filename: 'internal-style-guide-engineering-docs.md',
    body: `# Interner Stilguide — Engineering-Dokumente

**Stand:** 2026-01-09. **Pflege:** Anke Brenner + Quality Management.
**Geltung:** alle Dokumente, die im Engineering-Workspace verfasst werden.

## Sprache
- **Standardsprache:** Deutsch. Eindeutscher kann sich seltsam
  anhören; wir lassen die etablierten Englischen Termini stehen
  (BSW, RTE, SWC, FRT, ASIL, ECR, JIRA, …).
- **Kundendokumente:** in der Vertrags-Sprache des jeweiligen OEM-
  Programms.
- **Mischformen** explizit markieren ("Auszug — Übersetzung in
  Arbeit").

## Anforderungs-Sprache
Wir folgen einem EARS-Stil (*Easy Approach to Requirements Syntax*):
- *Wenn* die Bedingung X eintritt, *muss* das System Y tun.
- *Während* der Zustand Z gilt, *muss* das System Y tun.
- *Sofern* die Anforderung W bestätigt ist, *muss* das System Y tun.
- *Falls* der Fehler F auftritt, *muss* das System Y tun.

→ **Eine Anforderung — eine Verpflichtung.** Ein Absatz mit drei
verschachtelten Pflichten ist ein Tracing-Albtraum.

## Formatierung
- Markdown. **Kein Word.** (Außer für Kundenkommunikation und PPAP-
  Pakete.)
- Überschriften maximal 4-stufig. Wenn du tiefer brauchst, restrukturiere.
- Tabellen mit Spaltenüberschriften, niemals "leere erste Zeile als
  Trenner".
- Code-Blöcke: drei Backticks, mit Sprachen-Tag (\`\`\`bash, \`\`\`python).

## Bildkonventionen
- Diagramme in Mermaid, wenn möglich (versionsfreundlich).
- Photometrie-Plots als SVG export aus LucidShape, abgelegt unter
  \`docs/figures/<programm>/\`.

## Provenance
Jede Wiki-Seite hat eine *Provenance*-Sektion am Ende, die
- die Quelldokumente listet,
- den Reviewer nennt,
- das Review-Datum trägt.

Ohne Provenance ist eine Wiki-Seite eine Notiz, kein Wissen.

## "Was wir *nicht* schreiben"
- Subjektive Bewertungen ("Lumitec ist immer schneller als
  Mitbewerber X"). Belegen oder weglassen.
- Persönliche Hypothesen als Fakt. Wenn du vermutest, schreibe
  "Vermutung:".
- Konkurrenz-Aussagen ohne Quelle. Reputations-Risiko.

## Verweise
- Wiki [3.3 ASPICE Level 2](../wiki/topics/3-3-aspice.md) — woher die
  Trace-Pflicht kommt.
- Wiki [3.4 PPAP/IATF](../wiki/topics/3-4-ppap-iatf.md) — woher die
  Dokumentations-Kette kommt.
`,
  },
];
