/**
 * documentation.md + user-interface.json fixtures for the requirements-hv
 * project.
 *
 * `documentation.md` is written to the project root in step 13 and
 * auto-opened via .etienne/user-interface.json previewDocuments. The five
 * quickActions mirror the article-aligned sidebar menu items in the
 * application-type config — keep both lists in sync if either is edited.
 *
 * Language: German (part of the working wiki). The only English narrative
 * in the seed is .claude/CLAUDE.md (Claude Code's own system prompt) and
 * the inbox/*.docx files (incoming customer specifications).
 */

export const USER_INTERFACE_JSON = {
  appBar: {
    title: 'Anforderungen → Spezifikation (NU-525-Lot-3)',
    fontColor: 'white',
    backgroundColor: '#1e3a8a',
  },
  welcomePage: {
    message: '',
    backgroundColor: '#f5f5f5',
    quickActions: [
      {
        title: 'Coverage-Dashboard öffnen',
        prompt:
          'Öffne out/compliance/current.compliance.json (das ist die Cockpit-Sicht — sie liest die Coverage-Matrix aus out/coverage/current.coverage.json und das Team aus wiki/topics/team.md serverseitig). Zeige die Zählungen pro Zustand, die Override- und Reuse-Mismatch-Chips und welche Anforderungen noch welches Gate blockieren. Schlage keine Zustandsübergänge vor — moderiere die Diskussion mit den verantwortlichen Ingenieuren.',
        sortOrder: 1,
      },
      {
        title: 'Welche Anforderungen sind noch offen?',
        prompt:
          'Liste jede Anforderung im Zustand "open". Nenne für jede das Quellvolume + den Abschnitt, den verantwortlichen Ingenieur, das von ihr blockierte Gate und etwaige Wiederverwendungskandidaten aus der Wissensbasis. Entwirf noch nicht — oberfläche die Warteschlange.',
        sortOrder: 2,
      },
      {
        title: 'Späte Klarstellungs-Overrides anzeigen',
        prompt:
          'Liste jede Anforderung, die durch das Klarstellungsmemo vom 2026-04-18 geändert wurde. Zeige für jede den Originalklauseltext, den geänderten Text, den zitierten Grund und den verantwortlichen Ingenieur. Hebe Zeilen hervor, in denen der aktuelle Entwurf aus einer Wiederverwendungsstelle gezogen wurde, die die URSPRÜNGLICHE (Vor-Änderungs-) Klausel beantwortet hat.',
        sortOrder: 3,
      },
      {
        title: 'Posteingang prüfen und übersetzen',
        prompt:
          'Prüfe inbox/ auf neue oder geänderte englische Word-Dokumente. Für jedes neue Dokument: extrahiere den Text (office-and-pdf-documents-Skill), übersetze in die Arbeitssprache Deutsch und lege das Ergebnis als documents/source-*-excerpt.md ab. Indiziere die deutschen Dateien im RAG; den Posteingang selbst NICHT indizieren.',
        sortOrder: 4,
      },
      {
        title: 'Aktuelle Spezifikation exportieren',
        prompt:
          'Führe den Exportschritt auf der aktuellen Coverage-Matrix aus. Verweigere das Rendern, wenn eine Zeile noch in open / drafted / reviewed ist, und liste die Blocker mit Inhabern. Andernfalls rendere die technische Spezifikation + Konformitätsmatrix in das vom Kunden geforderte Word/PDF-Template; stemple jeden Abschnitt mit den IDs der beantworteten Anforderungen und etwaigen Override-Kanten; annotiere jede deutsche Antwort mit ihrer englischen Rückübersetzung Seite an Seite.',
        sortOrder: 5,
      },
    ],
    showWelcomeMessage: true,
  },
  previewDocuments: ['documentation.md'],
  autoFilePreviewExtensions: [] as string[],
};

