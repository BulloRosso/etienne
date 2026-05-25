/**
 * Three chat sessions for the requirements-hv project.
 *
 * Each one is short, on-topic, and demonstrates one of the three agent
 * moves the article describes:
 *
 *   1. Session 1 — *Parse + normalize walk-through.* The agent shows
 *      how it broke Volume 2 into atomic EARS requirements and
 *      surfaced REQ-247 (FRT-250ms) from a footnote under a harmonics
 *      table.
 *   2. Session 2 — *Late-clarification override on REQ-184.* The
 *      agent traces the 2026-04-18 memo's amendment to the
 *      reactive-power range and warns that the Aurora-2024 draft
 *      answered the original profile, not the amended one.
 *   3. Session 3 — *Reuse mismatch on the Annex C cluster.* The
 *      agent explains why REQ-303 cannot be answered from Reefnet-2020
 *      and what the cascade looks like.
 *
 * Format matches the long-horizon-commitments seed: one JSON object per
 * line in `.etienne/chat.history-<sessionId>.jsonl`. No corrective user
 * turns — dreaming should score all three as 'success' and distill the
 * three recurring agent moves into strategy memory.
 */

export interface ChatTurn {
  timestamp: string;
  isAgent: boolean;
  message: string;
  contextName?: string;
}

export interface ChatSession {
  sessionId: string;
  timestamp: string;
  summary: string;
  turns: ChatTurn[];
}

