/**
 * Wiki pages for the requirements-hv seed project.
 *
 * Nineteen pages (eighteen original + one new "creating-planned-responses"
 * page) organised around the article's narrative: the NU-525-Lot-3 source
 * pack, the 5-step pipeline (parse / normalize / structure / transform /
 * export), EARS, the FRT-250ms load-bearing example, the late-clarification
 * override, the firm's reuse base, the coverage dashboard, the agent's
 * three operating rules, and the three creation paths in the compliance
 * matrix.
 *
 * Language: German (the working language of the firm and the deliverable).
 * The only English page in the project is .claude/CLAUDE.md (the system
 * prompt for Claude Code itself).
 *
 * Structural template: see wiki/topics/team.md — its layout (frontmatter +
 * intro paragraph + body + "How the cockpit uses this") is the canonical
 * shape for every per-topic page in this seed.
 *
 * Cross-links use `[label](../topics/<slug>.md)` so wiki-add.ts auto-creates
 * backlinks and stub pages where the target does not yet exist.
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
  classification?: 'public' | 'private' | 'secret';
}

export const WIKI_PAGES: WikiPageDraft[] = [
  // -- Bid + source pack overview ---------------------------------------
  {
    title: 'NU-525-Lot-3 — Angebotsübersicht',
    slug: 'nu-525-lot-3-bid-overview',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['bid', 'overview'],
    mission_relevance: 1.0,
    body: `# NU-525-Lot-3 — Angebotsübersicht

**Kunde:** Nordseeübertragungs-Netz GmbH (NSÜN) — stilisierter
Nordsee-Übertragungsnetzbetreiber.
**Umfang:** Onshore-Endpunkt einer 525-kV/2-GW-HGÜ-Konverterstation,
Landstation einer Nordsee-Offshore-Wind-Anbindung.

## Sprachfluss

| Bereich | Sprache | Wo |
|---|---|---|
| Posteingang (Originalspezifikation) | Englisch | \`inbox/*.docx\` |
| Arbeitssprache (in-house übersetzt) | Deutsch | \`documents/*.md\` |
| Wiederverwendungsbasis (Altangebote) | Deutsch | \`documents/reuse-*.md\` |
| Wiki, Mission, Dokumentation | Deutsch | \`wiki/\`, \`documentation.md\` |
| Lieferdokument | Deutsch | \`out/\` (exportiertes Word/PDF) |
| Export-Annotation | Englische Rückübersetzung Seite an Seite | im exportierten Word/PDF |
| Claude Code Systemprompt | Englisch | \`.claude/CLAUDE.md\` |

## Quellendokument-Stapel
~900 Seiten verteilt auf:

- [Volume 0 — Allgemeine Bedingungen](../sources/source-volume-0-general-conditions.md)
- [Volume 1 — Funktionsspezifikation](../sources/source-volume-1-functional-spec.md)
- [Volume 2 — Annex A: Elektrisches Verhalten](../sources/source-volume-2-annex-a-electrical-performance.md)
- [Volume 3 — Annex B: Schutz- und Leittechnik](../sources/source-volume-3-annex-b-protection-control.md)
- [Volume 4 — Annex C: Oberschwingungs- und Spannungsqualitätsgrenzen](../sources/source-volume-4-annex-c-harmonics.md)
- [Volume 5 — Annex D–F: Hilfsbetriebe, Kühlung, Bautechnik](../sources/source-volume-5-annex-def-auxiliaries.md)
- [Volume 6 — Netzanschluss-Konformität](../sources/source-volume-6-grid-code.md)
- [Klarstellungsmemo (2026-04-18)](../sources/source-late-clarifications-2026-04-18.md)

Das Klarstellungsmemo traf **nach** Schließung des Bieterfragen-Fensters
ein und änderte stillschweigend mehrere Dutzend Klauseln in den
Volumes 1–4. Siehe [Späte Klarstellungs-Overrides
](../topics/late-clarification-overrides.md).

## Abgabe-Gate
Die Coverage-Matrix muss bis zum internen Commit-Gate des Angebotsteams
zu 100 % *committed / deviation / clarify* sein (siehe
[Coverage-Zustände + Gates](../topics/coverage-states-and-gates.md)).
`,
  },

  // -- Pipeline (5 pages) ------------------------------------------------
  {
    title: 'Pipeline — Parsen',
    slug: 'pipeline-parse',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'parse'],
    mission_relevance: 1.0,
    body: `# Pipeline — Parsen

Verweigere es, das Anforderungsdokument als einen einzigen Block zu
behandeln. Zerlege jedes Volume in Segmente und klassifiziere sie.

## Schritt 0 — Übersetzung des Posteingangs

Die Originalspezifikation trifft als englische Word-Dokumente im
Posteingang \`inbox/*.docx\` ein. Vor dem Parsen werden die Inhalte in
die Arbeitssprache **Deutsch** übersetzt und als Markdown unter
\`documents/source-volume-*-excerpt.md\` abgelegt. Der RAG-Index ist auf
das deutsche Arbeitsmaterial unter \`documents/\` ausgerichtet — der
Posteingang selbst wird **nicht** indexiert.

## Klassifikation

- **Anforderung** — enthält ein normatives *muss / shall / ist auszulegen*.
- **Definition** — ein Begriff oder Symbol, der/das anderswo verwendet wird.
- **Kontext** — erzählend; für sich genommen nicht normativ.
- **Normenverweis** — zieht Teilanforderungen aus einer externen Norm
  ein (IEC 62271, IEC 61850, IEC 60076, EU NC-HVDC, BNetzA-TAB-HS).
- **Späte Klarstellungs-Override** — ändert eine bereits enthaltene
  Klausel. Wird als separate Kante verfolgt; siehe
  [Späte Klarstellungs-Overrides](../topics/late-clarification-overrides.md).

Alles, was der Parser nicht sicher klassifizieren kann, wird **für einen
Menschen markiert, nicht verworfen**. Der Stapel ist zu groß für
"Best-Effort"-Stille-Verluste.
`,
  },
  {
    title: 'Pipeline — Normalisieren (EARS)',
    slug: 'pipeline-normalize-ears',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'normalize', 'ears'],
    mission_relevance: 1.0,
    body: `# Pipeline — Normalisieren (EARS)

Schreibe unordentliche Quellabsätze in einzelne, nummerierte, **atomare**
EARS-Anforderungen um. EARS — *Easy Approach to Requirements Syntax* —
wurde von Mavin et al. bei Rolls-Royce (IEEE RE 2009) für
luftfahrtnahe Hochrisiko-Domänen entwickelt. Es beschränkt eine
Anforderung auf eine kleine Menge von Mustern (deutsche Entsprechungen
in Klammern):

- **Allgemeingültig:** *Der Konverter muss <Sache tun>.* (*The converter
  shall <do thing>.*)
- **Ereignisgetrieben:** *Wenn <Auslöser>, muss der Konverter <Sache tun>.*
- **Zustandsgetrieben:** *Während <Zustand>, muss der Konverter <Sache
  tun>.*
- **Unerwünschtes Verhalten:** *Falls <Bedingung>, muss der Konverter
  <Sache tun>.*
- **Optionales Merkmal:** *Sofern <Merkmal vorhanden>, muss der Konverter
  <Sache tun>.*

Ein Absatz, der drei Pflichten verschleiert hat, wird zu drei
nummerierten Anforderungen (REQ-247.a / REQ-247.b / REQ-247.c). Siehe
die [FRT-250ms-Fallstudie](../topics/case-frt-250ms.md), was es kostet,
eine zu verpassen.

## Zurückhaltung
Wenn die Quelle wirklich mehrdeutig ist — *"der Konverter muss
ausreichende Blindleistungsunterstützung bereitstellen"*, ohne Sollwert,
ohne Betriebsbereich — erfindet der Agent **keine** Zahl. Er
oberflächt ein *clarify*-Flag, und die Lücke wandert in die
Warteschlange des Ingenieurs. Messbare Kriterien zu erfinden, damit
Mehrdeutigkeit beantwortet aussieht, ist der Weg in Streitigkeiten bei
der Site-Acceptance.
`,
  },
  {
    title: 'Pipeline — Strukturieren (Coverage-Matrix)',
    slug: 'pipeline-structure-coverage',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'structure', 'coverage'],
    mission_relevance: 1.0,
    body: `# Pipeline — Strukturieren (Coverage-Matrix)

Mit einer sauberen Liste von EARS-Anforderungen wird das Gerüst des
Lieferdokuments aufgespannt — die Kapitel der technischen Spezifikation
und der Konformitätsmatrix — und jede Anforderung erhält einen Platz.

Das Ergebnis ist das [Coverage-Dashboard
](../topics/coverage-dashboard.md): jede Anforderung ist eine Zeile, jede
Zeile hat einen Zustand. **Eine Anforderung ohne Zeile kann nicht
existieren.** Das ist die Garantie, die der Strukturschritt gibt; alles
Nachgelagerte hängt davon ab.

Zustandsmaschine:

\`\`\`
open  →  drafted  →  reviewed  →  committed
                  ↘  deviation  ↗
                  ↘  clarify   ↗
\`\`\`

Siehe [Coverage-Zustände + Gates](../topics/coverage-states-and-gates.md).
`,
  },
  {
    title: 'Pipeline — Transformieren (Entwurf)',
    slug: 'pipeline-transform-draft',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'transform', 'reuse'],
    mission_relevance: 1.0,
    body: `# Pipeline — Transformieren (Entwurf)

Für jede Anforderung tut der Agent:

1. Er durchsucht die [Wiederverwendungsbasis](../topics/reuse-base.md)
   früherer technischer Spezifikationen und Typprüfberichte. Die
   Wiederverwendungsbasis ist **deutsch** — Altangebote der Firma.
2. Er zieht die Passage, die dieselbe Art von Anforderung früher
   beantwortet hat.
3. Er passt sie an die Besonderheiten dieser Anforderung an
   (Sollwerte, Bereiche, Zeiten).
4. Er verfasst den Entwurf gemäß [Stilhandbuch](
   ../sources/source-internal-german-style-guide.md) — Modalverben,
   Einheiten, Termini.
5. Er kennzeichnet ihn **drafted, awaiting decision** — nicht
   *answered*.

Der Ingenieur liest Quelle und Entwurf nebeneinander, sieht, aus
welcher Altspezifikation der Entwurf gezogen wurde, und trifft die
Entscheidung: *erfüllen / teilweise erfüllen / Abweichung / klären*.
Der Agent hat die Suche, Anpassung und stilistische Veredelung
geleistet. Der Ingenieur behält die Urheberschaft der Zusage.

Der erfahrene Principal Engineer, der "einfach weiß", dass man
Fault-Ride-Through mit Bezug auf das Northshore-2022-MMC-Regelschema
beantwortet — dieses Urteil wird in der Wiederverwendungsbasis
festgehalten und ist nun für das gesamte Team nachnutzbar.

> Anmerkung zur Übersetzung: Da Wiederverwendungsbasis und
> Lieferdokument beide auf **Deutsch** sind, entfällt der frühere
> Übersetzungsschritt EN→DE im Transform. Die englische
> Rückübersetzung findet erst beim [Export](../topics/pipeline-export.md)
> statt — als Annotation, nicht als Übersetzung des Entwurfs.
`,
  },
  {
    title: 'Pipeline — Exportieren',
    slug: 'pipeline-export',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['pipeline', 'export'],
    mission_relevance: 0.95,
    body: `# Pipeline — Exportieren

Rendere die freigegebene Struktur in das vom Kunden geforderte Format —
die hauseigene Word/PDF-Vorlage des Auftragnehmers für technische
Spezifikationen — mit eingebetteter Konformitätsmatrix.

## Bilinguale Annotation als harte Regel

**Jede deutsche Antwort im Lieferdokument wird mit ihrer englischen
Rückübersetzung Seite an Seite annotiert.** Das ist nicht kosmetisch:
Die Klärungs- und Review-Schleife des Kunden läuft auf Englisch; eine
nur deutsche Lieferung blockiert den Review unnötig und produziert
Diskussionen über Übersetzungsfeinheiten erst am Vertragsverhandlungs-
tisch.

Spaltenlayout im exportierten Dokument:

| Linke Spalte | Rechte Spalte |
|---|---|
| Deutsche Antwort (verbindlich) | Englische Rückübersetzung (informativ) |

Die deutsche Spalte ist die bindende vertragliche Form. Die englische
Spalte ist ausdrücklich als *informativ* gekennzeichnet, damit kein
Streit darüber entsteht, welche Sprache "gilt".

## Rückverfolgbarkeit überlebt den Export

Jeder committete Abschnitt der exportierten Spezifikation wird mit den
IDs der Anforderungen gestempelt, die er beantwortet. Die
Konformitätsmatrix liegt *innerhalb* des Lieferdokuments. Eine
Coverage-Matrix, die nur im Werkzeug lebt, ist wertlos in dem Moment,
in dem die Spezifikation als PDF auf dem Schreibtisch des Kunden liegt
— so wie ein Befund, der nur in einem Chat-Thread lebte, so gut wie
verloren war (Teil 1, Defects-Dashboard).

## Harte Regel
Nichts im Zustand *open* oder *drafted* wird exportiert. Der
Exportschritt weigert sich zu laufen, wenn eine Zeile nicht in
*committed / deviation / clarify* ist.
`,
  },

  // -- The article's load-bearing examples -------------------------------
  {
    title: 'Fallstudie — FRT-250ms (REQ-247)',
    slug: 'case-frt-250ms',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['case-study', 'frt', 'req-247'],
    mission_relevance: 1.0,
    body: `# Fallstudie — FRT-250ms (REQ-247)

Das einzelne "muss", das das Angebotsteam im letzten Projekt fast
übersehen hätte.

## Die Quellklausel
**Volume 2, Annex A, §7.4.3, Fußnote 2**, unter einer Tabelle der
Oberschwingungsgrenzen. EARS-normalisiert:

> **REQ-247.** *Wenn ein dreiphasiger vollständiger Spannungseinbruch am
> Konverter-AC-Sammelschienenanschluss auftritt, muss der Konverter
> angeschlossen bleiben und die Vorstörungs-Wirkleistungsabgabe
> innerhalb von 250 ms wieder aufnehmen.*

Ein einziger Satz unter einer Oberschwingungs-Tabelle. Eine naive
Schutz-Reaktion würde die Station vom Netz nehmen — nicht konform,
blockierend, mit Vertragsstrafen, wenn nach Zuschlag entdeckt.

## Wovon es abhängt
- Das [MMC-Regelschema](../topics/mmc-control-scheme.md) aus dem
  Northshore-2022-Projekt durchfährt genau dieses Profil
  (Typprüfnachweis: [northshore-2022-frt-type-test
  ](../sources/source-northshore-2022-frt-type-test.md)).
- Die Schutzphilosophie in [Annex B
  ](../sources/source-volume-3-annex-b-protection-control.md) interagiert
  mit dem FRT-Sollwert; beide müssen konsistent committet werden.

## Zustand
*Drafted* durch den Agenten (Wiederverwendung aus Northshore-2022).
Wartet auf die Entscheidung des Principal Engineer. Siehe
[Coverage-Dashboard](../topics/coverage-dashboard.md).
`,
  },
  {
    title: 'Späte Klarstellungs-Overrides',
    slug: 'late-clarification-overrides',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['overrides', 'clarifications', 'risk'],
    mission_relevance: 1.0,
    body: `# Späte Klarstellungs-Overrides

Das [Klarstellungsmemo (2026-04-18)
](../sources/source-late-clarifications-2026-04-18.md) traf nach
Schließung des Bieterfragen-Fensters ein. Es änderte stillschweigend
**41 Klauseln** in den Volumes 1–4.

Der Agent verschmilzt keinen Override-Text in die ursprüngliche
Klausel. Jeder Override wird als **separater Knoten** im
Knowledge-Graph mit einer expliziten \`overrides\`-Kante zu der von ihm
geänderten Klausel verfolgt — so sieht der Ingenieur, der REQ-184
liest, sowohl die ursprüngliche Verpflichtung als auch die Änderung,
und der Export trägt den geänderten Text *mit angehängter Override-
Provenienz* fort.

## Der gefährliche Override (REQ-184)
Die ursprüngliche Klausel Volume 1 §4.2 legte den Blindleistungsbereich
auf ±0,95 voreilend/nacheilend bei voller Wirkleistung fest. Das
Klarstellungsmemo änderte dies auf **±0,90 voreilend / ±0,95 nacheilend
bei voller Wirkleistung** unter Verweis auf lokale
Netzstabilitätsanforderungen. Ein wiederverwendungsbasierter Entwurf aus
einem Projekt, das das ursprüngliche ±0,95/±0,95-Profil beantwortet
hat, würde den engeren voreilenden Bereich still verfehlen — und ein
verfehlter Bereich ist ein verfehlter Sollwert auf einem bindenden
Lieferdokument.

Der Agent markiert Overrides laut auf dem [Coverage-Dashboard
](../topics/coverage-dashboard.md): jede durch eine späte Klarstellung
geänderte Anforderung trägt einen roten **override**-Chip, bis der
Ingenieur den geänderten Text auf Aktenlage geprüft hat.
`,
  },

  // -- Coverage + state machine -----------------------------------------
  {
    title: 'Coverage-Dashboard',
    slug: 'coverage-dashboard',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['dashboard', 'coverage'],
    mission_relevance: 1.0,
    body: `# Coverage-Dashboard

Die einzige Sicht, in der der Zustand der gesamten Anstrengung lesbar
ist, ohne fragen zu müssen. Ein leitender Ingenieur kann sie öffnen
und die einzige Frage beantworten, die ihn nachts wachhält: *Was haben
wir noch nicht adressiert?* Wochen vorher, statt am Morgen der Abgabe.

## Was es zeigt
- Jede Anforderung (~1.800 im vollen Maßstab; ~40 im Demo gesetzt).
- Pro-Zeile-Zustand: *open / drafted / reviewed / committed / deviation
  / clarify*.
- Pro-Zeile-Chips: **override** (durch späte Klarstellung geändert),
  **clarify** (mehrdeutig, wartet auf Kundenantwort),
  **reuse: <quelle>** (aus welcher Altspezifikation der Entwurf gezogen
  wurde).
- Pro-Zeile-Quellort (Volume / Abschnitt / Seite).
- Aggregierte Zählungen nach Zustand, Quellvolume und verantwortlichem
  Ingenieur.

## Gerendert durch
\`out/coverage/current.coverage.json\` — registriert gegen
\`.coverage.json\` in viewerRegistry.jsx (gleicher Mechanismus wie der
QuarterlyViewer im Long-Horizon-Seed).
`,
  },
  {
    title: 'Coverage-Zustände + Gates',
    slug: 'coverage-states-and-gates',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['states', 'gates'],
    mission_relevance: 0.95,
    body: `# Coverage-Zustände + Gates

## Zustandsdefinitionen
- **open** — Anforderung geparst und normalisiert; noch nichts entworfen.
- **drafted** — der Agent hat eine Wiederverwendungsstelle abgerufen,
  angepasst und im Hausstil verfasst. *Kein Ingenieur hat sie gelesen.*
- **reviewed** — ein Ingenieur hat Entwurf und Quelle gelesen. Kann
  noch iterieren.
- **committed** — ausdrückliche Entscheidung eines namentlich
  benannten Ingenieurs, dass dies die Angebotsantwort ist. Gesperrt.
- **deviation** — das Angebot weicht bewusst von der Anforderung ab.
  Trägt eine *Abweichungsbegründung* und die kaufmännische Implikation.
- **clarify** — die Anforderung ist mehrdeutig oder widersprüchlich;
  eine Kundenklärung wurde angefordert.

## Abgabe-Gates
- **G1 — Internes Vollständigkeits-Gate (T-30 Tage):** Jede Anforderung
  hat eine Zeile; null in *open*.
- **G2 — Engineering-Review-Gate (T-14 Tage):** Jede Zeile ist
  *reviewed*, *committed*, *deviation* oder *clarify*.
- **G3 — Commit-Gate (T-3 Tage):** Jede Zeile ist *committed*,
  *deviation* oder *clarify*. Der Export verweigert sich sonst.

Der Agent setzt G3 durch: \`pipeline-export\` prüft die Coverage-Matrix
vor dem Schreiben der .docx und bricht mit einer Liste nicht-
committeter Zeilen ab, falls noch welche übrig sind.
`,
  },

  // -- Reuse base --------------------------------------------------------
  {
    title: 'Wiederverwendungsbasis',
    slug: 'reuse-base',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['reuse', 'past-specs'],
    mission_relevance: 0.95,
    body: `# Wiederverwendungsbasis

Der akkumulierte Engineering-Inhalt der Firma — die Sammlung früherer
**deutschsprachiger** Angebote, technischer Spezifikationen und
Typprüfberichte, indexiert für den Abruf nach Thema +
Sollwertbereich + Norm.

## Nennenswerte Wiederverwendungsquellen für dieses Angebot
- **[Northshore-2022 — MMC-Regelschema
  ](../sources/source-northshore-2022-mmc-control.md)**:
  Die FRT-250ms-Referenzauslegung.
- **[Northshore-2022 — FRT-Typprüfbericht
  ](../sources/source-northshore-2022-frt-type-test.md)**: Zertifizierte
  Durchfahrt genau des Profils in REQ-247.
- **[Capeline-2023 — Schutzphilosophie
  ](../sources/source-capeline-2023-protection.md)**: Genutzt für die
  Annex-B-Anforderungen.
- **[Reefnet-2020 — Oberschwingungs-Filterauslegung
  ](../sources/source-reefnet-2020-harmonic-filters.md)**: Genutzt für
  Annex C; **erfüllt nicht** NSÜNs strengere THD-Grenzwerte — siehe
  [Reuse-Mismatch — Oberschwingungsfilter](../topics/reuse-mismatch-harmonic-filter.md).
- **[Aurora-2024 — Blindleistungs-Fähigkeitskurve
  ](../sources/source-aurora-2024-reactive-power.md)**: Muss für den
  REQ-184-Override angepasst werden (±0,90 voreilend statt ±0,95).
- **[Hausintern — Stilhandbuch
  ](../sources/source-internal-german-style-guide.md)**: Regelt den
  deutschen Hausstil und die englische Rückübersetzung im Export.

Die Wiederverwendungsbasis ist das festgehaltene Urteil der Principal
Engineers — derjenigen, die "einfach wissen", welches Altprojekt eine
neue Anforderung beantwortet. Hier festgehalten, überlebt es ihren
Wechsel.
`,
  },
  {
    title: 'Reuse-Mismatch — Oberschwingungsfilter (Annex C)',
    slug: 'reuse-mismatch-harmonic-filter',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['mismatch', 'annex-c', 'harmonics'],
    mission_relevance: 0.9,
    body: `# Reuse-Mismatch — Oberschwingungsfilter (Annex C)

Die natürliche Wiederverwendungsquelle für die Oberschwingungsfilter-
Anforderungen (REQ-301 bis REQ-308) ist die [Reefnet-2020-Filterauslegung
](../sources/source-reefnet-2020-harmonic-filters.md), die **THD ≤ 1,5 %**
am PCC lieferte.

NSÜNs [Annex C](../sources/source-volume-4-annex-c-harmonics.md)
verlangt **THD ≤ 0,9 %** am PCC (REQ-303). Die Reefnet-Auslegung
erfüllt diesen Grenzwert nicht.

## Implikation
Vier Anforderungs-Antworten (REQ-303, REQ-304, REQ-305, REQ-307), die
der Agent zunächst aus Reefnet entworfen hatte, sind für **Nacharbeit
mit neu abgestimmter Filtertopologie** markiert. Die aktuellen
Entwürfe tragen den *reuse-mismatch*-Chip auf dem [Coverage-Dashboard
](../topics/coverage-dashboard.md) und erfordern Eingriff durch den
Principal Engineer — entweder Neuabstimmung aus einem anderen
Altprojekt, formale Abweichung oder Klärung, ob der THD-Grenzwert am
PCC oder an den Konverterklemmen gilt.

Dies ist das strukturelle Analogon zum *Refuted→cascade* des
Long-Horizon-Commitments-Seeds: eine fehlerhafte Upstream-
Wiederverwendungsentscheidung, vier nachgelagerte Antworten erben die
Nacharbeit.
`,
  },

  // -- MMC control scheme + the German-language angle -------------------
  {
    title: 'MMC-Regelschema (Wiederverwendung aus Northshore-2022)',
    slug: 'mmc-control-scheme',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['mmc', 'control', 'reuse'],
    mission_relevance: 0.85,
    body: `# MMC-Regelschema (Wiederverwendung aus Northshore-2022)

Das bewährte Modular-Multilevel-Konverter-Regelschema der Firma,
typgeprüft auf dem Northshore-2022-Projekt. Beantwortet mit Anpassung:

- **REQ-247** (FRT-250ms) — siehe [case-frt-250ms
  ](../topics/case-frt-250ms.md).
- **REQ-241–246** (Wirkleistungs-Antwort, Anstiegsraten, Schwingungs-
  dämpfung).
- **REQ-251–254** (Blindleistungs-Dynamikantwort).
- **REQ-261–268** (Regelarchitektur, Redundanz, Zeitsynchronisation).

## Was "Wiederverwendung mit Anpassung" hier bedeutet
Das MMC-Regelschema ist ein bewährtes Designmuster; die Sollwerte, die
Anstiegsraten und das Timing sind projektspezifisch. Der Agent zieht
das Muster, passt die Zahlen an die Anforderung an und verfasst das
Ganze im Hausstil.

Der Principal Engineer liest Quelle + Entwurf nebeneinander und
entscheidet.
`,
  },
  {
    title: 'Deutscher Hausstil + Rückübersetzung',
    slug: 'german-language-drafting',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['translation', 'german', 'style', 'back-translation'],
    mission_relevance: 0.85,
    body: `# Deutscher Hausstil + Rückübersetzung

Arbeitssprache, Wiederverwendungsbasis und Lieferdokument sind
**deutsch**. Das frühere "EN→DE-Übersetzen" entfällt; der Agent
schreibt deutsche Anforderungen aus deutschen Altangeboten heraus
gemäß dem [hausinternen Stilhandbuch
](../sources/source-internal-german-style-guide.md).

## Konventionen (Auszug)

- Modalverben: *muss* (verpflichtend) / *darf* (zulässig) / *sollte*
  (empfohlen) — nie das umgangssprachliche *soll*.
- Sollwerte im SI mit landesüblichem Dezimaltrennzeichen (1,5 MW).
- Normenverweise werden nicht übersetzt (IEC 62271-302 bleibt
  unverändert).
- IDs (REQ-247, Annex C §7.4.3) bleiben unverändert.

## Englische Rückübersetzung beim Export

Beim [Exportschritt](../topics/pipeline-export.md) wird jede deutsche
Antwort mit ihrer englischen Rückübersetzung Seite an Seite annotiert.
Die Rückübersetzung ist *informativ*, die deutsche Spalte ist die
bindende vertragliche Form.

Regeln der Rückübersetzung:

- *muss → "shall"*, *darf → "may"*, *sollte → "should"*. Die strikte
  Trennung zwischen *shall* und *should* darf nicht verschwimmen.
- Dezimalzahlen werden in der englischen Konvention dargestellt
  (1,5 MW → 1.5 MW); das Vorzeichen ± und die SI-Einheiten bleiben.
- Normenverweise, IDs, Anhangsverweise sind bereits in beiden Sprachen
  identisch und werden 1:1 übernommen.
- Der englische Block zitiert seine deutsche Originalstelle per
  Absatz-ID, damit der Prüfer rückwärts navigieren kann.

Der Agent post-editet keinen committeten Text des Ingenieurs. Sobald
eine Zeile *committed* ist, ist die deutsche Formulierung die des
Ingenieurs, Punkt. Die Rückübersetzung wird beim Export aus der
endgültigen deutschen Formulierung erzeugt — nicht aus dem Entwurf.

Offene Frage: Sollen Sollwerte in *deviation*-Zeilen die englische
Rückübersetzung neben der deutschen Fassung führen? Siehe
[Klärungs-Warteschlange](../topics/clarify-queue.md).
`,
  },

  // -- Standards backdrop -----------------------------------------------
  {
    title: 'Normen & regulatorischer Hintergrund',
    slug: 'standards-regulatory-backdrop',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['standards', 'regulatory'],
    mission_relevance: 0.9,
    body: `# Normen & regulatorischer Hintergrund

NSÜNs Anforderungsdokument zeigt stark in externe Normen hinein. Jeder
Verweis zieht eigene Teilanforderungen ein, die der Agent im
Parse-Schritt expandiert.

| Norm | Domäne | Warum es hier zählt |
|---|---|---|
| EU-Verordnung 2016/1447 (NC-HVDC) | Netzanschluss von HGÜ-Systemen | Pflichtkonformität für den Anschluss |
| BNetzA TAB-HS 2024 | Deutsche technische Anschlussbedingungen | Zieht landesspezifische Überlagerungen ein |
| IEC 62271-1 / -302 | Hochspannungs-Schaltanlagen | Annex-A-Klauseln zur AC-Schaltanlage |
| IEC 61850 | Stationskommunikation | Annex-B-Klauseln zu Schutz & Leittechnik |
| IEC 60076 (Reihe) | Leistungstransformatoren | Konvertertransformatoren |
| IEC 60633 / 60919 | HGÜ-Terminologie + Systemplanung | Glossar + Designannahmen |
| IEEE 1547 | (informativ) | In Annex E einmal zitiert; **nicht normativ** für dieses Angebot |

Eine nicht konforme Station geht nicht ans Netz. Konformität mit
NC-HVDC und der TAB-HS-Überlagerung ist keine Nettigkeit — es ist die
Anschlussvoraussetzung.
`,
  },

  // -- Clarify queue ----------------------------------------------------
  {
    title: 'Klärungs-Warteschlange',
    slug: 'clarify-queue',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['clarify', 'queue'],
    mission_relevance: 0.85,
    body: `# Klärungs-Warteschlange

Anforderungen, für die der Agent einen Entwurf verweigert hat, weil die
Quelle wirklich mehrdeutig ist und das Erfinden eines messbaren
Kriteriums eine nicht zu rechtfertigende Zusage schaffen würde.

Die Klärungs-Warteschlange wird vor der Abgabe als getrenntes Exhibit
an den Kunden geliefert, mit jedem Punkt formuliert als spezifische
Frage. Die [FRT-250ms-Fallstudie](../topics/case-frt-250ms.md) ist
*nicht* in der Klärungs-Warteschlange — sie hat ein messbares
Akzeptanzkriterium in der Quelle. Der Fall *"ausreichende
Blindleistungsunterstützung"* **ist** drin — kein Sollwert, kein
Bereich, nicht als bindende Zusage entwerfbar.

Im Demo gesetzte Klärungspunkte:

- **REQ-119** — *"die Station ist für ausreichende seismische
  Widerstandsfähigkeit auszulegen"* — keine Zonenklassifikation
  zitiert; klären, welche IBC-Zone oder welcher DIN/EN-1998-1-
  Untergrundtyp gilt.
- **REQ-376** — Übersetzungs-/Geltungsbereichs-Mehrdeutigkeit für
  *"Hilfsbetriebe der Reservelinie"*; klären, ob die Kühlskid-
  Hilfsbetriebe einbezogen sind.
- **REQ-411** — implizite Widersprüchlichkeit mit dem
  Klarstellungsmemo; klären, welche Fassung Vorrang hat.
`,
  },

  // -- Operating rules (the agent's restraint) --------------------------
  {
    title: 'Agentenregel — kein stilles Committen',
    slug: 'rule-no-silent-commitment',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'restraint'],
    mission_relevance: 1.0,
    body: `# Agentenregel — kein stilles Committen

Eine Anforderung wechselt **nur** durch eine ausdrückliche menschliche
Entscheidung in den Zustand *committed* — einzeln oder in geprüften
Stapeln. Es gibt keinen "Alle-automatisch-beantworten"-Knopf. Es gibt
keine Stapel-Transition, die nicht den entscheidenden Ingenieur
festhält.

Die Coverage-Sicht zeigt jederzeit, wie viele Einträge Entwürfe des
Agenten gegenüber Entscheidungen des Ingenieurs sind. Ein System, das
alles entwirft, muss sicherstellen, dass weiterhin ein Mensch über
alles entscheidet. Diese Asymmetrie ist der ganze Sinn.

Der gefährliche Override (REQ-184, voreilender Blindleistungsbereich
von ±0,95 auf ±0,90 verschmälert) zeigt *warum*: eine aus
Wiederverwendung entworfene Antwort, die ohne menschliche
Aufmerksamkeit für die Override-Kante im Stapel committet wird, ist
der Fehlermodus, der das Angebot kostet.
`,
  },
  {
    title: 'Agentenregel — markieren, nicht erfinden',
    slug: 'rule-flag-do-not-invent',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'restraint', 'ears'],
    mission_relevance: 1.0,
    body: `# Agentenregel — markieren, nicht erfinden

Wenn eine Anforderung wirklich mehrdeutig ist, markiert der Agent sie
für die [Klärungs-Warteschlange](../topics/clarify-queue.md). Er
erfindet keinen Sollwert, damit die Zeile beantwortet aussieht.

Ein erfundenes messbares Kriterium schafft eine Zusage, die niemand
gelesen hat. Der Wert des Agenten in dieser Pipeline ist, dass er
*Mehrdeutigkeit sichtbar macht*, nicht dass er sie übermalt. Der
[Normalisierungsschritt](../topics/pipeline-normalize-ears.md)
entscheidet, auf welcher Seite dieser Linie jede Quellklausel liegt.
`,
  },

  // -- Team (single source of truth for owner initials → engineer) -------
  //
  // The compliance-matrix previewer looks this page up by slug
  // (`team`, bucket `topics`) via WikiService.getPage and resolves the
  // "Initials" column to render owner cells. Rows whose
  // `responsibleEngineer` kg-id is not represented here fall back to the
  // raw id and get a "no team entry" hint chip in the cockpit.
  {
    title: 'Team',
    slug: 'team',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['team', 'owners'],
    mission_relevance: 1.0,
    body: `# Team

Das Angebotsteam. Die [Konformitätsmatrix-Vorschau
](../topics/coverage-dashboard.md) löst Inhaber-Zellen gegen diese
Seite auf — die Tabelle bearbeiten, um die im Cockpit erkannten
Initialen zu ändern. Eine Zeile pro KG-Ingenieur-ID hält den
Inhaber-Filter frei von Duplikaten.

| Initialen | Ingenieur-ID            | Name              | Rolle                                                | Bereiche                                |
|-----------|-------------------------|-------------------|------------------------------------------------------|-----------------------------------------|
| E1        | engineer-anke-vogt      | Engineer One      | Principal Engineer — Regelung & Schutz               | REQ-241..268, FRT-250ms                 |
| E2        | engineer-bernd-haag     | Engineer Two      | Principal Engineer — Netzqualität                    | REQ-301..308 (Annex C), Oberschwingungsfilter |
| E3        | engineer-clara-mueller  | Engineer Three    | Lead Engineer — Primärgeräte                         | REQ-101..184 (Volume 1 + Annex A)       |
| E4        | engineer-dirk-stein     | Engineer Four     | Angebotsteamleitung                                  | Coverage + Commit-Gate G3               |

## Wie das Cockpit diese Seite nutzt

- Die Inhaber-Spalte jeder Anforderungszeile löst
  \`responsibleEngineer\` (eine KG-Entitäts-ID wie
  \`engineer-anke-vogt\`) → die Spalte **Initialen** hier auf. Der
  Spaltenkopf der Matrix zeigt die Initialen; der Tooltip beim Hovern
  zeigt Name + Rolle.
- Der Inhaber-Filter in der linken Leiste zählt diese Tabelle auf.
- Eine Zeile aus dieser Tabelle zu entfernen, entfernt den Ingenieur
  nicht aus dem Knowledge-Graph — es hindert nur das Cockpit daran, ihn
  aufzulösen. Zeilen mit nicht auflösbarem Inhaber werden mit einem
  "no team entry"-Hinweischip gerendert.
- Wenn eine reale Person die Arbeit mehrerer fiktiver Ingenieure
  übernehmen soll, ist in der Zelle **Ingenieur-ID** eine durch Kommas
  getrennte Liste mehrerer IDs einzutragen. Der Parser des Cockpits
  beherrscht das — jede ID erscheint aber weiterhin einmal im
  Inhaber-Filter-Dropdown.
`,
  },

  // -- Three ways to create a planned response (NEW) --------------------
  {
    title: 'Drei Wege, eine geplante Antwort anzulegen',
    slug: 'creating-planned-responses',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['planned-response', 'workflow', 'reuse', 'restraint'],
    mission_relevance: 1.0,
    body: `# Drei Wege, eine geplante Antwort anzulegen

Im Cockpit der Konformitätsmatrix bietet der Knopf "Geplante Antwort
anlegen" drei Wege an. Welcher der richtige ist, hängt davon ab, woher
der Antwortinhalt kommt.

## 1. Leeren Stub anlegen

Schreibt eine Platzhalterseite mit Frontmatter und "hier entwerfen"-
Rumpf. *Wann?* Wenn es nichts gibt, womit man starten kann — die
Anforderung ist neu, keine Altangebotsstelle passt, der Ingenieur
schreibt den Entwurf von Null. Status: \`stub\`.

## 2. Aus vorhandenen Inhalten ziehen

Öffnet einen Auswahldialog über zwei Gruppen:

- **Documents** — Dateien unter \`documents/\` (Quellvolumes,
  Altangebotsauszüge, Typprüfberichte, Übergabe-Notizen). Auch
  \`.docx\` / \`.pdf\` werden unterstützt; sie werden durch die
  [office-and-pdf-documents]-Skill in Text extrahiert.
- **Wiki-Seiten** — bestehende, nicht-Stub-Seiten aus \`wiki/topics/\`
  und \`wiki/sources/\` (etwa [mmc-control-scheme
  ](../topics/mmc-control-scheme.md), [reuse-base
  ](../topics/reuse-base.md), die Quellvolumeseiten).

Der Inhalt des gewählten Eintrags wird zum Rumpf der neuen geplanten
Antwort, mit EARS-Kopfzeile und einem "Reuse-Provenance"-Footer, der
auf die Quelle zurückzeigt — bei Wiki-Quellen als
\`[label](../topics/<slug>.md)\`-Link, sodass die bestehende
Wiki-Backlink-Maschinerie die Verbindung sichtbar macht. Status:
\`drafted\`.

*Wann?* Wenn eine Altangebotsstelle, eine Wiederverwendungspassage
oder eine bestehende Wiki-Seite die Anforderung bereits beantwortet
und der Ingenieur sie als Ausgangspunkt nehmen will. Das ist der
**Hauptpfad** dieses Workflows und der eigentliche Mehrwert des
Systems: das festgehaltene Urteil der Principal Engineers wird
nachnutzbar.

> Wichtig: "Aus vorhandenen Inhalten ziehen" ist **kein** Committen.
> Der Inhalt einer einzigen Altseite oder eines einzigen Wiki-Eintrags
> wird in den Entwurf gehoben — der Ingenieur unterschreibt weiterhin.
> Siehe [Agentenregel — kein stilles Committen
> ](../topics/rule-no-silent-commitment.md).

## 3. Aus der Wissensbasis anlegen

Öffnet ein Eingabefeld für eine einzelne Frage. Der Agent beantwortet
die Frage mit vollem RAG-Kontext über \`documents/\` und das Wiki und
schreibt die Antwort als Rumpf der neuen geplanten Antwort. Status:
\`drafted\`, \`confidence: low\`.

*Wann?* Wenn die Antwort den gesamten Projektkontext braucht und sich
nicht aus einer einzelnen Altstelle ableiten lässt — etwa eine
Konformitätsantwort, die mehrere Wiederverwendungsquellen, ein
Klarstellungsmemo und eine Normenüberlagerung kombiniert.

> Die Antwort des Agenten **muss** geprüft werden. Eine ungeprüfte
> Agentenantwort ist genau der Fehlermodus, gegen den
> [Agentenregel — kein stilles Committen
> ](../topics/rule-no-silent-commitment.md) existiert. Der Agent kann
> halluzinieren; das System macht die Halluzination sichtbar, indem es
> Provenienz (zitierte Dokument-IDs) im Rumpf führt — die Prüfung
> bleibt menschlich.

## Welcher Weg, wann?

| Situation | Empfohlener Weg |
|---|---|
| Anforderung ist offen, keine bekannte Quelle | Leeren Stub |
| Eine konkrete Altstelle oder Wiki-Seite passt | Aus vorhandenen Inhalten ziehen |
| Antwort braucht Synthese aus mehreren Quellen | Aus der Wissensbasis |

In jedem Fall: Der Zustand der Zeile ist \`drafted\`. Der
[Exportschritt](../topics/pipeline-export.md) weigert sich, eine
\`drafted\`-Zeile zu rendern. Der Ingenieur committet.
`,
  },

  // -- Planned-response pages (reuse content for committed/drafted rows) -
  //
  // Convention: \`planned-response/<req-id-lowercase>\`. The cockpit links
  // every CoverageRow to its slug; clicking a row in the matrix shows the
  // page in the right pane via WikiService.getPage. Pages for rows that
  // haven't been drafted yet are not seeded — the "Create planned
  // response" button in the cockpit calls create_planned_response_page to
  // stub them on first click.
  {
    title: 'Geplante Antwort — REQ-101 (Nenn-DC-Spannung)',
    slug: 'planned-response/req-101',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['planned-response', 'req-101', 'reuse-northshore-2022'],
    mission_relevance: 0.9,
    body: `# Geplante Antwort — REQ-101

> **Anforderung (EARS):** Die Konverterstation muss für eine kontinuierliche
> Nenn-DC-Spannung von ±525 kV ausgelegt werden.
> [[doc:documents/source-volume-1-functional-spec-excerpt.md]]

## Antwort (DE)

Die Umrichterstation wird für eine kontinuierliche Nenn-DC-Spannung von
**±525 kV** ausgelegt. Die Auslegung folgt der bewährten MMC-Topologie aus
dem Northshore-2022-Projekt und ist für den Dauerbetrieb am 525-kV-DC-Bus
qualifiziert.

## Englische Rückübersetzung (Annotation im Export)

The converter station shall be designed for a continuous rated DC voltage
of ±525 kV. The design follows the proven MMC topology used on the
Northshore-2022 project and is qualified for continuous operation on the
525 kV DC bus.

## Wiederverwendungs-Provenienz

Entworfen aus dem [Northshore-2022-MMC-Regelschema
](../topics/mmc-control-scheme.md). Der Abschnitt zur Nennspannung
verwendet die typgeprüfte Hüllkurve der Northshore-HGÜ-Bipole (in
Betrieb seit 2022) wieder.

## Status

Committed. Gesperrt durch C. Müller; trägt keinen Override- oder
Mismatch-Chip.
`,
  },
  {
    title: 'Geplante Antwort — REQ-184 (Blindleistungsbereich, geändert)',
    slug: 'planned-response/req-184',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['planned-response', 'req-184', 'override', 'reuse-aurora-2024'],
    mission_relevance: 1.0,
    body: `# Geplante Antwort — REQ-184

> **Anforderung (EARS, geändert):** Der Konverter muss einen
> Blindleistungsbereich von **±0,90 voreilend / ±0,95 nacheilend** bei
> voller Wirkleistungsabgabe bereitstellen, wie geändert durch das
> Klarstellungsmemo vom 2026-04-18.
> [[doc:documents/source-volume-1-functional-spec-excerpt.md]]
> [[doc:documents/source-late-clarifications-2026-04-18.md]]

## Antwort (DE) — ENTWURF, wartet auf Entscheidung des Principal Engineer

Der Umrichter stellt am Punkt des Netzanschlusses einen Blindleistungs-
bereich von **±0,90 voreilend / ±0,95 nacheilend** bei voller
Wirkleistungsabgabe bereit. Die Auslegung berücksichtigt die enger
gefasste voreilende Grenze aus der Klarstellungsmitteilung vom
2026-04-18.

## Englische Rückübersetzung (Annotation im Export)

The converter shall provide a reactive-power range of ±0.90 leading /
±0.95 lagging at full active-power output at the grid-connection point.
The design accounts for the tighter leading-side limit introduced by the
clarifications memo of 2026-04-18.

## Wiederverwendungs-Provenienz — und die Override-Kante

Entworfen aus der [Aurora-2024-Blindleistungs-Fähigkeitskurve
](../topics/reuse-base.md). Aurora-2024 beantwortete die
**ursprüngliche** ±0,95/±0,95-Hüllkurve; die geänderte ±0,90-voreilende
Grenze macht eine Neuauslegung der Fähigkeitskurve erforderlich. Siehe
[späte Klarstellungs-Overrides
](../topics/late-clarification-overrides.md).

## Was noch zu tun ist

- PQ-Hüllkurve bei ±0,90 voreilend neu schneiden; aktualisierte
  Fähigkeitskurve erzeugen und thermische Hüllkurve an der neuen
  Betriebsgrenze prüfen.
- Wechselwirkung der Schutzkoordination an der schmaleren voreilenden
  Grenze bestätigen.
- C. Müller zeichnet ab; Zeile wechselt \`drafted → reviewed → committed\`.
`,
  },
  {
    title: 'Geplante Antwort — REQ-247 (FRT-250ms)',
    slug: 'planned-response/req-247',
    bucket: 'topics',
    status: 'draft',
    confidence: 'high',
    tags: ['planned-response', 'req-247', 'frt', 'load-bearing', 'reuse-northshore-2022'],
    mission_relevance: 1.0,
    body: `# Geplante Antwort — REQ-247

> **Anforderung (EARS):** Wenn ein dreiphasiger vollständiger Spannungs-
> einbruch am Konverter-AC-Sammelschienenanschluss auftritt, muss der
> Konverter angeschlossen bleiben und die Vorstörungs-Wirkleistungs-
> abgabe innerhalb von **250 ms** wieder aufnehmen.
> [[doc:documents/source-volume-2-annex-a-electrical-performance-excerpt.md]]

## Antwort (DE) — ENTWURF

Bei einem dreiphasigen Spannungseinbruch auf null Spannung am
AC-Sammelschienenanschluss bleibt der Umrichter am Netz und führt die
Wirkleistungsabgabe innerhalb von **250 ms** auf den Vorstörwert zurück.
Der Nachweis stützt sich auf das im Northshore-2022-Projekt typgeprüfte
MMC-Regelschema.

## Englische Rückübersetzung (Annotation im Export)

On a three-phase fully-depressed voltage event at the AC busbar terminal,
the converter shall remain connected to the grid and shall return the
active-power output to the pre-fault setpoint within 250 ms. Compliance
evidence is the MMC control scheme type-tested on the Northshore-2022
project.

## Wiederverwendungs-Provenienz — Typprüfung in Akten

- Referenzauslegung: [MMC-Regelschema (Northshore-2022)
  ](../topics/mmc-control-scheme.md).
- Typprüfungsnachweis: [northshore-2022-frt-type-test
  ](../sources/source-northshore-2022-frt-type-test.md) — zertifizierte
  dreiphasige vollständige Spannungseinbruchsdurchfahrt von 250 ms.

## Zustand

Vom Agenten entworfen (Wiederverwendung + Anpassung + Hausstil).
Wartet auf Review von A. Vogt. Trägt den *load-bearing*-Chip auf dem
[Coverage-Dashboard](../topics/coverage-dashboard.md).

Siehe auch [case-frt-250ms](../topics/case-frt-250ms.md).
`,
  },
  {
    title: 'Geplante Antwort — REQ-303 (THD ≤ 0,9 % am PCC)',
    slug: 'planned-response/req-303',
    bucket: 'topics',
    status: 'draft',
    confidence: 'low',
    tags: ['planned-response', 'req-303', 'reuse-mismatch', 'load-bearing'],
    mission_relevance: 1.0,
    body: `# Geplante Antwort — REQ-303

> **Anforderung (EARS):** Die Gesamtoberschwingungsverzerrung am
> Verknüpfungspunkt darf bei keinem Betriebspunkt **0,9 %** überschreiten.
> [[doc:documents/source-volume-4-annex-c-harmonics-excerpt.md]]

## Antwort (DE) — ENTWURF (Reuse-Mismatch, nicht commit-sicher)

Die Gesamtoberschwingungsverzerrung (THD) am Netzanschlusspunkt wird in
allen Betriebspunkten **≤ 0,9 %** gehalten. Hierfür wird die
Filterauslegung gegenüber der Reefnet-2020-Referenz neu abgestimmt; der
Nachweis erfolgt durch Site-Acceptance-Messung gemäß IEC 61000-4-7.

## Englische Rückübersetzung (Annotation im Export)

Total harmonic distortion (THD) at the grid-connection point shall be
maintained at ≤ 0.9 % across all operating points. The filter design is
re-tuned with respect to the Reefnet-2020 reference; compliance evidence
is provided by site-acceptance measurement per IEC 61000-4-7.

## Wiederverwendungs-Provenienz — und die Kaskade

- Anfangsentwurf gezogen aus der [Reefnet-2020-Filterauslegung
  ](../topics/reuse-base.md), die **THD ≤ 1,5 %** lieferte — erfüllt
  NSÜNs 0,9-%-Grenzwert *nicht*. Siehe [Reuse-Mismatch —
  Oberschwingungsfilter
  ](../topics/reuse-mismatch-harmonic-filter.md).
- Drei nachgelagerte Anforderungen teilen dieselbe Filtertopologie und
  erben die Nacharbeit: REQ-304, REQ-305, REQ-307. Die
  Konformitätsmatrix markiert alle vier mit dem
  *reuse-mismatch*-Chip.

## Drei Pfade (keine Agentenempfehlung)

1. Neuabstimmung aus einer anderen Filtertopologie aus einem anderen
   Altprojekt.
2. Formal abweichen; Begründung und kaufmännische Implikation
   dokumentieren.
3. Mit dem Kunden klären, ob der THD-Grenzwert am PCC oder an den
   Konverterklemmen gilt.

B. Haag entscheidet. Die Zeile bleibt \`drafted\` mit dem
*reuse-mismatch*-Chip, bis die Entscheidung auf Aktenlage ist.
`,
  },
  {
    title: 'Geplante Antwort — REQ-211 (redundanter Differentialschutz)',
    slug: 'planned-response/req-211',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['planned-response', 'req-211', 'reuse-capeline-2023'],
    mission_relevance: 0.85,
    body: `# Geplante Antwort — REQ-211

> **Anforderung (EARS):** Das Schutzsystem muss redundante
> Differentialschutz-Einrichtungen gemäß IEC 61850-9-2 enthalten.
> [[doc:documents/source-volume-3-annex-b-protection-control-excerpt.md]]

## Antwort (DE)

Das Schutzsystem umfasst eine **redundante Differentialschutzfunktion**
gemäß IEC 61850-9-2. Beide Pfade nutzen die Sampled-Value-Topologie
und werden durch unabhängige Merging Units mit getrennten
Zeitsynchronisations-Quellen versorgt.

## Englische Rückübersetzung (Annotation im Export)

The protection system includes a **redundant differential-protection
function** per IEC 61850-9-2. Both paths use the sampled-values topology
and are fed by independent merging units with separated time-
synchronisation sources.

## Wiederverwendungs-Provenienz

Entworfen aus der [Capeline-2023-Schutzphilosophie
](../topics/reuse-base.md). Die Capeline-Referenzauslegung implementiert
dasselbe Redundanzmuster und ist typgeprüft zertifiziert.

## Status

Committed durch A. Vogt.
`,
  },
  {
    title: 'Geplante Antwort — REQ-601 (NC-HVDC-Konformität)',
    slug: 'planned-response/req-601',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['planned-response', 'req-601', 'standards', 'nc-hvdc'],
    mission_relevance: 0.85,
    body: `# Geplante Antwort — REQ-601

> **Anforderung (EARS):** Die Konverterstation muss alle obligatorischen
> Bestimmungen der EU-Verordnung 2016/1447 (NC-HVDC) erfüllen.
> [[doc:documents/source-volume-6-grid-code-excerpt.md]]

## Antwort (DE)

Die Umrichterstation erfüllt alle verbindlichen Anforderungen der
EU-Verordnung 2016/1447 (NC-HVDC). Der Konformitätsnachweis wird in der
[Konformitätsmatrix](../topics/coverage-dashboard.md) abschnittsweise
geführt, mit Verweis auf den jeweiligen Erfüllungsabschnitt des
technischen Pflichtenheftes.

## Englische Rückübersetzung (Annotation im Export)

The converter station shall comply with all mandatory provisions of EU
Regulation 2016/1447 (NC-HVDC). The compliance evidence is documented
section-by-section in the [compliance matrix
](../topics/coverage-dashboard.md), with cross-references to the
respective fulfilment section of the technical specification.

## Status

Committed durch D. Stein — load-bearing für die Anschlussvoraussetzung.
Siehe [Normen & regulatorischer Hintergrund
](../topics/standards-regulatory-backdrop.md).
`,
  },

  {
    title: 'Agentenregel — Rückverfolgbarkeit überlebt den Export',
    slug: 'rule-traceability-survives-export',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'export', 'traceability'],
    mission_relevance: 1.0,
    body: `# Agentenregel — Rückverfolgbarkeit überlebt den Export

Jeder committete Abschnitt der exportierten Spezifikation trägt die
IDs der Anforderungen, die er beantwortet. Die Konformitätsmatrix liegt
innerhalb des Lieferdokuments. Jede deutsche Antwort führt ihre
englische Rückübersetzung Seite an Seite. Die Verbindung von jeder
technischen Zusage zurück zur sie auslösenden Anforderung überlebt
außerhalb des Werkzeugs — genau dort, wo der Design-Review (und der
Streit, wenn es jemals einen gibt) stattfindet.

Eine Coverage-Matrix, die nur im Werkzeug lebt, ist wertlos in dem
Moment, in dem die Spezifikation als PDF auf dem Schreibtisch des
Kunden liegt. Der [Exportschritt](../topics/pipeline-export.md)
weigert sich, eine Zeile zu rendern, die ihre Anforderungs-IDs nicht
fortträgt — und weigert sich, eine deutsche Antwort ohne ihre
englische Rückübersetzung zu rendern.
`,
  },
];
