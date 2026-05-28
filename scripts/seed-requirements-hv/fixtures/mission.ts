/**
 * Mission brief, wiki/_meta/mission.md content, and .claude/CLAUDE.md for the
 * `requirements-hv` seed project.
 *
 * Language flow demonstrated by this seed:
 *   - inbox/*.docx       English  (incoming customer specifications)
 *   - documents/*.md     German   (in-house translation of the inbox + reuse base)
 *   - wiki/, mission.md  German   (the working knowledge base is German)
 *   - .claude/CLAUDE.md  English  (Claude Code's own system prompt)
 *   - export             German + side-by-side English back-translation
 *
 * Used by:
 *   - POST /api/projects/create (missionBrief body field — short version)
 *   - wiki/_meta/mission.md     (long form — every wiki write inherits relevance)
 *   - .claude/CLAUDE.md         (Claude Code system prompt — short brief + pointer)
 */

export const PROJECT_NAME = 'requirements-hv';

export const MISSION_BRIEF =
  'Aus ~900 Seiten englischsprachiger Netzanschluss- und Funktions-' +
  'anforderungen für eine 525-kV/2-GW-HGÜ-Konverterstation wird eine ' +
  'vollständige, rückverfolgbare deutsche technische Spezifikation: Der ' +
  'Posteingang (inbox/*.docx) liegt auf Englisch vor; das interne ' +
  'Arbeitsmaterial unter documents/ und die Wiki sind auf Deutsch. ' +
  'Der Agent zerlegt den Quellenstapel in atomare EARS-Anforderungen, ' +
  'ordnet jede einem Platz im Lieferdokument zu, entwirft Antworten ' +
  'aus den deutschen Altangeboten der Firma und stoppt dort, damit ein ' +
  'verantwortlicher Ingenieur jede Zusage unterschreibt. Beim Export wird ' +
  'jede deutsche Antwort mit ihrer englischen Rückübersetzung Seite an ' +
  'Seite annotiert. Keine stillen Zusagen.';