export const DOCUMENTATION_MD = `# Anforderungen → Spezifikation (NU-525-Lot-3)

Dieses Projekt ist das Lehrbeispiel zu *Agents that help humans decide —
Teil 3*: Wie ein Agent ~900 Seiten englischsprachiger Netzanschluss-
anforderungen in eine vollständige, rückverfolgbare deutsche technische
Spezifikation überführt — indem er die strukturierte Vorarbeit erledigt,
für die kein Ingenieur die Geduld hat, und das Unternehmen zu nichts
verpflichtet.

## Das Angebot

Nordseeübertragungs-Netz GmbH (NSÜN) — ein stilisierter Nordsee-TSO —
beschafft den Onshore-Endpunkt einer **525-kV/2-GW-HGÜ-Konverterstation**.
Die Anforderungen treffen in acht Volumes (Volume 0 + sechs Anhänge
A–F + Volume 6 Netzanschluss-Konformität) ein, dazu ein
Klarstellungsmemo vom 2026-04-18, das nach Schließung des
Bieterfragen-Fensters 41 Klauseln stillschweigend änderte.

## Sprachfluss in diesem Workspace

| Bereich | Sprache | Ort |
|---|---|---|
| Posteingang (Originalspezifikation) | **Englisch** | \`inbox/*.docx\` |
| Arbeitssprache (in-house übersetzt) | **Deutsch** | \`documents/*.md\` |
| Wiederverwendungsbasis (Altangebote) | **Deutsch** | \`documents/reuse-*.md\` |
| Wiki, Mission, Dokumentation | **Deutsch** | \`wiki/\`, \`documentation.md\` |
| Lieferdokument | **Deutsch** | \`out/\` (exportiertes Word/PDF) |
| Export-Annotation | **Englische Rückübersetzung** Seite an Seite | im exportierten Word/PDF |
| Claude Code Systemprompt | **Englisch** | \`.claude/CLAUDE.md\` |

Der Posteingang \`inbox/\` enthält die englischen Word-Originale, wie
sie vom Kunden geliefert werden. Die hausinterne Übersetzung in die
Arbeitssprache Deutsch liegt unter \`documents/\` als Markdown vor und
ist das Material, das der Agent parst, normalisiert und retrieved. Der
RAG-Index ist auf \`documents/\` ausgerichtet — \`inbox/\` wird nicht
indiziert.

## Die Aufgabe des Agenten

Eine technische Spezifikation ist eine Sammlung **technischer Zusagen**.
Ob *erfüllen / teilweise erfüllen / Alternative anbieten / Abweichung
erklären / Klärung anfordern* — das sind technische und kaufmännische
Verpflichtungen, gedeckt durch Vertragsstrafen, und sie gehören einem
verantwortlichen Ingenieur, der seinen Namen darunter setzt.

Die Aufgabe des Agenten ist **nicht**, diese Zusagen zu machen. Seine
Aufgabe ist die strukturierte Vorarbeit, die vorher geleistet werden
muss:

0. **Posteingang übersetzen** — die englischen \`inbox/*.docx\` werden
   in die Arbeitssprache Deutsch übersetzt und unter
   \`documents/source-volume-*-excerpt.md\` abgelegt.
1. **Parsen** — den deutschen Anforderungsstapel in Segmente zerlegen
   und jedes klassifizieren (Anforderung / Definition / Kontext /
   Normenverweis / späte Klarstellungs-Override). Mehrdeutiges wird
   markiert, nicht verworfen.
2. **Normalisieren** auf einzelne, atomare, nummerierte EARS-
   Anforderungen (*wenn / während / falls / sofern / muss*). Der Agent
   erfindet **kein** messbares Kriterium, damit eine mehrdeutige Quelle
   beantwortet aussieht.
3. **Strukturieren** des Lieferdokuments — Kapitel der technischen
   Spezifikation + Konformitätsmatrix; jede Anforderung erhält einen
   Platz.
4. **Transformieren** — für jede Anforderung eine passende deutsche
   Wiederverwendungsstelle aus der Altangebotsbasis abrufen, anpassen
   und im Hausstil verfassen. **Entworfen, nicht beantwortet.**
5. **Exportieren** — die freigegebene Struktur in das vom Kunden
   geforderte Word/PDF-Format rendern; jeden Abschnitt mit den IDs der
   beantworteten Anforderungen stempeln; jede deutsche Antwort mit
   ihrer **englischen Rückübersetzung Seite an Seite** annotieren.
   **Rückverfolgbarkeit überlebt den Export.**

## Was dieser Workspace enthält

| Wo | Was |
|---|---|
| \`inbox/*.docx\` | 7 englische Word-Dokumente: die eingehende Originalspezifikation des Kunden. Nicht im RAG indexiert. |
| \`wiki/_meta/mission.md\` | Die Mission (Langform, deutsch). |
| \`wiki/topics/\` | Wiki-Seiten: die 5 Pipeline-Schritte, EARS, die load-bearing FRT-250ms-Fallstudie, die späten Klarstellungs-Overrides, die Wiederverwendungsbasis, die Coverage-Zustände, die drei Agentenregeln, sowie die [drei Wege, eine geplante Antwort anzulegen](wiki/topics/creating-planned-responses.md). |
| \`documents/\` | ~17 RAG-Dokumente: deutsche Quellvolumeauszüge, das Klarstellungsmemo, deutsche Altangebotsauszüge (die Wiederverwendungsbasis), Typprüfberichte, Hausstilhandbuch + Übergabe-Notizen. |
| Knowledge-Graph | ~40 EARS-Anforderungen, 8 Quellvolumes, das Klarstellungsmemo, 6 Wiederverwendungsquellen, 8 Normen, 5 namentlich genannte Ingenieure, der Kunde. Override-Kanten, Typprüfungs-Nachweiskanten und Reuse-Mismatch-\`cascadesTo\`-Kanten. |
| \`out/coverage/current.coverage.json\` | Das Coverage-Dashboard — jede Anforderung, jeder Zustand, jeder Chip. Wird automatisch im Vorschau-Panel geöffnet. |
| \`.etienne/chat.history-*.jsonl\` | Drei Sitzungen: Parse-Normalize-Durchgang, späte Klarstellungs-Override an REQ-184, Reuse-Mismatch am Annex-C-Cluster. |

## Die drei load-bearing Beispiele

- **REQ-247 (FRT-250ms)** — das einzelne *muss* unter einer
  Oberschwingungstabelle in Annex A §7.4.3 Fußnote 2, das der Agent als
  eigenständige atomare Anforderung oberflächt. Entworfen aus dem
  Northshore-2022-MMC-Regelschema (32 ms Typprüfreserve). Die Art von
  Klausel, die Menschen um 23 Uhr verpassen.
- **REQ-184 (Blindleistungsbereich)** — durch das Klarstellungsmemo
  vom 2026-04-18 von ±0,95/±0,95 auf ±0,90 voreilend / ±0,95
  nacheilend geändert. Override-Kante im KG; *override*-Chip auf dem
  Dashboard. Der aktuelle Entwurf wurde aus Aurora-2024 gezogen und
  beantwortet das **ursprüngliche** Profil — ein stilles Committen
  würde den voreilenden Bereich verfehlen.
- **REQ-303-Cluster (Annex C, THD ≤ 0,9 %)** — Reefnet-2020 lieferte
  ≤ 1,5 %. Der Cluster-Kopf und drei Abhängige (REQ-304/305/307)
  tragen den *reuse-mismatch*-Chip. Bernd Haags Entscheidung: neu
  abstimmen, abweichen oder klären.

## Wie Wiki-Themenseiten strukturiert sind

Die kanonische Vorlage für jede per-Thema-Wiki-Seite ist
[wiki/topics/team.md](wiki/topics/team.md). Das Muster:

1. **Frontmatter** — \`status\`, \`confidence\`, \`tags\`,
   \`mission_relevance\`, \`classification\`.
2. **Titel** — \`# <Thema>\`.
3. **Ein-Absatz-Einleitung** — was die Seite ist und wer/was sie
   konsumiert.
4. **Der Rumpf** — meist eine Markdown-Tabelle, wenn die Seite eine
   Liste von Elementen ist, die das Cockpit per Schlüssel auflöst (wie
   die Team-Tabelle); ansonsten freier Fließtext mit Querverweisen auf
   andere Wiki-Seiten via \`[label](../topics/<slug>.md)\`.
5. **"Wie das Cockpit das nutzt"** — ein kurzer Abschnitt mit
   Nutzungshinweisen, der erklärt, welches UI-Element gegen diese Seite
   auflöst und wie Hinzufügen/Entfernen das Cockpit beeinflusst.

Die durch \`fixtures/wiki-pages.ts\` erzeugten Wiki-Seiten folgen
diesem Muster bereits weitgehend; diese Dokumentation macht die Regel
explizit.

## Was der Agent nicht tut

- Er verschiebt keine Zeile von sich aus auf *committed*. Das
  Dashboard zeigt jederzeit die Zählungen *drafted vs. committed*. Es
  gibt keinen Alle-automatisch-beantworten-Knopf.
- Er erfindet kein messbares Akzeptanzkriterium für eine mehrdeutige
  Quellanforderung. Er markiert sie stattdessen für die Klärungs-
  Warteschlange.
- Er verschmilzt eine späte Klarstellung nicht still in die
  ursprüngliche Klausel. Overrides werden als separate KG-Knoten mit
  eigenen Kanten verfolgt.
- Er exportiert keine Coverage-Matrix mit Zeilen, die noch in *open /
  drafted / reviewed* sind. Das G3-Commit-Gate wird vom Exportschritt
  selbst durchgesetzt.

## Hier anfangen

Klicke auf **Coverage-Dashboard öffnen** in der linken Leiste. Dann
gehe eine einzelne Anforderung von Anfang bis Ende durch — *Warum ist
REQ-247 drafted? Woher hat der Agent den Entwurf gezogen? Was ist die
Typprüfreserve? Wer unterschreibt?* Dieselbe Frage, im System sichtbar
beantwortet, ist der ganze Sinn des Artikels.

Wenn die Zeile, die du anschaust, noch keine geplante Antwort hat,
zeigt das rechte Panel einen Aufklapp-Knopf mit den
[drei Wegen, eine geplante Antwort anzulegen
](wiki/topics/creating-planned-responses.md): leeren Stub, aus
vorhandenen Inhalten (Documents oder Wiki) ziehen, oder aus der
Wissensbasis fragen.
`;
