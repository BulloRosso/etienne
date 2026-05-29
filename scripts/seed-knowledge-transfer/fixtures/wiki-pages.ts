/**
 * Wiki pages for the knowledge-transfer seed project.
 *
 * 22 pages organised one-to-one with the curriculum ToC in
 * progress/_template.progress.json. Top-level page slugs match top-level
 * ToC node IDs (1, 2, 3, 4, 5) so the agent's "what's next?" routine and
 * the wiki coverage report can join them by slug.
 *
 * Language: German for in-house material (Lumitec's working language),
 * English for OEM customer glossaries (matches the contract language).
 * Mixed-language pages are explicitly flagged in the body.
 *
 * Status semantics (mirrors the wiki skill's contract):
 *   - stable : reviewed by a domain expert, safe to teach from
 *   - draft  : agent-generated, expert has not signed off
 *   - stub   : title + 1-paragraph placeholder; expert needs to fill
 *
 * All content is stylised. No real OEM, no real supplier IP.
 */

export interface WikiPageDraft {
  title: string;
  slug: string;
  bucket: 'topics' | 'sources' | 'queries';
  status: 'stable' | 'draft' | 'stub';
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  mission_relevance: number;
  body: string;
}

export const WIKI_PAGES: WikiPageDraft[] = [
  // ─── Top-level: 1. Deine Rolle bei Lumitec ───────────────────────────
  {
    title: '1. Deine Rolle bei Lumitec',
    slug: '1-deine-rolle-bei-lumitec',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rolle', 'einstieg', 'orientierung'],
    mission_relevance: 1.0,
    body: `# 1. Deine Rolle bei Lumitec

Willkommen im Bereich **LED-Modul-Entwicklung**, Geschäftsbereich
Beleuchtung, Lumitec Automotive GmbH, Standort Reutlingen. Diese Seite
ist der Einstiegspunkt für alle Themen, die deine eigene Position
betreffen.

## Was du in den nächsten 30 Tagen mitnehmen sollst
- Wer du bist — Position, Plattform, Verantwortungsbereich.
- Mit wem du zusammenarbeitest — sechs Schlüsselrollen im Team.
- An welchen Kundenprogrammen du beteiligt bist und in welchem
  Lebenszyklus-Stand sie stehen.
- Wo die Werkzeuge und Dokumente liegen, die du täglich brauchst.

## Unterthemen
- [1.1 Deine Verantwortung](../topics/1-1-deine-verantwortung.md)
- [1.2 Deine Kolleg:innen](../topics/1-2-deine-kollegen.md)
- [1.3 Deine Kundenprogramme](../topics/1-3-deine-kundenprogramme.md)
- [1.4 Wo Dinge liegen](../topics/1-4-wo-dinge-liegen.md)
`,
  },
  {
    title: '1.1 Deine Verantwortung',
    slug: '1-1-deine-verantwortung',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rolle', 'verantwortung'],
    mission_relevance: 0.95,
    body: `# 1.1 Deine Verantwortung

**Position:** Junior Development Engineer, LED-Modul-Team, OEM-A-Plattform.

## Innerhalb des Teams verantwortest du
- **Modul-Entwicklung** für ein Sub-System des Matrix-LED-Scheinwerfers
  (typischerweise: ein Linsen-Cluster + zugehöriger Treiber-Block).
- **Anforderungs-Tracing** in Polarion: jede deinem Modul zugeordnete
  Kundenanforderung muss eine Verifizierungsmethode haben (Sim / HiL /
  Field) und einen Status (\`open / drafted / committed / verified\`).
- **Test-Spezifikation** für dein Modul (HiL-Skripte, Bench-Tests) —
  schreibst du selbst, dein Team-Lead reviewt vor Release.
- **Defect-Triage** in JIRA für JIRA-Tickets, die auf dein Modul
  zugewiesen sind — Antwortzeit in der A-/B-Muster-Phase: 1 Werktag.

## Was du **nicht** verantwortest (auch wenn du gefragt wirst)
- **OEM-Kommunikation** — läuft über den Projektleiter (PM). Du
  beantwortest technische Detailfragen, aber keine kommerziellen oder
  Liefertermin-Themen.
- **ASIL-Klassifikation** — entscheidet der Functional Safety Manager
  (FuSa) im Rahmen der ISO-26262-Bewertung (siehe
  [3.1 ISO 26262](../topics/3-1-iso-26262.md)).
- **Lieferantenauswahl** für Treiber-ICs — entscheidet das Strategic-
  Sourcing-Team auf Basis deiner technischen Vorauswahl.

## Eskalationspfade — wer entscheidet was

\`\`\`mermaid
flowchart TD
  D[Du - Junior Dev Engineer]
  D -->|technische Frage| TL[Anke - Team-Lead]
  D -->|FuSa-relevant| FUSA[Dr. Wahlroos - Functional Safety Manager]
  D -->|Lieferanten-Auffaelligkeit| SQ[Mira - Supplier-Quality]
  D -->|Kunden-Frage| PM[Lars - Projektleiter OEM-A]
  TL -->|Eskalation OEM-A| PM
  TL -->|ASIL-Konflikt| FUSA
  PM -->|wöchentlicher Status-Call| OEM[OEM-A Engineering]
  SQ -->|8D / PPAP| SUPP[Lieferant]
  classDef self fill:#fff8e1,stroke:#b8860b
  class D self
\`\`\`

Faustregel: **du eskalierst, du entscheidest nicht.** Wenn ein Thema
zwei der Spuren oben gleichzeitig kreuzt (z. B. eine ASIL-Frage in
einem OEM-A-Audit), gehört es immer zu **Anke + FuSa**, nicht zu dir.

## Erste 30 Tage — konkret
| Tag | Was passiert |
|---|---|
| 1   | HR-Einarbeitung, Account-Setup, Werksführung. |
| 2-3 | Team-Onboarding (dieses Curriculum, Modus *guest*). |
| 4-5 | Pair-Programming am HiL-Rig mit deinem Mentor. |
| 6-10| Erste eigene Testskript-Anpassung, reviewt durch Team-Lead. |
| 11-20 | Erstes Modul-Sub-Issue (Polarion) selbstständig durchführen. |
| 21-30 | Erstes Defect-Ticket (JIRA) selbstständig abschließen. |

## Verwandte Seiten
- [1.2 Deine Kolleg:innen](../topics/1-2-deine-kollegen.md)
- [1.3 Deine Kundenprogramme](../topics/1-3-deine-kundenprogramme.md)
- [3.1 ISO 26262](../topics/3-1-iso-26262.md)
`,
  },
  {
    title: '1.2 Deine Kolleg:innen',
    slug: '1-2-deine-kollegen',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rolle', 'team'],
    mission_relevance: 0.9,
    body: `# 1.2 Deine Kolleg:innen

Diese sechs Rollen siehst du in der ersten Woche; mit allen wirst du
direkt zusammenarbeiten.

## Team-Lead — *Anke Brenner*
12 Jahre Lumitec, davor Bosch. Verantwortet das LED-Modul-Team
(7 Engineers). Wichtig für dich: jede technische Eskalation aus dem
OEM-A-Programm landet bei ihr, und sie reviewt deine Test-Specs.
**Frage Anke, wenn:** du nicht weißt, ob ein Anforderungs-Konflikt eine
Eskalation verdient.

## Optik-Spezialist — *Tariq Maleki*
Promovierter Physiker, war 6 Jahre bei einem Linsen-Lieferanten. Macht
die LucidShape-Simulationen und entscheidet die Geometrie der
Freiformflächen.
**Frage Tariq, wenn:** du Photometrie-Fragen hast oder ein Modul-Layout
die ECE-R148-Grenzwerte zu kratzen droht.

## Thermo-Engineer — *Sven Klatt*
War vor Lumitec im Bereich Power-Elektronik. Verantwortet die thermische
Auslegung der LED-Arrays und das Derating-Modell.
**Frage Sven, wenn:** ein Sub-System bei Hochtemperatur-Belastung
auffällig wird oder du den thermischen Pfad eines neuen Treiber-ICs
verstehen musst.

## AUTOSAR-SW-Lead — *Janet Voss*
Zertifizierte AUTOSAR-Architektin. Verantwortet den BSW-Layer und die
DaVinci-Konfiguration unseres Headlight-ECU.
**Frage Janet, wenn:** dein Modul ein neues Signal über CAN/CAN-FD
benötigt oder du wissen willst, welche Runnables in welchem Task laufen.

## Projektleiter:in OEM-A — *Lars Petersen*
PM für die gesamte OEM-A-Plattform. Du sprichst nicht direkt mit dem
Kunden; Lars tut das.
**Frage Lars, wenn:** du eine Frage hast, die nur OEM-A beantworten
kann — er bündelt sie in der wöchentlichen Status-Call.

## Supplier-Quality-Engineer — *Mira Kaspar*
Schnittstelle zu unseren LED-Chip- und Treiber-IC-Lieferanten. Hält
PPAPs aktuell, reagiert auf 8D-Reports.
**Frage Mira, wenn:** ein Lieferantenbauteil eine Auffälligkeit zeigt
oder eine Datenblatt-Klärung nötig ist.

## Mini-Übung
Schau in der nächsten Wochen-Standup, welche dieser sechs Rollen
welche Themen einbringt. Notiere für dich: welche Frage *würdest* du
an wen stellen? — und vergleiche mit der Tabelle oben.
`,
  },
  {
    title: '1.3 Deine Kundenprogramme',
    slug: '1-3-deine-kundenprogramme',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rolle', 'kundenprogramme', 'oem'],
    mission_relevance: 0.95,
    body: `# 1.3 Deine Kundenprogramme

Du bist zugeordnet zu **drei aktiven OEM-Programmen**. Lebenszyklus-Stand
und was das für deine Arbeit bedeutet:

## OEM-A — *Stand: B-Muster*
- Plattformprojekt, Volumenmarke.
- B-Muster: Hardware ist in Vorserie, Software in V2.x. Änderungen sind
  *teuer* — jede Änderung über einen kontrollierten ECR-Prozess.
- Deine Arbeit hier: stabilisieren, dokumentieren, Verifizierungs-
  evidenz für die Anforderungen sammeln.
- Glossar: \`documents/oem-a-program-glossary.md\` (Englisch — das
  OEM-A-Kontraktvokabular).

## OEM-B premium — *Stand: RFQ/Konzept*
- Premium-Derivat eines bestehenden OEM-B-Modells.
- RFQ-Phase: Anforderungsklärung läuft, Hardware noch nicht eingefroren.
- Deine Arbeit hier: Reuse-Vorschläge gegen die LucidShape-Bibliothek
  und unseren Treiber-IC-Bestand prüfen.
- Quelldokument: \`documents/oem-b-premium-rfq-2026-q1-excerpt.md\`.

## OEM-C commercial-van — *Stand: SOP +90 Tage*
- Nutzfahrzeug-Plattform, asiatischer Markt mit Co-Branding eines
  europäischen Herstellers.
- SOP +90: Serienanlauf, erste Felddaten kommen rein.
- Deine Arbeit hier: 8D-Reports lesen, Defekte triagieren, in Polarion
  die "verified"-Spalte voll bekommen.
- Plattformüberblick: \`documents/oem-c-commercial-van-platform-overview.md\`.

## Programm-Lebenszyklus auf einen Blick

\`\`\`mermaid
flowchart LR
  subgraph OEMA[OEM-A Plattform]
    A1[A-Muster] --> A2[B-Muster ★ jetzt] --> A3[C-Muster] --> A4[SOP]
  end
  subgraph OEMB[OEM-B premium muAFS]
    B0[RFQ ★ jetzt] --> B1[A-Muster 2027-Q3] --> B2[B-Muster] --> B3[SOP 2028-Q4]
  end
  subgraph OEMC[OEM-C commercial-van]
    C1[A-Muster] --> C2[B-Muster] --> C3[C-Muster] --> C4[SOP] --> C5[SOP +90 Tage ★ jetzt]
  end
  classDef now fill:#fff8e1,stroke:#b8860b
  class A2,B0,C5 now
\`\`\`

In welcher Phase ein Programm gerade ist bestimmt, **was du als
Engineer dort tust** — siehe nächster Abschnitt.

## Was "Lebenszyklus-Stand" wirklich bedeutet
Die Phase eines Programms (A-Muster → B-Muster → C-Muster → Vorserie →
SOP) bestimmt, **wie viel deiner Entscheidungsfreiheit übrig ist**.
A-Muster: viel — du beeinflusst Geometrie + Bauteilauswahl. SOP +90:
fast keine — du verifizierst und protokollierst.

## Verwandte Seiten
- [2.3 Markt und Regulatorik](../topics/2-3-markt-und-regulatorik.md)
- [4.6 JIRA + Polarion](../topics/4-6-jira-polarion.md)
`,
  },
  {
    title: '1.4 Wo Dinge liegen',
    slug: '1-4-wo-dinge-liegen',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rolle', 'tooling', 'orientierung'],
    mission_relevance: 0.85,
    body: `# 1.4 Wo Dinge liegen

Ein kommentierter Karte-aller-Speicherorte. Aktualisiert bei jedem
Werkzeug-Wechsel — siehe Provenance unten.

## Visuelles Inhaltsverzeichnis: Sub-System ↔ Tool ↔ Owner

![schematic-3 — die Headlight-Modul Explosionszeichnung ist nicht nur ein Bauteil-Bild; sie ist auch eine Karte deines Arbeitsalltags. Jedes Sub-System in dieser Zeichnung hat genau ein Owner-Tool: (1) LED-Arrays → Datenblaetter im Teamcenter, (2) Optik → LucidShape (Tariq), (3) Treiber-ICs → Saber/PLECS + headlight-ecu/bsw Repo, (4) μC + AUTOSAR → DaVinci Configurator + headlight-ecu/autosar-config Repo (Janet), (5) Thermomanagement → interne FEM-Tools (Sven), (6) Gehaeuse → Teamcenter, (7) Stecker + Bordnetz → Schaltplaene im Teamcenter. Wenn du nicht weisst, wer was reviewt: nimm das Schaubild, finde das Sub-System, das ist deine Eskalationsbasis.](documents/schematic-3.jpg)

## Source-Code + Konfiguration
- **Git (Bitbucket)** — \`git.lumitec.intern\`. Du brauchst SSH-Key und
  VPN. Repos:
  - \`headlight-ecu/autosar-config/\` — DaVinci-Outputs, Pflege
    durch Janet (AUTOSAR-Lead).
  - \`headlight-ecu/bsw/\` — Basic-Software-Layer.
  - \`headlight-ecu/swc/<oem>/\` — kundenspezifische Software-Components.
- **PLM: Teamcenter** — \`tc.lumitec.intern\`. Hardware-CAD, Mechanik,
  Linsen-Geometrien. Browsen über den Web-Client; Check-out nur, wenn
  du auch wirklich änderst.

## Anforderungen + Defects
- **Polarion** (Anforderungs-Tracing) — \`polarion.lumitec.intern\`.
  Pro Programm ein Projekt, pro Modul ein Document-Set.
- **JIRA** (Defects + Aufgaben) — \`jira.lumitec.intern\`. Dein Default-
  Filter: \`assignee = currentUser() AND status != Done\`.

## Simulation + Test
- **LucidShape** — installiert auf Optik-Workstations. Tariq lizenziert
  Sitzungen; du fragst, bevor du eine startest.
- **Saber** — auf den Power-Elektronik-Workstations. Treiber-IC-
  Simulationen.
- **CANoe** — auf deiner eigenen Workstation. Restbus-Konfigs liegen
  unter \`\\\\fileserver\\headlight\\canoe-configs\\\`.
- **HiL-Rig** — physisch im Labor 2.05. Buchung über das interne
  Booking-Tool (siehe [4.5 HiL-Rig](../topics/4-5-hil-rig.md)).

## Wissen
- **Wiki** (das hier) — strukturierte Markdown-Wissensbasis.
- \`documents/\` (im Workspace) — RAG-indizierte Spickzettel, Glossare,
  interne Handbücher.
- \`inbox/\` (im Workspace) — neue Dokumente, die noch nicht in den
  RAG-Pool aufgenommen wurden.

## Achtung: was *nicht* hier liegt
- **Vertragsunterlagen** — bei Einkauf/Vertrieb, nicht im Engineering-
  Workspace. Du brauchst sie auch nicht; das OEM-A-Glossar deckt die
  technisch relevanten Terme ab.
- **Personenbezogene Daten** der Lieferanten — separates HR-System.
`,
  },

  // ─── Top-level: 2. Was Lumitec macht ──────────────────────────────────
  {
    title: '2. Was Lumitec macht',
    slug: '2-was-lumitec-macht',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['produkt', 'orientierung'],
    mission_relevance: 1.0,
    body: `# 2. Was Lumitec macht

Lumitec macht **Frontbeleuchtungs-Systeme** für PKW und Nutzfahrzeuge.
Der Bereich, in dem du arbeitest, liefert das komplette
Scheinwerfer-Modul: Mechanik, Optik, Elektronik, Software.

Diese Top-Seite ist die Übersicht über das Produktportfolio, die
Systemarchitektur, den Markt und die Fertigung.

## Unterthemen
- [2.1 Produkte](../topics/2-1-produkte.md)
- [2.2 Der Scheinwerfer als System](../topics/2-2-der-scheinwerfer-als-system.md)
- [2.3 Markt und Regulatorik](../topics/2-3-markt-und-regulatorik.md)
- [2.4 Fertigungsablauf](../topics/2-4-fertigungsablauf.md)
`,
  },
  {
    title: '2.1 Produkte',
    slug: '2-1-produkte',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['produkt'],
    mission_relevance: 0.9,
    body: `# 2.1 Produkte

| Produktlinie | Kurzbeschreibung | Was es bei Lumitec besonders macht |
|---|---|---|
| **Matrix-LED** | LED-Array mit individuell ansteuerbaren Segmenten. Erlaubt selektives Entblenden. | Lumitec-Baseline: 84 Segmente pro Scheinwerfer; eigene Treiber-Topologie mit Shunt-FET-Bypass. |
| **ADB** (Adaptive Driving Beam) | Funktion *auf* Matrix-LED: Kamera-basiert blendet einzelne Segmente Gegenverkehr aus. | Lumitec-spezifisch: ADB-Algorithmus läuft im Headlight-ECU, nicht im Zentral-Steuergerät — niedrigere Latenz. |
| **DRL** (Daytime Running Light) | Tagfahrlicht. | Bei Lumitec immer mit homogen ausgeleuchteter Signaturfläche statt Punktquellen. |
| **dynamische Blinker** | Lauflicht, sequenziell. | Wir liefern die LED-Treiber-Sequencer als IP-Block, nicht als zugekaufte Lösung. |
| **μAFS** (Mikro-Adaptives Frontleuchtsystem) | Höchste Auflösungsstufe: > 1000 Pixel pro Scheinwerfer. | Lumitec hat ein μAFS-Vorentwicklungsprojekt mit OEM-B premium — siehe [1.3](../topics/1-3-deine-kundenprogramme.md). |

## Was du als Neu-Mitarbeitende:r davon kennen musst
Für die ersten 90 Tage: Matrix-LED und ADB. Die anderen Linien tauchen
in Reviews am Rand auf; das Detailwissen erwirbst du erst, wenn ein
zugeordnetes Projekt es verlangt.

## Bauteilarchitektur in der Explosionsansicht

Die zwei zentralen Produktlinien als Explosionszeichnung — was sich
hinter den Marketing-Namen tatsaechlich verbirgt:

![schematic-1 — Matrix-LED-Modul, Explosionsansicht. Von hinten nach vorne: Aluminium-Heatsink, Treiber-IC-Bank auf Träger-PCB, LED-Array mit 84 individuell ansteuerbaren Segmenten auf Submount, Primaer-Linse pro Segment, gemeinsame Sekundaer-Optik, Streuscheibe. Lumitec-spezifisch ist die Shunt-FET-Bypass-Topologie der Treiber-Bank — sie erlaubt das Abschalten eines einzelnen Segments ohne Spannungspeak auf den Nachbarn. Diese Karte solltest du dir einprägen; jede ASIL-B-Anforderung gegen "matrix segment integrity" laesst sich an einer dieser Schichten verorten.](documents/schematic-1.jpg)

![schematic-2 — μAFS-Pixel-Architektur (>1000 Pixel pro Scheinwerfer). Im Vergleich zur 84-Segment-Matrix oben: deutlich kleinere LED-Chips auf engerem Pitch, deutlich höhere Stromdichte, eigene Mikro-Linsen-Reihe pro Pixelblock. Aktuell in Vorentwicklung für OEM-B premium (siehe [1.3 Kundenprogramme](../topics/1-3-deine-kundenprogramme.md)). Das Schaubild zeigt warum Gen-5-Treiber-ICs nötig werden — Gen-4 trifft die Stromdichte-Anforderung nicht mehr.](documents/schematic-2.jpg)

## Reuse-Bibliothek
Die hauseigene Wiederverwendungsbasis liegt unter
\`documents/driver-ic-selection-history-2022-2026.md\` (Treiber-IC-
Auswahlen der letzten vier Jahre, mit Begründung). Lies sie *nicht* als
Norm — sie zeigt, **warum** vergangene Entscheidungen so fielen, nicht
welche du heute nehmen sollst.
`,
  },
  {
    title: '2.2 Der Scheinwerfer als System',
    slug: '2-2-der-scheinwerfer-als-system',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['produkt', 'systemarchitektur'],
    mission_relevance: 0.95,
    body: `# 2.2 Der Scheinwerfer als System

Der Scheinwerfer ist nicht *ein* Gerät, sondern ein Verbund aus sieben
Sub-Systemen, die zusammen die Funktion liefern. Wenn du den Eingang
und Ausgang jedes Sub-Systems verstehst, verstehst du die meisten
Anforderungen aus einem RFQ.

## Komplette Explosionsansicht

![schematic-3 — Headlight-Modul Explosionszeichnung, alle 7 Sub-Systeme sichtbar von hinten nach vorn: (7) Steckverbinder + Bordnetz-Frontend, (5) Aluminium-Heatsink mit Kuehlrippen, (3) Treiber-IC-PCB, (4) Headlight-ECU-Board mit μC, (1) LED-Array-Submount, (2) Linsen-Cluster mit Reflektoren, (6) Polycarbonat-Streuscheibe + Trägergehäuse mit Dichtungen. Die Nummern in der Zeichnung entsprechen den Sub-System-Nummern weiter unten. Diese Karte ist die beste Einzeluebersicht; eine RFQ-Anforderung "X muss schneller / kühler / heller werden" kannst du an dieser Zeichnung sofort einem Sub-System zuordnen.](documents/schematic-3.jpg)

## Die sieben Sub-Systeme
1. **LED-Arrays** — Lichtquelle (84 Segmente für Matrix). Spezifiziert
   in cd/m² pro Segment und Farbtemperatur (K).
2. **Optik** — Linsen-Cluster + Reflektoren. Lenkt das Licht in die
   Hellhell-/Hell-Dunkel-Verteilung gemäß Norm (ECE R148/R149).
3. **Treiber-ICs** — Konstantstromquellen pro Segment + Schutzlogik
   (Übertemperatur, Open-LED-Detektion). Topologie:
   Buck-Boost-Wandler + Linear-Treiber je nach Strömungsbereich.

   ![schematic-4 — Trager-PCB im Querschnitt: Multilayer-Aluminium-PCB mit thermischer Vias-Saeule unter jeder LED-Bank, oberseitige Treiber-IC-Reihen mit Konstantstrom-Kanaelen pro Segment, ruckseitiger Pad-Bereich auf den Heatsink. Erklaert, warum Lumitec hier ein 4-Layer-Board mit massiver Cu-Lage waehlt: thermischer Pfad zum Heatsink ist die kritische Constraint, nicht die elektrische Stromtragfaehigkeit. Eine typische FMEA-Frage ("kann der Pad-Bereich sich loesen?") ist an dieser Schnittansicht beantwortbar.](documents/schematic-4.jpg)
4. **Mikrocontroller + AUTOSAR-Stack** — der Headlight-ECU. Empfängt
   Kommandos vom Zentral-Steuergerät über CAN-FD, treibt die LED-Treiber
   per SPI.
5. **Thermomanagement** — Aluminium-Heatsink + Kühlrippen + optional
   aktiver Lüfter bei Hochleistungs-Varianten.
6. **Gehäuse** — Polycarbonat-Streuscheibe, Trägergehäuse, Dichtungen
   (IP6K9K).
7. **Steckverbinder + Bordnetz** — 12-V (PKW) oder 24-V (Nutzfahrzeug),
   abgesichert über ein Lumitec-spezifisches Schutzschaltungs-Frontend.

## Datenfluss durch die sieben Sub-Systeme

\`\`\`mermaid
flowchart LR
  CSG([Zentral-Steuergeraet]) -->|CAN-FD Setpoint| ECU
  subgraph SW["μC + AUTOSAR (Sub-System 4)"]
    ECU[Headlight-ECU SWCs]
  end
  ECU -->|SPI 8 MHz| TIC
  subgraph PWR["Treiber-ICs (Sub-System 3)"]
    TIC[Buck-Boost + Linear-Treiber]
  end
  TIC -->|Konstantstrom| LED
  subgraph LIGHT["LED-Arrays (Sub-System 1)"]
    LED[84 Segmente]
  end
  LED -->|Lichtstrom| OPT
  subgraph OPTSYS["Optik (Sub-System 2)"]
    OPT[Freiform-Linsen + Reflektoren]
  end
  OPT -->|Hellhell + cut-off| ROAD([Strasse])
  THR[Thermomanagement] -.-> LED
  THR -.-> TIC
  CASE[Gehaeuse IP6K9K] -.-> LED
  CONN[Stecker + Bordnetz] -.-> ECU
\`\`\`

Volle Linien = Funktionspfad (Befehl → Licht). Gestrichelte Linien =
Schutz-/Gehäuse-Funktionen, die nicht im Datenfluss liegen aber jedes
andere Sub-System mittragen.

## Wo Defekte sichtbar werden

Visuelle Auffälligkeiten an einem Sub-System verraten meistens, wo im
Datenfluss oben etwas schief läuft. Zwei Beispiele, die du beim Bench-
Test selbst erkennen können musst:

![defect-2 — Bestueckungs-Fehler auf dem Traeger-PCB (Treiber-IC-Bank schräg, Lötzinn-Brücke zwischen Pin 14 und 15). Ein solches Modul kann nicht zuverlässig die 84-Segment-Ansteuerung halten — Sub-System 3 + 4 sind beide betroffen, weil die SPI-Sequenz auf falsche Strom-Setpoints landet. Erkennen: schräge Bauteilkanten, sichtbare Brücken zwischen Pins. Im JIRA als "SMT-Bestückungsfehler" anlegen, mit Modul-Seriennummer.](documents/defect-2.jpg)

![defect-3 — Lufteinschluss in der Vergussstelle am Steckverbinder-Ausgang. Sub-System 7 (Stecker + Bordnetz) sieht visuell richtig aus, aber die IP6K9K-Dichtigkeit ist nicht mehr garantiert; bei Hochdruck-Reinigung im Feld dringt Feuchtigkeit ein. Erkennen: trübe Stelle im Vergussharz, kleine Bläschen am Steckverbinderübergang. Pflichtmaßnahme: gesamten Vergussschritt der Charge re-validieren.](documents/defect-3.jpg)

## Übung: Tracing einer Anforderung
Nimm dir eine Anforderung aus \`documents/oem-a-program-glossary.md\` —
sagen wir "FRT 250 ms Beam-Switch-Zeit" — und verfolge, welche der
sieben Sub-Systeme sie wie betrifft:
- LED-Arrays: nicht direkt — sie können beliebig schnell an/aus.
- Optik: gar nicht.
- Treiber-ICs: Schaltflanke + Anti-Flicker-Filter.
- μC + AUTOSAR: Task-Schedule + CAN-Empfangs-Latenz.
- Thermo / Gehäuse / Stecker: gar nicht.

→ Mit der Übung weißt du sofort, *wen* du fragen musst.
`,
  },
  {
    title: '2.3 Markt und Regulatorik',
    slug: '2-3-markt-und-regulatorik',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['markt', 'regulatorik'],
    mission_relevance: 0.85,
    body: `# 2.3 Markt und Regulatorik

Drei regulatorische Regime, die du auf jeder Bauteilfreigabe-Sitzung
hörst:

## ECE R148 / R149
- **R148**: Lichtsignaleinrichtungen (Blinker, Rücklicht, etc.).
- **R149**: Scheinwerfer für Abblendlicht + Fernlicht. **Das ist
  unsere Hauptnorm.** Definiert Hellhell/Hell-Dunkel-Verteilung,
  Glare-Grenzwerte, Photometrie-Messpunkte.
- Räumlicher Geltungsbereich: EU, UK, Türkei, weite Teile Lateinamerikas
  und Asiens.
- Zusammenfassung im Wiki: \`documents/ece-r148-r149-summary.md\`.

## FMVSS 108
- US-Pendant. Hat *andere* Photometrie-Messpunkte und *andere* Glare-
  Definitionen. Ein ECE-konformer Scheinwerfer ist **nicht automatisch**
  FMVSS-108-konform.
- OEM-A und OEM-B premium liefern beide nach Nordamerika. OEM-C nicht.

## GB 4599 (China)
- Chinesische Variante. Strenger bei Glare-Tests, lockerer bei
  Hellhell-Verteilung.
- OEM-C commercial-van zielt auf den chinesischen Markt — daher relevant.
- Zusammenfassung mit Englisch-Term-Mapping: \`documents/gb4599-glare-rules-summary.md\`.

## Wie das im Alltag wirkt
Du wirst keine Spezifikation freigeben, ohne dass der Lichttechniker
gegen alle drei (oder die für das Programm relevanten zwei) geprüft
hat. Falls eine Anforderung sich auf "die Norm" bezieht, **frage immer
welche** — die Antwort ist nie selbstverständlich.

## Quiz-Hinweis
Wenn du Topic 2 abschließt, kommt vom Agent ein End-of-Module-Quiz mit
4-9 Fragen, garantiert mit einer Frage zum Unterschied ECE R149 vs.
FMVSS 108.
`,
  },
  {
    title: '2.4 Fertigungsablauf',
    slug: '2-4-fertigungsablauf',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['fertigung'],
    mission_relevance: 0.7,
    body: `# 2.4 Fertigungsablauf

> **Status: draft.** Der Inhalt dieser Seite wurde vom Agent aus
> öffentlichen Quellen + dem internen Handbuch-Auszug generiert und ist
> **noch nicht** von einem Lumitec-Fertigungs-Engineer reviewt. Vorsicht
> mit Spezifika.

Vom LED-Chip bis zum verpackten Scheinwerfer durchläuft das Produkt
sechs Stationen — vereinfacht:

1. **Die-Bonding** — LED-Chip auf Substrat. Hauptlieferant für die
   Chips ist ein japanischer OEM-Lieferant; das Bonding macht ein
   europäischer Sub-Tier.
2. **SMT** — Treiber-IC, Schutzbeschaltung, Steckerleiste werden auf
   das Träger-PCB bestückt. Lumitec-eigene SMT-Linie in Werk 2 (Plauen).
3. **Ausrichtung / Alignment** — LED-Module werden mechanisch in die
   Optik eingepasst. Toleranz ±50 µm; gemessen mit optischem
   Justage-Stand.
4. **Vergiessen** — Innenraum partiell vergossen gegen Feuchtigkeits-
   eintritt im Steckverbinder-Bereich.
5. **End-of-Line-Test (EoL)** — jeder Scheinwerfer durchläuft eine
   Foto-Goniometer-Messung gegen die Spezifikation des jeweiligen
   Kundenprogramms.
6. **Verpackung + Versand** — JIT-Liefertakt an die OEM-Werke; bei
   OEM-A zweimal täglich, bei OEM-C wöchentlich (Seefracht).

## Fertigungsfluss + EoL-Rueckschleife

\`\`\`mermaid
flowchart TD
  S1[1. Die-Bonding<br/>extern, JP] --> S2[2. SMT<br/>Werk 2 Plauen]
  S2 --> S3[3. Alignment ±50µm]
  S3 --> S4[4. Vergiessen]
  S4 --> S5{5. EoL Goniometer-Test}
  S5 -->|pass| S6[6. Verpackung + JIT-Versand]
  S5 -->|fail| REW[Nacharbeit-Station]
  REW -->|N-1 Versuch| S3
  REW -->|N+1 Verschrottung| SCRAP[(QM-Scrap-Log)]
  classDef ext fill:#eceff1
  class S1 ext
\`\`\`

## Aufbau Heatsink + Vergiess-Schichten (Station 4-5)

![schematic-5 — Querschnitt durch ein vergossenes Modul nach Station 4. Von unten nach oben sichtbar: gestanzter Aluminium-Heatsink mit Kuehlrippen, Waermeleit-Pad, Lumitec-spezifische Vergiess-Schicht aus zweikomponentigem Polyurethan-Harz (auf Schaubild leicht orange angedeutet), darüber die SMT-bestueckte Treiber-IC-Bank, ein Faserplattenring als Trennlage und schliesslich die LED-Array-Auflage. Der Lufteinschluss-Defekt (defect-3 weiter unten) entsteht typischerweise am Übergang zwischen Vergiess-Schicht und Faserplattenring, wenn das Harz nicht ausreichend evakuiert wurde. Diese Schnittansicht ist die einzige Quelle, an der du das visuell verstehen kannst — kein Lumitec-Handbuch hat die Vergiess-Spec öffentlich.](documents/schematic-5.jpg)

## Visuelle Defekt-Muster, die du erkennen können musst

Sechs der acht Defekt-Bilder dieser Wiki stammen aus der Fertigung. Du
solltest jedes davon auf einen Blick einer Station zuordnen können.

![defect-1 — Streuscheibe leicht getruebt, Lichtaustritt durch milchige Zone gestreut. Tritt typischerweise an Station 6 (Verpackung) auf, wenn ein Modul gegen den Verpackungs-Schaumstoff scheuert oder zu früh aus dem Vergiessofen entnommen wurde. Erkennen: leichter Dunst auf einer Seite der Scheibe, oft nur unter schraegem Licht sichtbar. Maßnahme: Modul aus dem Liefer-Tray nehmen, JIRA-Ticket "Streuscheibe getrübt" mit Charge + Tray-Position.](documents/defect-1.jpg)

![defect-2 — SMT-Ausrichtungsfehler an Station 2: Treiber-IC-Bank sitzt um ~0,8 mm verdreht. Ein menschliches Auge sieht das nur, wenn man entlang der Lötzinnkante schaut; die SMT-Linie meldet es üblicherweise selbst, aber bei manueller Nacharbeit kommt es durch. Pflichtmaßnahme: gesamte Charge nochmal AOI-prüfen, NICHT nur das eine Modul.](documents/defect-2.jpg)

![defect-3 — Lufteinschluss im Vergussharz an Station 4. Klein (Ø ~2 mm), aber in der Naehe des Steckverbinder-Austritts ein dichter Versagensanfang. Erkennen: trüber Punkt im sonst klaren Vergussbereich. Maßnahme: Vergusssparameter-Drift prüfen (Temperatur + Vakuum), Charge zurückhalten bis Sven (Thermo) und der Fertigungs-Engineer eine Freigabe geben.](documents/defect-3.jpg)

![defect-7 — Felddefekt-Foto aus dem OEM-C-Lessons-Learned (2025-Hochsommer-Welle, siehe documents/lessons-learned-thermal-field-issue-2025.md). Sub-System 5 (Thermomanagement) hatte das Material AlSi9 statt AlSi12 — bei Außentemperatur > 38 °C fielen einzelne Segmente nach 15-30 Minuten aus. Visuell: Verfärbung am Heatsink-Boden, leichte Wölbung. Heutige Charge nicht betroffen, aber Test-Profil bei +40 °C ist jetzt Pflicht.](documents/defect-7.jpg)

## Warum das für *dich* wichtig ist
- Anforderungen, die bei EoL geprüft werden, müssen messbar sein. Eine
  Anforderung wie "Licht wirkt premium" hat in der Lumitec-Praxis
  *keinen* EoL-Test — sie ist auf eine Photometrie-Anforderung
  herunterzubrechen, *bevor* du sie in Polarion akzeptierst.
- Toleranzen bei der Ausrichtung schränken die zulässige Toleranz
  deiner Optik-Designs ein. Tariq (Optik) hat dazu ein Spickzettel-
  Dokument.

## Provenance
- Quelle: \`documents/lumitec-handbook-led-module-development.md\` §4.3
- Web-Recherche: Tier-1 Lighting Manufacturing Overview (2024).
- Generiert: 2026-05-29 (Agent).
- **Review-Status: offen** — bitte Sven oder Tariq um Sichtkontrolle.
`,
  },

  // ─── Top-level: 3. Standards und Prozesse ─────────────────────────────
  {
    title: '3. Standards und Prozesse',
    slug: '3-standards-und-prozesse',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['standards', 'prozesse'],
    mission_relevance: 1.0,
    body: `# 3. Standards und Prozesse

Fünf Normen-Familien, die deinen Arbeitsalltag bestimmen. Reihenfolge
nach "Anzahl der Stunden, die du in den ersten drei Monaten pro Woche
dafür investieren wirst":

1. **ISO 26262** — funktionale Sicherheit. Lumitec-Baseline ASIL B.
2. **AUTOSAR Classic** — die SW-Plattform unseres Headlight-ECU.
3. **Automotive SPICE Level 2** — das Vorgehensmodell. Wir sind Level 2
   *assessed*.
4. **PPAP / IATF 16949** — Qualitätsmanagement. Berührungspunkt:
   8D-Reports der Lieferanten.
5. **Photometrie** — die Norm der Norm: cd, lm, Candela-Verteilung,
   Glare-Limits.

## Unterthemen
- [3.1 ISO 26262 (ASIL B Baseline)](../topics/3-1-iso-26262.md)
- [3.2 AUTOSAR Classic](../topics/3-2-autosar-classic.md)
- [3.3 Automotive SPICE Level 2](../topics/3-3-aspice.md)
- [3.4 PPAP / IATF 16949](../topics/3-4-ppap-iatf.md)
- [3.5 Photometrie-Normen](../topics/3-5-photometrie.md)
`,
  },
  {
    title: '3.1 ISO 26262 — Lumitec-Baseline ASIL B',
    slug: '3-1-iso-26262',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['standards', 'iso-26262', 'safety'],
    mission_relevance: 0.95,
    body: `# 3.1 ISO 26262 — Lumitec-Baseline ASIL B

ISO 26262 ist die Norm für **funktionale Sicherheit elektrischer/
elektronischer Systeme im Straßenfahrzeug**. Sie definiert vier
Sicherheitsstufen — **ASIL A < B < C < D** — basierend auf der
Schwere (S), der Wahrscheinlichkeit (E) und der Beherrschbarkeit (C)
einer möglichen Fehlfunktion.

## Lumitec-Baseline: warum ASIL B
Die meisten Lumitec-Matrix-LED-Funktionen liegen bei **ASIL B**:
- **Fehlfunktion:** ein Segment leuchtet ungewollt → Blendung des
  Gegenverkehrs.
- **S = S2** (mögliche, nicht-tödliche Verletzungen bei
  Nachtfahrten).
- **E = E4** (hochfrequent — nachts auf Landstraßen).
- **C = C2** (Beherrschbarkeit durch andere Verkehrsteilnehmer
  schwierig, aber möglich).
- → ASIL B.

ADB-Funktionen können punktuell auf **ASIL C** klassifiziert werden,
wenn die Kamera-Pipeline mit-betrachtet wird. Das ist eine *Programm-
spezifische* Entscheidung; bei OEM-A bleiben wir bei ASIL B (Lumitec
liefert nicht die Kamera).

## ASIL-Entscheidungs-Pfad fuer Matrix-LED

\`\`\`mermaid
flowchart TD
  H[Hazard: Segment leuchtet ungewollt] --> S{Severity}
  S -->|S0 keine| QM
  S -->|S1 leicht| E
  S -->|S2 nicht-toedlich| E
  S -->|S3 lebensgefaehrlich| E
  E{Exposure}
  E -->|E0-E1 selten| QM
  E -->|E2 niedrig| C
  E -->|E3 mittel| C
  E -->|E4 hoch| C
  C{Controllability}
  C -->|C0 einfach| QM
  C -->|C1 einfach| ASILA[ASIL A]
  C -->|C2 schwierig aber moeglich| ASILB[ASIL B - Lumitec Baseline]
  C -->|C3 sehr schwierig| ASILC[ASIL C - z.B. mit Kamera-Pipeline]
  QM([QM - kein ASIL])
  classDef baseline fill:#fff8e1,stroke:#b8860b
  class ASILB baseline
\`\`\`

Im Lumitec-Default-Fall: **S2 + E4 + C2 = ASIL B**. C3 (und damit
ASIL C) wäre nur drin, wenn die Kamera-Pipeline in unserem Scope
läge — die ist sie bei OEM-A nicht.

## Was ein Leakage-Mode (kein Safety-Fall) konkret aussieht

Nicht jeder Bauteil-Mangel ist ein FuSa-Fall. Beispiel aus dem
FMEA-Auszug (siehe \`inbox/fmea-excerpt-matrix-segment-leakage.docx\`):

![defect-8 — Matrix-Segment Leakage-Mode. Ein Segment leuchtet im "aus"-Zustand mit ~1-3 % der Nennhelligkeit (Restlichtspur). Klassifikation: QM, nicht safety-relevant — Helligkeit liegt unter der Glare-Schwelle B50L. Erkennen: im Dunkelraum-Test eine schwache Aufhellung an einem Segment, das laut Setpoint aus sein sollte. Wichtig: trotzdem dokumentieren, weil bei OEM-B premium-RFQ als "known characteristic" deklariert werden muss.](documents/defect-8.jpg)

## Was das für deine Arbeit bedeutet
- **Safety Goals** werden pro Funktion definiert. Beispiel: "Ein
  fälschlich aktiviertes Segment muss innerhalb von 250 ms deaktiviert
  werden." (FRT-250ms — taucht auch bei Volkswagen-RFQs auf.)
- **FMEDA** (Failure Modes, Effects and Diagnostic Analysis): du wirst
  in deinen ersten 90 Tagen *keine* FMEDA selbst schreiben — du wirst
  aber lesen können müssen.
- **Hardware-Metriken**: bei ASIL B brauchst du SPFM ≥ 90 %, LFM ≥ 60 %
  (Faustregel; siehe ISO 26262-5 Tabelle).

## Wo's bei Lumitec liegt
- Cheatsheet: \`documents/iso-26262-asilb-our-baseline.md\` (intern,
  deutsch).
- Safety Manager: *Dr. Erik Wahlroos* (zentrale Funktion, nicht im
  LED-Modul-Team).
- Eskalation: bei jedem Konflikt zwischen einem Kundenwunsch und
  unserer ASIL-Klassifikation eskaliere an Anke + Erik.

## Sprach-Adapter (für englischsprachige Lernende)
ASIL B in English contexts: **ASIL B = "Safety Integrity Level B" per
ISO 26262**. Hardware metric targets are SPFM ≥ 90 %, LFM ≥ 60 %.
Lumitec's safety case for matrix-LED is documented in
\`documents/iso-26262-asilb-our-baseline.md\` (currently German;
translation work-in-progress for OEM-A's safety review meeting).
`,
  },
  {
    title: '3.2 AUTOSAR Classic',
    slug: '3-2-autosar-classic',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['standards', 'autosar', 'software'],
    mission_relevance: 0.9,
    body: `# 3.2 AUTOSAR Classic

Der **Headlight-ECU** läuft auf AUTOSAR Classic 4.4. Adaptive AUTOSAR
spielt bei uns *keine* Rolle — das wäre Sache der zentralen Domänen-
Steuergeräte.

## Die drei Schichten
1. **BSW (Basic Software)** — abstrahiert Hardware (CAN-Treiber,
   SPI-Treiber, NVM, Watchdog). Wird hauptsächlich generiert; was
   geschrieben wird, ist Konfiguration.
2. **RTE (Runtime Environment)** — vermittelt zwischen BSW und SWCs.
   Vollständig generiert.
3. **SWCs (Software Components)** — das ist *unser* Code.
   Lumitec-spezifisch: ein SWC pro Funktion (matrix-control, adb-
   algorithm, drl-control, blinker-sequencer, …).

## Headlight-ECU Hardware-Stackup

Bevor wir den AUTOSAR-Stack betrachten — was steckt physisch in der ECU?

![schematic-6 — Headlight-ECU Hardware-Explosionsansicht. Von links nach rechts entlang der Hauptachse: CAN-FD-Transceiver mit Common-Mode-Choke, Watchdog-IC, 32-bit-Mikrocontroller (Aurix-Familie), externer Flash + NVM, SPI-Master mit 4 Slave-Selects zu den vier Treiber-IC-Baenken, Schutzbeschaltung gegen Bordnetz-Spikes, Stecker-Frontend. Wichtig fuer das mentale Bild: die Software-Schichten (BSW/RTE/SWC) leben alle auf dem μC; alles links davon ist BSW-Treiber-Hardware, alles rechts ist Sub-System 3 (Treiber-ICs) auf einem separaten PCB. Diese Trennung erklärt, warum Janet (AUTOSAR-Lead) und das Power-Elektronik-Team an unterschiedlichen PCBs arbeiten.](documents/schematic-6.jpg)

## Pfad eines Matrix-Setpoints durch den Stack

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant CSG as Zentral-Steuergeraet
    participant CAN as BSW: Can/CanIf/PduR
    participant COM as BSW: COM
    participant RTE
    participant SWC as SWC matrix-control
    participant SPI as BSW: SPI
    participant DIC as Treiber-IC

    CSG->>CAN: CAN-FD Frame (Segment-Setpoint)
    CAN->>COM: Signal unpack
    COM->>RTE: Read port "MatrixSetpoint"
    RTE->>SWC: Task_5ms runnable
    SWC->>SWC: Algorithmus + Safety-Check
    SWC->>RTE: Write port "PWM_84_Segments"
    RTE->>SPI: Trigger Burst-Write
    SPI->>DIC: 18 µs Burst (alle 4 Baenke)
    Note over CSG,DIC: End-to-end ≤ 5 ms (Schedule-Headroom 20 %)
\`\`\`

Janet hält den Schedule + die kanonische arxml-Datei. Du fasst die
linke Hälfte (Schritte 1-3 + 8) **nie** allein an; die rechte (4-7) ist
dein Spielraum.

## Was du als Junior in den ersten 90 Tagen siehst
- **DaVinci Configurator** öffnen, eine Komponenten-Konfiguration
  ansehen, einen neuen Port hinzufügen, RTE neu generieren.
- Eine **Runnable** in einem bestehenden SWC ergänzen, in den richtigen
  Task einplanen.
- **Restbus-Simulation** in CANoe aufsetzen, um deinen SWC zu testen,
  ohne das echte Zentral-Steuergerät zu brauchen.

## Was du **nicht** machst
- BSW-Konfiguration ändern ohne Janet — das kann den ganzen Schedule
  durcheinanderbringen.
- Eine eigene RTE-Konfiguration aus dem Nichts erzeugen — die ist
  programmweit konsistent und Janet hält die kanonische Version.

## Verweise
- AUTOSAR-Cheatsheet: \`documents/autosar-classic-bsw-for-headlight-ecu.md\`
- CANoe-Setup für unser Restbus: \`documents/canoe-restbus-setup-headlight-ecu.md\`
- [4.1 CANoe](../topics/4-1-canoe.md), [4.2 DaVinci Configurator](../topics/4-2-davinci.md)
`,
  },
  {
    title: '3.3 Automotive SPICE Level 2',
    slug: '3-3-aspice',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['standards', 'aspice', 'prozesse'],
    mission_relevance: 0.8,
    body: `# 3.3 Automotive SPICE Level 2

Lumitec ist **ASPICE Level 2 assessed**. Das ist relevant, weil es
unsere Auditverpflichtungen gegenüber den OEMs definiert und weil
dein Polarion-Tracing genau dem Modell folgt.

## Die für dich relevanten Prozesse
- **SYS.1** — Anforderungs-Erhebung. Anforderungen kommen vom Kunden,
  werden bei uns in Polarion in Customer-Requirements-Workspaces
  abgelegt.
- **SYS.2** — System-Anforderungs-Analyse. Wir zerlegen Kundenforderungen
  in System-Anforderungen.
- **SYS.3** — System-Architektur-Design.
- **SWE.1 → SWE.6** — Software-Anforderungs-Analyse → Architektur →
  Detail-Design → Unit-Implementation → Unit-Test → Integration-Test.

## Was bedeutet "Level 2 assessed"?
- **Level 1**: der Prozess wird *durchgeführt*.
- **Level 2**: der Prozess wird *gemanaged* — Planung, Tracking,
  Konfigurationsmanagement, Qualitätssicherung. **Hier sind wir.**
- **Level 3**: der Prozess ist *etabliert*. Lumitec strebt das mit einem
  internen Programm an, ist aber 2026 noch nicht so weit.

## Im Alltag
Wenn du eine Anforderung in Polarion bearbeitest, **fülle das Tracing-
Feld immer aus**. Ein Trace ist:
- *up*: zu welcher Customer-Anforderung gehört diese System-Anforderung?
- *down*: welcher Software-Anforderung / welchem Test entspricht sie?

Ein ASPICE-Audit ist im Wesentlichen: "zeig mir die Traces vollständig
und konsistent". Halbfertige Traces sind dein Hauptproblem — *nicht*
unvollständige Anforderungen.

## Tracing-V auf einer Folie

\`\`\`mermaid
flowchart LR
  SYS1["SYS.1<br/>Customer Req"]
  SYS2["SYS.2<br/>System Req"]
  SYS3["SYS.3<br/>System Arch"]
  SWE1["SWE.1<br/>SW Req"]
  SWE2["SWE.2<br/>SW Arch"]
  SWE3["SWE.3<br/>SW Detail Design"]
  SWE4["SWE.4<br/>Unit Impl"]
  SWE5["SWE.5<br/>Unit + Integ Test"]
  SWE6["SWE.6<br/>SW Qualification"]
  ITEST["Integration-Test"]
  STEST["System-Test"]
  ATEST["Acceptance"]
  SYS1 --> SYS2 --> SYS3 --> SWE1 --> SWE2 --> SWE3 --> SWE4 --> SWE5
  SWE5 -.up.-> SWE6
  SWE6 -.up.-> ITEST
  ITEST -.up.-> STEST
  STEST -.up.-> ATEST
  ATEST -.verifiziert.-> SYS1
  classDef polarion fill:#fff8e1,stroke:#b8860b
  class SYS1,SYS2,SWE1,SWE5 polarion
\`\`\`

Die **gelb markierten** Stationen sind die, die du im Polarion-Tracing-
Feld konkret verlinkst. Ein Audit-Reviewer klickt jede gelbe Verbindung
einmal hoch und einmal runter durch — fehlt eine Kante, ist die
ASPICE-Bewertung dieser Anforderung weg.

## Stub-Hinweis
Eine Übersicht der Prozessgruppen (MAN.3, SUP.8, etc.) lege ich als
Stub an, falls du das Detail brauchst:
[ASPICE-Prozessgruppen-Übersicht](../topics/3-3-aspice-prozessgruppen.md).
`,
  },
  {
    title: '3.4 PPAP / IATF 16949',
    slug: '3-4-ppap-iatf',
    bucket: 'topics',
    status: 'stub',
    confidence: 'low',
    tags: ['standards', 'qm'],
    mission_relevance: 0.6,
    body: `# 3.4 PPAP / IATF 16949

> **Status: stub.** Diese Seite ist im Curriculum als Pflicht-Eintrag
> markiert, aber noch nicht ausformuliert. Bitte einen Expert-Reviewer
> aus dem Qualitätsmanagement (Mira oder Vertretung) um Inhalt.

Stichworte, die später in der ausformulierten Seite landen sollen:
- PPAP = Production Part Approval Process. Der Lieferant beweist:
  "ja, ich kann das in Serie liefern". Hauptberührungspunkt für dich:
  wenn ein Treiber-IC-Lieferant ein PPAP-Update einreicht und Mira dich
  bittet, eine technische Sichtprüfung zu machen.
- IATF 16949: Branchen-Qualitätsmanagement-Norm. Lumitec hat
  Zertifizierung; das hat aber kaum Auswirkungen auf deine täglichen
  Tätigkeiten — interner QM-Prozess ist der Anknüpfungspunkt.

Bis die Seite ausformuliert ist, **frag im Zweifelsfall direkt Mira
Kaspar** (Supplier-Quality-Engineer, siehe [1.2](../topics/1-2-deine-kollegen.md)).

## Wann ein 8D-Report auf den Tisch kommt

Ein 8D-Report ist der Standard-Bericht, den Lumitec von einem Lieferanten
erwartet, sobald ein Felddefekt auf ein Lieferantenbauteil zurückgeht.
Das Foto, das Lumitec dem Lieferanten mitschickt, sieht zum Beispiel so
aus:

![defect-7 — Field-Defect-Foto aus der 2025-OEM-C-Welle, wie es im PPAP-Anhang von Lumitec an den Heatsink-Lieferanten ging. Verfaerbung des Materials AlSi9 im Bereich der LED-Bank, leichte Wölbung. Antwortpflicht des Lieferanten: 8D-Report innerhalb 10 Werktagen mit Containment-Action, Root-Cause, Corrective-Action und Verifikation. Mira verfolgt diese Termine.](documents/defect-7.jpg)
`,
  },
  {
    title: '3.5 Photometrie-Normen',
    slug: '3-5-photometrie',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['standards', 'photometrie'],
    mission_relevance: 0.9,
    body: `# 3.5 Photometrie-Normen

Lichttechnik klingt esoterisch, ist aber für unseren Scheinwerfer das
**zentrale Akzeptanz-Kriterium**. Ohne Goniometer-Messung kein
Kundenabnahmetest.

## Die Größen, die du nie wieder verwechseln darfst

| Größe | Symbol | Einheit | Bedeutung | Wo es bei uns auftaucht |
|---|---|---|---|---|
| Lichtstärke | I | **cd** (Candela) | "wie hell pro Raumwinkel" | Spezifikation pro Messpunkt der ECE-Tabelle |
| Lichtstrom | Φ | **lm** (Lumen) | "wie viel Licht insgesamt" | LED-Datenblätter, Energiebilanz |
| Beleuchtungsstärke | E | **lx** (Lux) | "wie hell auf einer Fläche" | EoL-Test in 25 m Abstand |
| Leuchtdichte | L | **cd/m²** | "wie hell *wirkt* eine Fläche" | DRL-Signaturfläche-Homogenität |

## Was die Optik mit der Candela-Tabelle macht

![schematic-7 — gleiche Explosionszeichnung wie auf [4.3 LucidShape](../topics/4-3-lucidshape.md), aber hier interessieren uns die markierten Strahlengaenge. Die rote Hauptstrahlen-Buendelung trifft auf dem Messschirm in 25 m Abstand die hohe-Wert-Zone der Candela-Tabelle (B50L, HV, 75R); die gestrichelten Streupfade landen oberhalb der Cut-off-Linie und sind die kritische Glare-Quelle. Eine Aenderung an der Sekundaer-Linsen-Geometrie verschiebt direkt einzelne Candela-Werte. Wer in Polarion ein "Lichtstaerke X bei Messpunkt Y" sieht, weiss damit auch sofort, welche Optik-Komponente sich modellseitig aendern muesste.](documents/schematic-7.jpg)

## Candela-Tabelle / Beam-Pattern
Die ECE R149 definiert eine **Candela-Tabelle**: an festgelegten
Messpunkten (B50L, BR, HV, …) gibt es **Mindest- und Maximalwerte**.
Glare-Grenzwerte sind die Maxima oberhalb des Hell-Dunkel-Saums.

## Glare
"Glare" = Blendung. ECE R149 limitiert Glare über die *Punkte B50L
und 50R*; FMVSS 108 über andere Punkte und andere Limits. GB 4599 ist
strenger bei B50L.

→ Wenn dir jemand sagt "der Scheinwerfer blendet zu stark", ist die
*nicht-triviale* Anschlussfrage: "in welcher Norm?".

## Wie ein Beam-Pattern-Defekt visuell aussieht

Zwei Goniometer-Snapshots, die ein Inspector bei der EoL-Stichprobe
erkennen können muss — beide würden im echten Programm einen Hold der
Charge auslösen:

![defect-4 — asymmetrische Hellhell-Verteilung. Linke Hälfte der Hell-Dunkel-Grenze sitzt um ~0,8° tiefer als die rechte. Ursache typischerweise: Ausrichtungsfehler an Station 3 (siehe wiki/topics/2-4-fertigungsablauf.md). Erkennen am Goniometer-Plot: deutliche L/R-Asymmetrie um den HV-Punkt. Konsequenz: ECE R149 fail, OEM-A würde die Charge abweisen.](documents/defect-4.jpg)

![defect-5 — Glare-Hotspot oberhalb der Hell-Dunkel-Grenze am Messpunkt B50L. ~870 cd statt der zugelassenen ≤ 750 cd (ECE R149) bzw. ≤ 625 cd (GB 4599). Ursache hier: kleine Materialeinschlüsse in einer Linsen-Charge. Erkennen am Plot: heller Punkt deutlich über der Cut-off-Linie. Konsequenz: Markteinfuhrverbot in China bei OEM-C — siehe [5.2 GB-4599-Failure](../topics/5-2-gb4599-failure.md).](documents/defect-5.jpg)

## Sprach-Adapter (Englisch)
- Lichtstärke → **luminous intensity (cd)**
- Lichtstrom → **luminous flux (lm)**
- Beleuchtungsstärke → **illuminance (lx)**
- Leuchtdichte → **luminance (cd/m²)**
- Glare → **glare** (gleiches Wort; geht aber je nach Norm um andere
  Messpunkte).
`,
  },

  // ─── Top-level: 4. Werkzeuge ──────────────────────────────────────────
  {
    title: '4. Werkzeuge',
    slug: '4-werkzeuge',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['werkzeuge'],
    mission_relevance: 0.85,
    body: `# 4. Werkzeuge

Diese sechs Werkzeuge sind in deinen ersten 90 Tagen Pflicht. Die
Detail-Seiten unten gehen nicht in die Tiefe einer Bedienungsanleitung,
sondern erklären *was bei Lumitec besonders ist*.

- [4.1 CANalyzer / CANoe](../topics/4-1-canoe.md)
- [4.2 DaVinci Configurator](../topics/4-2-davinci.md)
- [4.3 LucidShape / Speos](../topics/4-3-lucidshape.md)
- [4.4 Saber / PLECS](../topics/4-4-saber.md)
- [4.5 HiL-Rig](../topics/4-5-hil-rig.md)
- [4.6 JIRA + Polarion](../topics/4-6-jira-polarion.md)
`,
  },
  {
    title: '4.1 CANalyzer / CANoe',
    slug: '4-1-canoe',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['werkzeuge', 'bussimulation'],
    mission_relevance: 0.85,
    body: `# 4.1 CANalyzer / CANoe

CANoe ist das primäre **Bus-Simulations-Werkzeug**. Bei Lumitec
gebraucht für:
- **Restbus-Simulation** — simuliert das Zentral-Steuergerät, damit
  du den Headlight-ECU auf deinem Schreibtisch bedienen kannst.
- **CAPL-Skripte** — automatisierte Test-Sequenzen (z.B. "schalte
  Fernlicht jeden Schritt zwischen 1 % und 100 % Helligkeit ein, miss
  Latenz").
- **Trace-Analyse** — was hat das Steuergerät an wen gesendet, in
  welcher Reihenfolge?

## Lumitec-Spezifika
- Die DBC-Datei für jeden Kunden liegt unter
  \`\\\\fileserver\\headlight\\dbc\\<oem>\\\` — **immer** die für das
  Programm passende laden, niemals die einer anderen Plattform.
- Restbus-Konfig für unser Headlight-ECU: siehe
  \`documents/canoe-restbus-setup-headlight-ecu.md\` (Schritt-für-
  Schritt-Anleitung).
- Lizenzen sind floating; bei Engpass spricht Anke mit IT.

## Häufiger Fehler in der ersten Woche
Du startest CANoe mit der falschen DBC und siehst "alles funktioniert" —
weil die Signale falsch interpretiert werden. **Vor jedem Test prüfen:
hat das Trace-Fenster die erwarteten PDU-Namen?**

## Wie ein Segment-Ausfall im CAN-Trace aussieht

Wenn ein einzelnes Matrix-Segment unerwartet aus bleibt, kannst du das
oft schon im CANoe-Trace sehen, bevor du das Modul überhaupt visuell
prüfst. Vergleichsbild aus dem HiL:

![defect-6 — Segmentausfall in der Echtzeit-Visualisierung. 84 PWM-Werte werden alle 5 ms an die Treiber-IC-Bank gesendet; ein Segment liefert in mehreren aufeinanderfolgenden Frames konstant 0 % obwohl der Setpoint 100 % war. Im CANoe-Trace zu erkennen am DTC-Eintrag "Open-LED detected" sowie an der visuellen Luecke im 84-Segment-Layout. Massnahme: HiL-Diagnose-Sitzung mit Janet einplanen, bevor das Modul ins JIRA-Ticket geht.](documents/defect-6.jpg)
`,
  },
  {
    title: '4.2 DaVinci Configurator',
    slug: '4-2-davinci',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['werkzeuge', 'autosar'],
    mission_relevance: 0.8,
    body: `# 4.2 DaVinci Configurator

Werkzeug von Vector zur **AUTOSAR-Konfiguration**. Bei Lumitec öffnest
du es vor allem, um:
- die **Konfiguration eines SWC** zu inspizieren oder leicht zu ändern,
- nach einer Änderung die **RTE neu zu generieren**,
- den Ergebnis-Code unter \`headlight-ecu/autosar-config/generated/\`
  zu integrieren.

## Lumitec-Konvention
- Janet (AUTOSAR-Lead) hält die **kanonische arxml-Datei** des
  Headlight-ECU. Du arbeitest in deinem Git-Branch, machst eine
  Änderung an *deiner* Kopie, generierst RTE neu, läufst die
  Unit-Tests — und macht einen Merge-Request an Janet.
- BSW-Konfiguration wird *fast nie* von dir geändert; wenn ja, dann
  *immer* nach Rücksprache mit Janet.

## Häufiger Fehler
Du änderst Konfiguration auf der grafischen Oberfläche, klickst
"Generate", und in der nächsten Pull-Anfrage von main ist deine
Änderung wieder weg — weil DaVinci die kanonische arxml mit Vector-
Defaults regeneriert hat. **Lösung:** vor "Generate" immer das aktuelle
arxml aus main pullen.
`,
  },
  {
    title: '4.3 LucidShape / Speos',
    slug: '4-3-lucidshape',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['werkzeuge', 'optik'],
    mission_relevance: 0.75,
    body: `# 4.3 LucidShape / Speos

Optik-Simulation. **LucidShape** ist unser Haupt-Werkzeug;
**Speos** verwenden wir punktuell für Photorealism-Renderings, wenn
ein OEM marketing-getriebene Visualisierungen verlangt.

## Lumitec-Workflow
1. Tariq (Optik-Spezialist) **definiert die Freiformflächen** in
   LucidShape.
2. Er **exportiert ein STEP**, das im Teamcenter eincheckt.
3. Du **liest das STEP** und das LucidShape-Resultat (Candela-Tabelle)
   gegen deine Modulanforderungen.
4. Wenn ein Photometrie-Messpunkt knapp wird, gehst du zu Tariq und
   diskutierst.

## Quickstart
Quickstart-Dokument für die ersten 30 Tage:
\`documents/lucidshape-quickstart.md\`. Reicht *nicht* aus, um selbst
ein Linsen-Design zu beginnen — das machst du sowieso nicht in den
ersten 90 Tagen.

## Was LucidShape eigentlich modelliert

![schematic-7 — Linsen-Cluster + Reflektoren mit Strahlengaengen. Die Explosionsansicht zeigt die typische Lumitec-Optik: pro LED-Segment eine Primaer-Linse (TIR — Total Internal Reflection), darueber eine gemeinsame Freiform-Sekundaer-Linse, an den Seiten ein Reflektor zur Erfassung der Streustrahlen. Die roten Linien sind die Hauptstrahlen, die gestrichelten die Streupfade. LucidShape simuliert genau diese Geometrie — ein RFQ-Anforderung "wir brauchen 15 % mehr Lichtstrom in Messpunkt 75R" landet als Optimization-Constraint auf der Sekundaer-Linsen-Geometrie in dieser Zeichnung. Tariq laesst LucidShape die Freiformflaeche dort iterativ verformen.](documents/schematic-7.jpg)

## Simulation vs. realer Defekt — was du an einer Reuse-Charge erkennst

LucidShape ist nur so gut wie die Ausrichtungs-Toleranzen, die in der
Realität tatsächlich eingehalten werden. Wenn das Sim-Resultat sauber
ist, das gemessene Beam-Pattern aber asymmetrisch — liegt der Fehler in
der Fertigung, nicht im Modell.

![defect-4 — Beispiel: LucidShape sagte eine symmetrische Hellhell-Verteilung um den HV-Punkt voraus; das Goniometer-Resultat zeigt eine ~0,8°-Verschiebung der linken Cut-off-Linie. Wenn das passiert: nicht die Simulation neu rechnen, sondern Station 3 (Alignment) als Verdaechtigen prüfen.](documents/defect-4.jpg)
`,
  },
  {
    title: '4.4 Saber / PLECS',
    slug: '4-4-saber',
    bucket: 'topics',
    status: 'stub',
    confidence: 'low',
    tags: ['werkzeuge', 'leistungselektronik'],
    mission_relevance: 0.6,
    body: `# 4.4 Saber / PLECS

> **Status: stub.** Detaillierte Inhalte folgen. Bitte um Reviewer aus
> dem Power-Electronics-Bereich.

Stichworte:
- **Saber**: Mixed-Signal-Simulator. Wir nutzen ihn für Treiber-IC-
  Verifizierung und Schutzbeschaltungs-Analyse.
- **PLECS**: schnellere Alternative für reine Power-Stage-Simulationen,
  wo Saber zu langsam wird.
- Beide werden hauptsächlich vom Power-Elektronik-Team genutzt; du
  *liest* die Ergebnisse, wenn ein Treiber-IC-Wechsel ansteht.

## Was du simulierst — die Lumitec-Treiber-Topologie

![schematic-8 — Treiber-IC-Schaltungstopologie pro Segment, Explosionsansicht: Buck-Boost-Wandler (links) erzeugt eine geregelte Zwischenspannung aus dem 12-V- oder 24-V-Bordnetz; daran haengt ein Linear-Treiber pro Segment, der den Konstantstrom durch die LED sicherstellt. Der Shunt-FET (gelb) ist die Lumitec-Spezialitaet: er kann das Segment unabhaengig durchschalten, ohne Spannungspeak auf den Nachbarn. Rechts daneben die Schutzbeschaltung: Open-LED-Detektion und Übertemperatur-Sense. Saber simuliert hier die Spannungs- und Stromverlaeufe; PLECS macht dasselbe schneller, wenn nur die Power-Stage interessiert. Ein Treiber-IC-Wechsel (z.B. Gen-4 → Gen-5) heisst praktisch: dieselbe Topologie, andere Komponentenwerte — die Sim wird auf die neuen Werte umgestellt und re-evaluiert.](documents/schematic-8.jpg)

Bis dieses Stub weiter ausformuliert ist: Anke fragen, welche der beiden
Tools du erst lernen sollst.
`,
  },
  {
    title: '4.5 HiL-Rig',
    slug: '4-5-hil-rig',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['werkzeuge', 'test'],
    mission_relevance: 0.8,
    body: `# 4.5 HiL-Rig

Das **Hardware-in-the-Loop-Rig** in Labor 2.05 ist physisch real und
mit Wartezeit verbunden — Buchung ist Pflicht.

## Was es kann
- Simuliert die OEM-Bordnetz-Bedingungen (Spannung, Lastprofile,
  Sensor-Eingänge).
- Stimuliert deinen Headlight-ECU über die CAN-FD-Schnittstelle, misst
  Ausgangs-Strom und PWM.
- Triggert vordefinierte Fehlerfälle (Open-LED, Overcurrent,
  Übertemperatur) — wichtig für FMEDA-Verifikation.

## Buchung
- Buchungs-Tool: \`hil-booking.lumitec.intern\`. Default-Slots sind
  2-Stunden-Blöcke.
- **In der A-/B-Muster-Phase eines Programms** ist der Rig oft 3 Wochen
  ausgebucht. Plane voraus.
- **Storno-Liste**: wenn du einen Slot brauchst und nichts frei ist,
  trag dich in die Storno-Liste ein — frei werdende Slots werden im
  Team-Channel angekündigt.

## Test-Prozedur
\`documents/hil-rig-booking-and-test-procedure.md\` enthält den
ausführlichen Ablauf inkl. Sicherheitseinweisung. **Pflichtlektüre vor
der ersten Buchung.**

## Häufiger Anfänger-Fehler
Du buchst einen 2-Stunden-Slot, brauchst aber 30 Minuten, um den ECU
in den Test-Mode zu setzen. Folge: 90 Minuten effektiv. **Vorbereitung
ist alles** — Skripte vorher checken, CAN-Logs aus letztem Lauf vorher
ansehen.

## Was haengt am HiL-Rig

![schematic-1 — am Rig ist genau dieses Matrix-LED-Modul angeschlossen (gleiche Explosionszeichnung wie in [2.1 Produkte](../topics/2-1-produkte.md)). Wichtig fuer die Vorbereitung: nicht jeder Test braucht alle Schichten. Wenn du nur die Treiber-IC-Schutzfunktion verifizierst, kann der Test mit einem "duemmeren" Bench-Modul ohne LEDs laufen; brauchst du die Photometrie, kommt das vollstaendige Modul plus Goniometer dazu. Vor jeder Buchung: Test-Skript ansehen → entscheiden, welche der Schichten unter Strom muessen → Modul-Konfiguration entsprechend buchen. Das spart locker 30 Minuten pro Slot.](documents/schematic-1.jpg)

## Test-State-Machine eines HiL-Slots

\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Setup: Slot beginnt
    Setup --> KaltCheck: Modul angeschlossen
    KaltCheck --> Setup: Sichtmaengel (zurueck zum Modulwechsel)
    KaltCheck --> Power: visuelle Pruefung ok
    Power --> Restbus: Spannung on
    Restbus --> Test: PDUs erscheinen
    Test --> Test: CAPL-Skript iteriert
    Test --> Diagnose: DTC oder unerwartetes Verhalten
    Diagnose --> Test: erklaerbar + dokumentiert
    Diagnose --> Abbruch: nicht erklaerbar
    Test --> TraceSave: Sequenz fertig
    TraceSave --> Idle: Slot beendet
    Abbruch --> Idle: Slot beendet (JIRA-Ticket)
\`\`\`

Die *kritische* Transition ist **KaltCheck → Setup** (Modul mit
visuellen Auffälligkeiten *nicht* unter Spannung setzen). Zwei Defekt-
Muster, die hier den Rückweg auslösen müssen:

![defect-1 — Streuscheiben-Trübung beim Eingang zum HiL. Auch wenn die Trübung kein elektrischer Defekt ist, fließt sie in jede photometrische Messung mit und verfälscht das Trace-Resultat. Pflicht: Modul zurück an die Fertigung, neues Modul ziehen, nicht "schnell durchtesten".](documents/defect-1.jpg)

![defect-6 — Segmentausfall, der im Kalt-Check bereits per Augenmaß sichtbar ist. Wenn ein Segment in Null-Position dunkel bleibt während andere im Reflex-Modus angesteuert sind, fängt der Test mit einer schon bekannten Anomalie an. Erkennen, im JIRA als "vor Test bereits bekannter Defekt" markieren und ggf. trotzdem testen, um zusätzliche Trace-Daten zu sammeln — nicht aber als gültiges Test-Resultat freigeben.](documents/defect-6.jpg)
`,
  },
  {
    title: '4.6 JIRA + Polarion',
    slug: '4-6-jira-polarion',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['werkzeuge', 'requirements', 'defects'],
    mission_relevance: 0.85,
    body: `# 4.6 JIRA + Polarion

Zwei verschiedene Werkzeuge mit überlappendem Anschein, aber
**unterschiedlichem Zweck**.

## Polarion = Anforderungen + Tracing
- Quelle der Wahrheit für **Customer-Requirements**, **System-
  Requirements**, **Software-Requirements**, **Test-Cases**.
- Jeder Eintrag hat einen **Workflow-Status** (\`draft\` →
  \`reviewed\` → \`committed\` → \`verified\`).
- Tracing nach oben und unten ist verpflichtend — das ist der
  ASPICE-Level-2-Beweis.

## JIRA = Aufgaben + Defects
- Quelle der Wahrheit für **Defects** (Bugs), **Tasks**, **Stories**.
- Pro Modul gibt's ein Board. Defekte aus Felddaten der OEM-C-SOP
  landen automatisch in einem dedizierten Board.

## Wann was?
| Wenn du das schreibst… | …geht es in… |
|---|---|
| "Diese Anforderung muss erfüllt werden" | Polarion |
| "Diese Anforderung ist nicht klar genug" | Polarion (als Kommentar oder Status \`clarify\`) |
| "Das Modul reagiert nicht in 250 ms" (Bug) | JIRA |
| "Ich muss noch X umsetzen" (Aufgabe) | JIRA |
| "Diese Testprozedur testet die Anforderung Y" (Trace) | Polarion |

## Hyperlink-Konvention
Wenn du ein JIRA-Ticket schreibst, das auf eine Polarion-Anforderung
zurückgeht, **immer den Polarion-Link in das JIRA-Beschreibungsfeld**.
ASPICE-Auditoren erwarten das.

## Wie JIRA und Polarion zusammenspielen

\`\`\`mermaid
flowchart LR
  FIELD[(OEM-C Felddaten)] -->|auto-import| JBOARD[JIRA Board CVL-FIELD]
  JBOARD -->|triage durch dich| TICKET[JIRA Defect-Ticket]
  TICKET -.Hyperlink.-> PREQ[Polarion-Anforderung]
  PREQ -->|Status verified?| AUDIT{ASPICE-Audit}
  TICKET -->|root cause gefunden| FIX[SW-Change-Request]
  FIX -->|Test-Update| PTEST[Polarion Test-Case]
  PTEST -->|verified| AUDIT
  AUDIT -->|Trace okay| PASS([Audit ok])
  AUDIT -->|Trace fehlt| FAIL([Audit-Befund])
\`\`\`

Die gestrichelte Linie (JIRA → Polarion) ist der häufigste Audit-
Befund: ein Defect-Ticket *ohne* den Backlink zur Anforderung. Der
Link kostet 10 Sekunden beim Anlegen — und 10 Stunden Aufräumarbeit
beim Audit, wenn er fehlt.

## Was in ein Field-Defect-Ticket gehört

Ein JIRA-Ticket aus dem OEM-C-Field-Board braucht *immer*: Modul-Seriennr.,
Datum, Foto-Evidence, Polarion-Trace, deine Hypothese zur Root Cause.

![defect-7 — Field-Foto wie es im JIRA hochgeladen werden muss. Verfärbung am Heatsink-Boden + leichte Wölbung, vom OEM-C-Mechaniker dokumentiert. So dokumentiert: Modul-Seriennr. WP02-2025-08-15-RH-0419, Aufnahme aus 30 cm Distanz, Modul-Rückseite. Hypothesen-Feld: "thermisches Derating, Wiederholfall ähnlich Q3-2025-Welle (Lessons-Learned-Memo)". Pflicht-Link zu Polarion-Customer-Req CVL-FUNC-204.](documents/defect-7.jpg)

![defect-8 — Beispiel eines QM-Eintrags (kein safety-relevanter Defect): Leakage-Mode der Treiber-IC-Stufe, im Dunkelraum nachgemessen. Ein Vergleich aller drei Lieferantenchargen über die letzten 12 Monate ist im QM-System angefügt, sodass eine spätere ECR-Diskussion die Datenbasis hat. Auch hier: Hyperlink zur entsprechenden Polarion-System-Req SYS-DRV-117.](documents/defect-8.jpg)
`,
  },

  // ─── Top-level: 5. Day-in-the-life-Szenarien ─────────────────────────
  {
    title: '5. Day-in-the-life-Szenarien',
    slug: '5-day-in-the-life',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['szenarien', 'praxis'],
    mission_relevance: 0.85,
    body: `# 5. Day-in-the-life-Szenarien

Drei verzweigte Szenarien, die der Agent als interaktive HTML-Seiten in
\`out/scenarios/\` rendern kann. Jedes basiert auf einem realen Muster,
das im LED-Modul-Team mehrfach pro Jahr auftritt.

- [5.1 Flicker auf einem B-Muster (OEM-A)](../topics/5-1-flicker-b-muster.md)
- [5.2 GB-4599-Glare-Failure (OEM-C)](../topics/5-2-gb4599-failure.md)
- [5.3 Später ECR von OEM-B premium](../topics/5-3-spaeter-ecr.md)
`,
  },
  {
    title: '5.1 Flicker auf einem B-Muster (OEM-A)',
    slug: '5-1-flicker-b-muster',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['szenarien', 'oem-a', 'troubleshooting'],
    mission_relevance: 0.85,
    body: `# 5.1 Flicker auf einem B-Muster (OEM-A)

**Auslöser:** Ein OEM-A-Engineer meldet in der wöchentlichen Status-
Mail: "Wir sehen sporadisches Flackern in einem der ADB-Segmente bei
Temperatur > 65 °C. Drei Fahrzeuge betroffen, drei nicht."

## Was wäre dein erster Reflex?
- (A) Nochmal nachfragen: hat OEM-A das Phänomen video-dokumentiert?
- (B) Eigene Hypothese aufstellen: Übertemperatur-Derating der
  Treiber-IC-Schutzschaltung?
- (C) Sven (Thermo) und Janet (AUTOSAR-SW) sofort einbeziehen?

Es gibt keine *falsche* Antwort, aber die "Lumitec-Reihenfolge" ist
A → B → C. Hier ist warum.

## Warum erst (A)?
Ein als "Flicker" gemeldeter Effekt kann fünf verschiedene physikalische
Ursachen haben (Treiber-PWM-Frequenz vs. Kamera-Shutter, thermisches
Derating, CAN-Latenz-Spitzen, Open-LED-Detektion-Glitches, Bordnetz-
Spannungseinbrüche). Ohne **Beobachtungs-Material** (Video, Logs)
ratest du, welche es ist.

## Verlauf, wenn (B) zu früh kommt
Du baust eine Übertemperatur-Hypothese, lädst dir den HiL-Rig,
reproduzierst nichts (weil's *nicht* Thermik war), verlierst zwei
Wochen. Erst dann holt sich jemand das OEM-A-Video — und sieht die
PWM-Kamera-Beat-Frequency.

## Wann (C)?
Sobald die Hypothese steht und du jemand brauchst, der die Hypothese
falsifizieren kann. *Nicht* vor dem Hypothesen-Setup — sonst läufst du
in ein Brainstorming-Meeting mit drei Senior-Engineers und null
Daten.

## Wo das Flicker im Hardware-Pfad sitzen koennte

![schematic-6 — gleiches Stackup wie in [3.2 AUTOSAR Classic](../topics/3-2-autosar-classic.md), aber hier interessieren uns die *Knotenpunkte*, an denen Flicker entstehen kann: (1) CAN-FD-Receiver bei Bordnetz-Spannungseinbruechen — koennte ein Frame missen; (2) SPI-Master beim Burst-Write — koennte einen Wert verkippen; (3) Treiber-IC-PCB bei Übertemperatur-Derating; (4) μC Watchdog-Reset bei Stack-Overflow. Die fuenf Reflex-Hypothesen (PWM-Kamera-Beat, Thermo, CAN-Latenz, Open-LED-Glitch, Bordnetz-Spike) bilden sich genau auf diese vier Knoten ab. Wenn du das Schaubild vor dir hast, ist die Hypothesen-Diskussion mit Janet 50 % schneller.](documents/schematic-6.jpg)

## Die Reflex-Reihenfolge als Flowchart

\`\`\`mermaid
flowchart TD
  IN[OEM-A-Meldung: Flicker bei T>65 C] --> A{Video / Logs vorhanden?}
  A -->|nein| ASK[A. Beobachtungs-Material anfordern]
  A -->|ja| B[B. Hypothese formulieren]
  ASK --> A
  B --> CHECK{Hypothese pruefbar?}
  CHECK -->|nein, brauche Specialists| C[C. Sven + Janet einbinden]
  CHECK -->|ja, HiL reicht| HIL[HiL-Test laufen]
  C --> HIL
  HIL --> FIX[Root Cause + Fix]
  classDef bad fill:#ffebee,stroke:#c62828
  classDef good fill:#e8f5e9,stroke:#2e7d32
  BAD1[direkt zu B ohne Daten<br/>2 Wochen verloren]:::bad
  BAD2[direkt zu C ohne Hypothese<br/>Senior-Meeting ohne Daten]:::bad
  GOOD1[Reihenfolge A → B → C<br/>3 Werktage zum Fix]:::good
  IN -.falsch.-> BAD1
  IN -.falsch.-> BAD2
  IN -.richtig.-> GOOD1
\`\`\`

## Hinweise auf moegliche Bauteil-Ursachen

Im Live-Szenario kann der Defekt auch ein Hardware-Symptom sein, das
einen Reflex früher hätte stoppen müssen:

![defect-2 — wenn das beanstandete Modul aus einer Charge mit dokumentiertem SMT-Versatz stammt (siehe Fertigungsablauf), wird das thermische Verhalten unzuverlässig. Vor dem HiL-Lauf: visuelle Pruefung der Treiber-IC-Banken auf schräge Bauteilkanten. Steht der Verdacht, dann ist die Ursache nicht das Klima im Fahrzeug sondern eine Charge-Auffaelligkeit.](documents/defect-2.jpg)

![defect-6 — wenn der Reflex (B) Treiber-IC-Übertemperatur lautet, wäre der typische Trace-Befund eine wiederholte 0 %-PWM-Phase an demselben Segment. Sieht der HiL-Trace stattdessen ein gleichmaessig verteiltes Flacker-Muster, falsifiziert das die Übertemperatur-Hypothese und bestätigt eher den PWM-Kamera-Beat. Erstmal Defekt-Bild dokumentieren, dann Janet einbinden.](documents/defect-6.jpg)

## Verzweigtes Szenario (out/scenarios/5.1-flicker-on-b-sample.scenario.html)
Der Agent rendert dieses Szenario auf Anfrage als interaktive HTML-
Seite mit drei Wahlmöglichkeiten und Konsequenzen — eine Variante mit
"check thermal log", "ask OEM for repro count", "open AUTOSAR DTC
trace". Probier's selbst aus.
`,
  },
  {
    title: '5.2 GB-4599-Glare-Failure (OEM-C)',
    slug: '5-2-gb4599-failure',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['szenarien', 'oem-c', 'regulatorik'],
    mission_relevance: 0.75,
    body: `# 5.2 GB-4599-Glare-Failure (OEM-C)

**Auslöser:** OEM-C meldet aus dem chinesischen Markt: bei einem
unabhängigen Zertifizierungs-Labor in Shanghai fällt ein Scheinwerfer
beim Glare-Test (Messpunkt B50L) knapp durch. Spec-Limit: 700 cd. Gemessen:
730 cd. Konsequenz für OEM-C: Marktverbot ab Quartal +1.

## Erstreaktion
- **Nicht** sofort anrufen "wir haben das in München mit ECE R149
  getestet, das ist anders". *Du* weißt das, aber das hilft OEM-C
  jetzt nicht.
- **Photometrie-Daten anfordern**: vollständige Candela-Tabelle, nicht
  nur den einen Punkt. Glare-Failures sind selten isoliert.

## Mögliche Ursachen
1. **Toleranz-Drift** im EoL-Test (Justage-Stand falsch kalibriert).
2. **Linsen-Geometrie hat sich verschoben** — Toleranz-Pyramide am
   Limit.
3. **Falsche Norm-Interpretation** im OEM-C-Labor (selten, aber kam
   schon vor).
4. **LED-Charge** weicht in der Lichtstärken-Verteilung leicht ab —
   muss gegen den PPAP des Chip-Lieferanten geprüft werden.

## Was du als Junior tust
*Nicht* allein entscheiden. Das ist eine Eskalation an Anke und Tariq.
Deine Aufgabe: die Vorbereitung der Diskussion — Daten zusammen-
stellen, Hypothesen-Liste, eigene Vermutung markiert als "Vermutung".

## Visuelle Belege aus dem Shanghai-Labor

OEM-C hat zwei Mess-Plots geschickt. Beide erkennen die Diagnose ohne
elektrische Schaltplan-Diskussion — du kannst die Bilder also direkt in
die Eskalations-Mail an Anke einbetten:

![defect-5 — der Glare-Hotspot am Messpunkt B50L. 730 cd statt der zugelassenen 700 cd (China-Limit), bei ECE R149 wäre noch okay (Limit dort 750 cd). Sichtbar als heller Punkt deutlich über der Cut-off-Linie. Erkennen am Plot: scharfer Peak in der Glare-Zone, nicht ein verwaschener Verlauf. Konsequenz: ohne Re-Submit kein Marktzugang.](documents/defect-5.jpg)

![defect-4 — gleichzeitig zeigt der Plot eine asymmetrische Hellhell-Verteilung. Das ist kein zusätzlicher Befund sondern derselbe Wurzelursache-Verdacht: eine Linsen-Charge mit verschobener Justage trifft beide Effekte gemeinsam. Hier zur Dokumentation der Ursachenkette, nicht als separates Failure.](documents/defect-4.jpg)

## Stub-Erweiterung
Wenn du dieses Szenario nach Abschluss des Topics 5 fertig hast,
schlägt der Agent eine Wiki-Ergänzung um eine "Lessons-Learned-Liste"
vor: was sind die häufigsten GB-4599-Stolpersteine. Dann beauftragst
du Anke, sie zu reviewen.
`,
  },
  {
    title: '5.3 Später ECR von OEM-B premium',
    slug: '5-3-spaeter-ecr',
    bucket: 'topics',
    status: 'stub',
    confidence: 'low',
    tags: ['szenarien', 'oem-b'],
    mission_relevance: 0.6,
    body: `# 5.3 Später ECR von OEM-B premium

> **Status: stub.** Inhalt folgt nach Reviewer-Feedback durch den
> Projektleiter:innen-Pool. Bitte Lars (OEM-A-PM) oder die OEM-B-PM um
> einen Vertretungs-Review.

Skizze des Szenarios:
- **Auslöser:** Drei Tage vor dem RFQ-Quote-Deadline sendet OEM-B
  premium ein "minor amendment" zu ihrem Anforderungspaket: die
  Lichtstärke an Messpunkt 75R wird von 12.000 cd auf 14.000 cd erhöht.
- **Sieht harmlos aus** — ist es aber nicht, weil das die Treiber-IC-
  Auslegung kratzt.
- **Aufgabe an den Lernenden:** ECR analysieren, Auswirkungs-Pfad
  durchgehen, *vor* der Antwort an OEM-B die internen Stakeholder
  einbinden.

Bis Inhalt fertig ist, der Agent zeigt nur den Stub-Hinweis statt eines
Szenarios.
`,
  },
];