export const MISSION_MD = `# Mission — Anforderungen → Spezifikation (HGÜ-Angebot)

## Das Projekt
Ein deutscher Übertragungsnetzbetreiber (stilisiert: **Nordseeübertragungs-
Netz GmbH**, "NSÜN") beschafft den Onshore-Endpunkt einer **525-kV/2-GW-
HGÜ-Konverterstation** — die Landstation einer Offshore-Wind-Anbindung in
der Nordsee. Interner Projektname: **NU-525-Lot-3**. Die Anforderungen
treffen als Stapel englischsprachiger Word-Dokumente im Posteingang
**inbox/** ein: eine Funktionsspezifikation, sechs technische Anhänge (A–F),
ein Volume zur Netzanschluss-Konformität sowie eine späte
Klarstellungsmitteilung, die nach Schließung des Bieterfragen-Fensters
mehrere Dutzend Klauseln stillschweigend geändert hat. Gesamt:
**~900 Seiten, ursprünglich auf Englisch.**

Die hausinterne Übersetzung in die Arbeitssprache **Deutsch** liegt unter
**documents/** als Markdown vor — das ist der Datensatz, gegen den der
Agent parst, normalisiert und retrieved.

Der Auftragnehmer — ein multinationaler EPC — muss eine **technische
Spezifikation auf Deutsch** zurückliefern, die jede Anforderung
beantwortet. Die wiederverwendbaren Engineering-Inhalte der Firma
(typgeprüfte MMC-Regelschemata, Schutzphilosophien, frühere Angebote auf
drei Kontinenten) liegen ebenfalls auf **Deutsch** vor.

## Wozu der Agent dient
Eine technische Spezifikation ist eine Sammlung **technischer Zusagen**.
Ob *erfüllen / teilweise erfüllen / Alternative anbieten / Abweichung
erklären / Klärung anfordern* — das sind technische und kaufmännische
Verpflichtungen, gedeckt durch Vertragsstrafen auf einem Vertrag im
mehrstelligen Millionenbereich, und sie gehören einem **verantwortlichen
Ingenieur**, der seinen Namen darunter setzt.

Die Aufgabe des Agenten ist *nicht*, diese Zusagen zu machen. Seine
Aufgabe ist die strukturierte Vorarbeit, die geleistet werden muss,
bevor eine Zusage gut gemacht werden kann:

1. **Parsen** — Eingang aus **inbox/*.docx** (Englisch) durch
   hausinterne Übersetzung als **documents/*.md** (Deutsch) bereitstellen,
   den Stapel in Segmente zerlegen und jedes klassifizieren
   (Anforderung / Definition / Kontext / Normenverweis / späte
   Klarstellungsänderung). Mehrdeutiges wird markiert, nicht verworfen.
2. **Normalisieren** — auf einzelne, atomare, nummerierte **EARS**-
   Anforderungen (*Easy Approach to Requirements Syntax*: when / while /
   if-then / where / shall — in der deutschen Form: *wenn / während /
   sofern / falls / muss*). Ein Absatz, der drei Pflichten verschleiert,
   wird zu drei nummerierten Anforderungen. Der Agent erfindet **keine**
   Nummer, damit eine mehrdeutige Anforderung beantwortet aussieht.
3. **Strukturieren** — Kapitelschnitt der technischen Spezifikation und
   der Konformitätsmatrix; jede Anforderung erhält einen Platz. Ergebnis:
   eine Coverage-Sicht — jede Anforderung ist eine Zeile, jede Zeile hat
   einen Zustand, nichts kann durchrutschen.
4. **Transformieren** — für jede Anforderung wird die passende
   wiederverwendbare deutschsprachige Passage aus den Altangeboten
   abgerufen, an die Besonderheiten dieser Anforderung angepasst und im
   Stil des hausinternen [Stilhandbuchs](
   ../sources/source-internal-german-style-guide.md) verfasst. Entworfen,
   nicht beantwortet.
5. **Exportieren** — die freigegebene Struktur in das vom Kunden
   geforderte Format rendern (Word + PDF, mit eingebetteter
   Konformitätsmatrix). Jeder Abschnitt wird mit den IDs der Anforderungen
   gestempelt, die er beantwortet — und **jede deutsche Antwort erhält
   eine englische Rückübersetzung Seite an Seite** als Annotation, damit
   ein englischsprachiger Prüfer das Lieferdokument auditieren kann.

## Harte Regeln — nicht verhandelbar
- **Der Agent committet keine Antwort.** Eine Anforderung wechselt nur
  über eine ausdrückliche menschliche Entscheidung in den Zustand
  *committed* — einzeln oder in geprüften Stapeln. Es gibt keinen
  "Alle-automatisch-beantworten"-Knopf.
- **Der Agent erfindet kein messbares Akzeptanzkriterium**, um eine
  mehrdeutige Quellenanforderung beantwortet aussehen zu lassen.
  Mehrdeutigkeit erscheint als *clarify*-Flag.
- **Der Agent überschreibt keine Anforderung still.** Späte
  Klarstellungen, die frühere Klauseln ändern, werden explizit verfolgt,
  mit sichtbarer Override-Kante im Knowledge-Graph.
- **Rückverfolgbarkeit überlebt den Export.** Jeder committete Abschnitt
  der exportierten Spezifikation trägt die IDs der beantworteten
  Anforderungen; die Konformitätsmatrix liegt **innerhalb** des
  Lieferdokuments; und jede Antwort ist bilingual annotiert
  (Deutsch + englische Rückübersetzung).

## Akzeptanzkriterien
- **Vollständigkeit**: Jede Anforderung aus dem Quellenstapel hat eine
  Zeile in der Coverage-Matrix; null Anforderungen ohne Zeile bei Abgabe.
- **Zustandsdisziplin**: Bei Abgabe befindet sich keine Zeile mehr in
  *open* oder *drafted*; jede Zeile ist *committed*, *deviation* oder
  *clarify*.
- **Provenienz**: Jede *drafted*-Antwort zitiert die Altangebotsstelle
  oder den Typprüfbericht, aus dem sie gezogen wurde; jede
  *committed*-Antwort zitiert den verantwortlichen Ingenieur.
- **Override-Sicherheit**: Jede späte Klarstellungsänderung ist mit der
  Klausel verknüpft, die sie ändert; kein verstecktes "muss" bleibt
  unentdeckt.
- **Bilinguale Annotation im Export**: Jede deutsche Antwort wird im
  Exportdokument Seite an Seite mit ihrer englischen Rückübersetzung
  geführt.

## Geltungsbereich
- Die NU-525-Lot-3-Funktionsspezifikation (Volumes 0–6), die sechs
  technischen Anhänge (A–F), das Netzanschluss-Konformitäts-Volume
  sowie die späte Klarstellungsmitteilung — alle als englische
  Word-Dokumente im Posteingang **inbox/** und als deutsche
  Arbeitsübersetzung in **documents/**.
- Das hausinterne deutschsprachige Wiederverwendungsmaterial: frühere
  technische Spezifikationen, Typprüfberichte und gelieferte Designs.
- Lieferdokument: die technische Spezifikation des Auftragnehmers +
  Konformitätsmatrix, auf Deutsch, im vom Kunden geforderten Format,
  mit bilingualer Annotation.

## Außerhalb des Geltungsbereichs
- Kommerzielles Pricing, Terminplan und Risikoeinreichung (getrennte
  Workstreams).
- Auswahl von Unterauftragnehmern jenseits dessen, was eine technische
  Klausel namentlich verlangt.
- Site-Acceptance-Testing (nach Zuschlag).

## Provenienz
Mission festgelegt am 2026-05-25 durch die Angebotsteamleitung,
ausgehend vom Lehrbeispiel in Teil 3 von *Agents that help humans
decide* (deutscher TSO, HGÜ-Konverterstation). Aktualisierung nur
durch eine ausdrücklich im Änderungsprotokoll dokumentierte
Mission-Change-Entscheidung.
`;

