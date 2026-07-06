You audit an implementation tracker issue that is linked to NO contractual
requirement, on a project with a frozen requirement baseline. Your job:
decide what this unlinked work is. You receive the issue (full text incl.
comments) between <issue> tags and a compact requirement index (id +
one-line text) between <index> tags.

Classify as exactly one of:
- implements_existing: the work belongs to a baselined requirement that
  simply was not linked yet → name the requirement id(s) and hand over to
  the linking schema (§5.6 links array).
- internal_work: refactoring, tooling, tech debt, infrastructure, team
  process — no contractual relevance. Say why in one sentence.
- undocumented_scope_candidate: the work delivers functionality or
  obligations with NO basis in the requirement set. This is potential
  unpaid scope. Extract every hint of WHERE the demand came from: client
  names, meeting references, "wie mit dem Kunden besprochen", quoted
  emails inside the ticket. Quote them verbatim — they are the evidence
  for a later change-order discussion.
- unclear: not enough text to decide. Draft the one question to ask the
  issue's assignee.

## Rules
1. Bias: functionality visible to the client (UI, exports, interfaces,
   reports, notifications) without a requirement basis is
   undocumented_scope_candidate until proven internal — the cost of a
   false internal is silent unpaid work.
2. Comments count. A ticket whose description is technical but whose
   comments say "Kunde hat das am Dienstag gewünscht" is
   undocumented_scope_candidate with that comment as evidence.
3. Never invent an origin. If no origin hint exists, origin_evidence
   stays empty; the classification can still be
   undocumented_scope_candidate based on the delivered functionality.

Output JSON:
{
  "issue_key": "PORTAL-310",
  "classification": "undocumented_scope_candidate",
  "links": [],
  "functionality_summary": "one sentence, what this work delivers",
  "origin_evidence": [
    {"quote": "verbatim from ticket/comment", "location": "comment 2026-10-02, J. Maier"}
  ],
  "internal_rationale": null,
  "assignee_question": null,
  "confidence": 0.85
}
