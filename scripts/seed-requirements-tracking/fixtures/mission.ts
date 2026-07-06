/**
 * Project identity, mission brief and CLAUDE.md for the
 * `tendertrace-stadtwerke` example project.
 */

export const PROJECT_NAME = 'tendertrace-stadtwerke';

export const MISSION_BRIEF = `TenderTrace-Arbeitsbereich für die Ausschreibung T-2026-014 "Kundenselfservice-Portal Stadtwerke Musterstadt". NovaSys GmbH hat den Zuschlag erhalten; das Projekt befindet sich in der Umsetzungsphase. Jede Anforderung ist als atomare EARS-Anforderung mit vollständiger Provenienz (Dokument, Abschnitt, wörtliches Zitat) erfasst, die Baseline v1.0 ist eingefroren (30.04.2026), und jede spätere Änderung existiert nur als genehmigter Diff mit Beleg. Agenten schlagen vor — Menschen entscheiden.`;

export const CLAUDE_MD = `# tendertrace-stadtwerke — TenderTrace tender workspace

This project is a **TenderTrace requirements-tracking workspace** for tender
**T-2026-014 "Kundenselfservice-Portal Stadtwerke Musterstadt"** (client:
Stadtwerke Musterstadt; contractor: NovaSys GmbH). Lena ran the bid; Sara
leads the implementation since the award. Working language is **German**.

The requirement set was extracted from the tender documents into atomic EARS
requirements, reviewed by a human, and frozen as **baseline v1.0 on
2026-04-30**. The project is now mid-implementation: inbound minutes and
emails run through drift detection, tracker issues are linked to
requirements, and every change since v1.0 exists only as an approved diff.

## Your tool surface (MCP group \`requirements-tracking\`)

Read-only research tools:

- \`search_requirements {query, topK}\` — hybrid search over the current requirement set
- \`get_requirement {reqId}\` — one requirement with version chain and relations
- \`get_document_section {sectionId}\` — normalized section text (e.g. "D-01/sec/4")
- \`search_catalog {query}\` / \`get_service {serviceId}\` — published service-catalog entries
- \`search_issues {query}\` / \`get_issue {issueKey}\` — mirrored tracker issues

The ONLY write path:

- \`submit_proposal {kind, payload, evidence, …}\` — submit an extraction /
  drift / link / shadow_scope / mapping / compliance proposal. Every proposal
  needs a **verbatim evidence quote** copied character-for-character from a
  registered source artifact. **A human decides every proposal in the UI** —
  never claim that a requirement changed, a link exists, or scope was
  accepted on your own authority. You propose; Lena or Sara decide.

All tools take \`projectName: "${PROJECT_NAME}"\`.

## UI pages

The TenderTrace app opens through sentinel files under
\`out/tendertrace/pages/*.tendertrace.json\` (dashboard, review-queue,
drift-inbox, compliance-matrix, response-builder, service-catalog,
link-review, deviation-report, claims, quick-capture, …). Point the user at
those files rather than describing raw data files.

## Ground rules

1. Never invent requirement text, thresholds or scope — quote the source.
2. Never decide a proposal; surface it and name the human who must decide.
3. German for all tender-facing content; keep REQ/PORTAL/SVC ids verbatim.
`;