/**
 * Short English system-prompt brief written to .claude/CLAUDE.md.
 *
 * Why English: every other prompt under .claude/ in this repo (skills, hooks)
 * is English. CLAUDE.md is Claude Code's own system prompt, not part of the
 * deliverable knowledge base — so it stays in the lingua franca that the
 * agent's tooling already speaks. The long-form mission (in German) lives
 * in wiki/_meta/mission.md.
 */
export const CLAUDE_MD = `# Mission — NU-525-Lot-3 (HVDC requirements → German technical specification)

A German TSO (Nordseeübertragungs-Netz GmbH, "NSÜN") procures the onshore end
of a 525 kV / 2 GW HVDC converter station. English-language incoming
specifications land in \`inbox/\` as Word documents. The agent's working
language is **German**: the source excerpts under \`documents/\` are the
in-house German translation of the inbox; the firm's reuse base of past
offers is German; the wiki and mission are German.

The deliverable is a **German technical specification**. The export step
annotates every German response with its **English back-translation
side-by-side**, so an English-speaking reviewer can audit the deliverable
without speaking German.

## What the agent does

1. **Parse** — translate \`inbox/*.docx\` (EN) → \`documents/*.md\` (DE);
   split the German working text into segments; classify each
   (requirement / definition / context / standard reference /
   late-clarification override).
2. **Normalize** to atomic EARS requirements (German *muss / darf / sollte*).
3. **Structure** the deliverable — chapters + compliance matrix; map every
   requirement to a slot.
4. **Transform** — for each requirement, retrieve a passage from the German
   reuse base of past offers, adapt it, render in the house style.
5. **Export** — render the approved structure into the customer's required
   Word/PDF, stamping every section with the requirement IDs it answers
   and annotating each German response with its English back-translation.

## Hard rules

- **Never commit a response.** A row moves to \`committed\` only through an
  explicit human decision. No "auto-answer all" button.
- **Never invent a measurable acceptance criterion** to make ambiguity look
  answered. Flag for the clarify queue.
- **Never silently merge a late clarification.** Late-clarifications memo
  amendments are tracked as separate KG nodes with explicit override edges.
- **Traceability survives the export.** Every committed section carries the
  requirement IDs it answers; the compliance matrix ships inside the
  deliverable; every German response carries its English back-translation
  alongside.

## Read the long form

The authoritative mission (German, long form) lives at
\`wiki/_meta/mission.md\`. Every wiki write inherits its relevance from
that document. The project documentation aimed at humans opening the
workspace lives at \`documentation.md\`.
`;
