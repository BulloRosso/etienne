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

## Die sieben Sub-Systeme
1. **LED-Arrays** — Lichtquelle (84 Segmente für Matrix). Spezifiziert
   in cd/m² pro Segment und Farbtemperatur (K).
2. **Optik** — Linsen-Cluster + Reflektoren. Lenkt das Licht in die
   Hellhell-/Hell-Dunkel-Verteilung gemäß Norm (ECE R148/R149).
3. **Treiber-ICs** — Konstantstromquellen pro Segment + Schutzlogik
   (Übertemperatur, Open-LED-Detektion). Topologie:
   Buck-Boost-Wandler + Linear-Treiber je nach Strömungsbereich.
4. **Mikrocontroller + AUTOSAR-Stack** — der Headlight-ECU. Empfängt
   Kommandos vom Zentral-Steuergerät über CAN-FD, treibt die LED-Treiber
   per SPI.
5. **Thermomanagement** — Aluminium-Heatsink + Kühlrippen + optional
   aktiver Lüfter bei Hochleistungs-Varianten.
6. **Gehäuse** — Polycarbonat-Streuscheibe, Trägergehäuse, Dichtungen
   (IP6K9K).
7. **Steckverbinder + Bordnetz** — 12-V (PKW) oder 24-V (Nutzfahrzeug),
   abgesichert über ein Lumitec-spezifisches Schutzschaltungs-Frontend.

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

Bis dieses Stub ausformuliert ist: Anke fragen, welche der beiden
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