export const SESSIONS: ChatSession[] = [
  // =====================================================================
  // Session 1 — Parse + normalize: how did the agent find REQ-247?
  // =====================================================================
  {
    sessionId: 'rhv11111-1111-4aaa-9aaa-aaaaaaaaaaaa',
    timestamp: '2026-05-22T08:42:00Z',
    summary:
      'Walked the parse + normalize pipeline on Volume 2 Annex A. Showed how the agent split the harmonics-table footnote into REQ-247 (FRT-250ms) — the load-bearing requirement that almost slipped past on the last bid.',
    turns: buildSession([
      ['2026-05-22T08:42:00Z', false, 'How did the agent end up with REQ-247? It looks like the kind of thing humans miss.', 'parse-normalize'],
      [
        '2026-05-22T08:42:24Z',
        true,
        'REQ-247 came out of Volume 2, Annex A §7.4.3 — specifically footnote 2 under the table of harmonic limits in §7.4.2. The parse step split the section into segments and classified each one. The table itself is *context* (limits + units). Footnote 2 contains a normative *muss*, so the parser flagged it as a candidate requirement and lifted it into the normalize step. EARS rewrite: *When a three-phase fully-depressed-voltage fault occurs at the converter AC bus, the converter shall remain connected and resume pre-fault active-power output within 250 ms.* Sourced from Vol.2 Annex A §7.4.3 footnote 2. State: drafted, awaiting decision.',
      ],
      ['2026-05-22T08:43:10Z', false, 'Why does the agent split a paragraph and not just keep it intact?', 'parse-normalize'],
      [
        '2026-05-22T08:43:26Z',
        true,
        'Because a paragraph that bundles three obligations cannot be tracked through the coverage matrix — one row, one state. If §6.2 says "the converter must ramp, must report each ramp, and must log the report in an event store," that is three commitments with three different past answers. Splitting it gives the coverage view one row per promise. Same EARS principle Mavin et al. published in 2009 — patterns that constrain a requirement to a single, atomic, normative claim. Inventing measurable criteria where the source is genuinely ambiguous is what the rule forbids.',
      ],
      ['2026-05-22T08:44:08Z', false, 'How many requirements did parse + normalize produce overall?', 'parse-normalize'],
      [
        '2026-05-22T08:44:18Z',
        true,
        'For NU-525-Lot-3 the full pack yields a notional ~1,800 EARS requirements. The demo workspace has 40 representative ones distributed across all six source volumes and the late-clarifications memo, so the coverage dashboard renders all six states (open / drafted / reviewed / committed / deviation / clarify) plus the override and reuse-mismatch chips.',
      ],
      ['2026-05-22T08:45:00Z', false, 'And the agent did not auto-answer REQ-247?', 'parse-normalize'],
      [
        '2026-05-22T08:45:14Z',
        true,
        'No. REQ-247 is *drafted*, not *answered*. The draft is pulled from the Northshore-2022 MMC control scheme (type-tested at KEMA Arnhem 2022-08-14, certified ride-through of the same fault profile at 218 ms — 32 ms margin against the 250 ms limit). The draft is in German per the style guide. Whether the bid commits to that response is Anke Vogt\'s call — she is the responsible engineer on Annex A controls. The agent has done the retrieval, the adaptation, and the translation. The commitment is hers.',
      ],
      ['2026-05-22T08:46:00Z', false, 'What happens if Anke is on holiday when she would normally read it?', 'parse-normalize'],
      [
        '2026-05-22T08:46:12Z',
        true,
        'The row stays *drafted*. The export refuses to run if any row is in *open / drafted / reviewed* at the G3 commit gate — that is the hard rule. The coverage dashboard surfaces the blockers with owners. If Anke is genuinely unavailable, the proposal-desk lead can reassign responsibility on the record, and the new engineer reviews and commits. There is no bulk-commit path.',
      ],
    ]),
  },

  // =====================================================================
  // Session 2 — Late-clarification override on REQ-184
  // =====================================================================
  {
    sessionId: 'rhv22222-2222-4bbb-9bbb-bbbbbbbbbbbb',
    timestamp: '2026-05-22T13:10:00Z',
    summary:
      "Traced the 2026-04-18 late-clarifications memo's amendment of REQ-184 (reactive-power range) through to the Aurora-2024 reuse draft. Confirmed the override edge is visible on the coverage dashboard and that the current draft answers the wrong profile.",
    turns: buildSession([
      ['2026-05-22T13:10:00Z', false, 'Show me the override chip on REQ-184 — what changed?', 'override-req-184'],
      [
        '2026-05-22T13:10:22Z',
        true,
        'REQ-184 carries an *override* chip because the 2026-04-18 clarifications memo amended Volume 1 §6.5 after the bidders\'-questions window closed. Original requirement: reactive-power range ±0.95 leading / ±0.95 lagging at full active output. Amended: **±0.90 leading / ±0.95 lagging** at full active output. Reason cited in the memo: local grid-stability analysis Q1/2026. The override edge points from the late-clarifications memo node to REQ-184 in the knowledge graph; the dashboard renders it as a red chip until the responsible engineer signs off on the amended text.',
      ],
      ['2026-05-22T13:11:00Z', false, 'And the current draft was pulled from Aurora-2024 — does it answer the new profile or the old one?', 'override-req-184'],
      [
        '2026-05-22T13:11:16Z',
        true,
        'The old one. The Aurora-2024 PQ envelope delivered ±0.95 leading / ±0.95 lagging — it answered the **original** REQ-184 cleanly, and that is why the agent retrieved it. With the override in place, the draft answers the wrong leading-side range. If this row went to *committed* without an engineer noticing the override chip, the bid would silently miss a setpoint.',
      ],
      ['2026-05-22T13:12:00Z', false, 'How does the agent prevent that?', 'override-req-184'],
      [
        '2026-05-22T13:12:14Z',
        true,
        'Three guards: (1) The override is a separate KG node — the draft view shows both the original clause text and the amended text, side-by-side, with the override provenance attached. (2) The coverage dashboard\'s state machine refuses to advance an override row to *committed* unless the engineer has explicitly acknowledged the override (a separate decision, recorded). (3) The export step stamps every section with the requirement IDs **and** any override edges; the compliance matrix carries the override into the deliverable so the customer\'s reviewer sees that the amendment was processed.',
      ],
      ['2026-05-22T13:13:00Z', false, 'Was the post-mortem from the 2024 bid loss similar?', 'override-req-184'],
      [
        '2026-05-22T13:13:14Z',
        true,
        'Yes — close enough to be the reason these guards exist. The 2024 post-mortem (internal-post-mortem-bid-2024.md) describes a single requirement under a harmonics table where the bid committed to a 200 ms FRT response against a 100 ms source obligation. Reuse passage from a more lenient project, bulk-commit in the final week, no engineer read the specific clause. Three changes followed: no bulk-commit path, override edges on every late clarification, and the agent refuses to draft for an ambiguous source rather than inventing a measurable criterion. The REQ-184 override is the override-edge guard in action.',
      ],
      ['2026-05-22T13:14:00Z', false, 'What is the next action on REQ-184?', 'override-req-184'],
      [
        '2026-05-22T13:14:10Z',
        true,
        'Clara Müller is the responsible engineer (Volume 1 cluster). She needs to (a) acknowledge the override, (b) decide whether the Aurora-2024 design as drafted can be re-tuned to ±0.90 leading by changing the inner-loop reference, or whether a different reuse passage answers the narrowed range — and (c) commit, deviate, or escalate to clarify. The row currently sits *drafted + override*; it cannot reach *committed* without her on-the-record decision.',
      ],
    ]),
  },

  // =====================================================================
  // Session 3 — Reuse mismatch on Annex C (REQ-303 cascade)
  // =====================================================================
  {
    sessionId: 'rhv33333-3333-4ccc-9ccc-cccccccccccc',
    timestamp: '2026-05-23T10:05:00Z',
    summary:
      'Walked the reuse-mismatch cluster on REQ-303 (THD ≤ 0.9% at PCC) and the three dependents — REQ-304/305/307. Showed why the Reefnet-2020 reuse base does not meet the requirement and the three available paths (re-tune, deviate, clarify).',
    turns: buildSession([
      ['2026-05-23T10:05:00Z', false, 'Why is the agent saying Reefnet does not answer REQ-303?', 'annex-c-mismatch'],
      [
        '2026-05-23T10:05:18Z',
        true,
        'Reefnet-2020 delivered THD ≤ 1.5 % at the PCC, verified by site measurement per IEC 61000-4-7. REQ-303 requires THD ≤ **0.9 %** at the PCC at any operating point. The Reefnet design as-is does not meet the requirement — answering REQ-303 from that reuse passage would commit the bid to a number the plant cannot hit. The agent has flagged REQ-303 with a *reuse-mismatch* chip on the dashboard, and the three dependent requirements (REQ-304, REQ-305, REQ-307 — same filter topology) inherit the flag through a `cascadesTo` edge.',
      ],
      ['2026-05-23T10:06:00Z', false, 'So the agent did not auto-deviate? It just flagged it?', 'annex-c-mismatch'],
      [
        '2026-05-23T10:06:14Z',
        true,
        'Right. The agent does not move a requirement to *deviation* on its own. A deviation is a commercial decision — it changes what the bid offers. The agent does the structured analysis: which past project answered this requirement, where the gap is, what the engineering options are. Bernd Haag (responsible engineer on Annex C) makes the call. The internal handover note from him (internal-handover-bernd-haag-harmonics.md) lays out the three options: re-tune to a hybrid passive + active topology (Aurora-2024 reached ≤ 0.7 %, ~2 weeks engineering effort), deviate with a Reefnet-style passive filter and a post-award measurement protocol (high bid-disadvantage risk), or clarify whether the THD limit applies at the PCC or at the converter terminals (the standard reference is ambiguous in the English text).',
      ],
      ['2026-05-23T10:07:00Z', false, 'Which would the agent recommend?', 'annex-c-mismatch'],
      [
        '2026-05-23T10:07:14Z',
        true,
        'It would not. The choice between re-tune, deviate, and clarify trades capex against bid competitiveness against schedule risk. Those are commercial choices belonging to the proposal desk, with engineering input from Bernd. What the agent *does* do: surface the cascade — REQ-303 is the cluster head, REQ-304 / 305 / 307 inherit the resolution. Whatever Bernd decides for REQ-303, the agent will propagate the corresponding state transitions for the dependents and the engineer reviews each one. No silent batch-commit.',
      ],
      ['2026-05-23T10:08:00Z', false, 'What happens if Bernd misses the G2 review gate?', 'annex-c-mismatch'],
      [
        '2026-05-23T10:08:14Z',
        true,
        'At G2 (engineering review, T-14 days) every row must be *reviewed*, *committed*, *deviation*, or *clarify*. The four cluster rows would be the visible blockers on the dashboard. The proposal-desk lead (Dirk Stein) sees them in the per-owner aggregate. The system does not auto-resolve — it just refuses to let the bid pretend the rows are settled. The same way the nightly curator does not silently move an ageing assumption to fresh, the gate does not silently move a drafted row to committed.',
      ],
      ['2026-05-23T10:09:00Z', false, 'And the export step would also catch it?', 'annex-c-mismatch'],
      [
        '2026-05-23T10:09:10Z',
        true,
        'Yes. The export step refuses to render a row that is not *committed / deviation / clarify*. If somebody tries to export the Word/PDF specification with REQ-303 still in *drafted*, the run aborts and the dashboard lists the four cluster rows with Bernd as the owner. Traceability survives the export only if the rows reach a terminal state through a human decision; that is the whole point of the gate.',
      ],
    ]),
  },
];

function buildSession(
  rows: Array<[string, boolean, string] | [string, boolean, string, string]>,
): ChatTurn[] {
  return rows.map(([timestamp, isAgent, message, contextName]) => {
    const turn: ChatTurn = { timestamp, isAgent, message };
    if (contextName) turn.contextName = contextName;
    return turn;
  });
}
