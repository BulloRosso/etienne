/**
 * Project identity, mission brief and CLAUDE.md for the `tendertrace-analysis`
 * example project — the tender-analysis showcase (domain: Lagerlogistik).
 */

export const PROJECT_NAME = process.env.SEED_PROJECT_NAME || 'tendertrace-analysis';

export const TENDER_KEY = 'T-2026-031';
export const TENDER_TITLE = 'Betrieb Logistikzentrum Nord — Nordland Handels AG';

export const MISSION_BRIEF =
  `TenderTrace-Arbeitsbereich für die Ausschreibung ${TENDER_KEY} "${TENDER_TITLE}": ` +
  `Die Nordland Handels AG schreibt den Betrieb ihres Zentrallagers (Kontraktlogistik) aus. ` +
  `Die Unterlagen liegen in tender/ (Leistungsbeschreibung, Vertragsbedingungen, Mengengerüst als Excel), ` +
  `unser Leistungskatalog in servicecatalog/, die Vorlage für die Management-Analyse in analysis-template/. ` +
  `Das Analyse-Cockpit führt in fünf Schritten von den Dokumenten zu einer belastbaren Management-Analyse: ` +
  `Anforderungen werden als atomare EARS-Anforderungen in unserer Terminologie extrahiert, Zahlen gegen das ` +
  `Mengengerüst geprüft, der Leistungskatalog in EARS überführt und nur klare Übereinstimmungen zugeordnet. ` +
  `Agenten schlagen vor — Menschen entscheiden.`;

export const CLAUDE_MD = `# ${PROJECT_NAME} — TenderTrace tender analysis

This project is a **TenderTrace analysis workspace** for tender
**${TENDER_KEY} "${TENDER_TITLE}"** (customer: Nordland Handels AG;
bidder: Hansa Logistik GmbH — that is "us"). Working language is **German**.

## Folder contract

| Folder | Content |
|---|---|
| \`tender/\` | the customer's documents: PDF, Word, Excel (the Excel "Mengengerüst" holds the raw figures) |
| \`servicecatalog/\` | OUR service catalog as one markdown file (+ optional \`glossary.md\` customer term → our term) |
| \`analysis-template/\` | one markdown file: structure and tone of the management analysis |
| \`out/analysis/\` | generated: \`<tender>-analysis.md\` + \`.docx\` + \`.snapshot.json\` |

## The five-step flow (Analyse-Cockpit)

1. **Dokumente einlesen** — \`rt_run_tender_analysis\` reads every file in
   tender/, extracts atomic EARS requirements (\`ears_text\` faithful to the
   source, \`domain_text\` in OUR vocabulary via the glossary), cross-checks
   figures against the Excel sheet, imports the catalog and expresses it as
   EARS capability statements. Progress: \`analysis.progress\` events.
2. **Anforderungen prüfen** — a human approves or rejects every extraction
   card in the Review Queue (\`rt_decide_proposal\`). Never do this yourself.
3. **Widersprüche klären** — figure contradictions (text vs. Excel) are
   resolved by a human (\`rt_resolve_consistency_alert\`: tender / excel /
   clarify). Unresolved contradictions block step 4.
4. **Abgleich mit Leistungskatalog** — \`rt_continue_tender_analysis\` proposes
   only clear mappings (confidence ≥ 0.75, no "related") and compliance
   verdicts. Both stay proposals for the Compliance Matrix.
5. **Management-Analyse** — Markdown + DOCX under out/analysis/, following the
   template; the reliability banner says whether the analysis is
   *belastbar* or carries reservations (open customer clarifications,
   internal questions).

## Your tool surface (MCP group \`requirements-tracking\`)

- \`rt_get_analysis_status\` — where the analysis stands (stages, readiness, alerts)
- \`rt_run_tender_analysis\` / \`rt_continue_tender_analysis\` / \`rt_regenerate_analysis_report\`
- read-only research: \`search_requirements\`, \`get_requirement\`, \`get_document_section\`,
  \`search_catalog\`, \`get_service\`, \`rt_list_proposals\`, \`rt_get_proposal\`, \`rt_get_compliance_matrix\`
- the ONLY write path for new content: \`submit_proposal\` with a verbatim evidence quote

## Ground rules

1. **Never parse tender files yourself** (no liteparse, no python). Registration
   and parsing happen inside \`rt_run_tender_analysis\`; sections are read with
   \`get_document_section\`.
2. Never invent requirement text, thresholds or scope — quote the source.
3. Never approve, reject or resolve anything on your own authority; name the
   step in the cockpit where the human decides.
4. German for all tender-facing content; keep REQ/SVC/P ids verbatim.
5. Point users at \`out/tendertrace/pages/analysis.tendertrace.json\` (the cockpit)
   rather than at raw state files under requirements-tracking/.
`;
