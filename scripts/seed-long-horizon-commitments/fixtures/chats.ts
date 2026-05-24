/**
 * Three chat sessions for the long-horizon-commitments project.
 *
 * Format mirrors the desalination seed: one JSON object per line in
 * `.etienne/chat.history-<sessionId>.jsonl`. Each session is short, on-
 * topic, no corrective user turns — so dreaming scores them as 'success'
 * and three recurring agent moves appear across sessions for distill to
 * cluster:
 *
 *  1. "Cite the source document when ageing an assumption."
 *  2. "Never re-baseline a projection on your own."
 *  3. "When a gate is within 18 months, force a re-decision of every
 *     deferred item before the window opens."
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
  // Session 1 — Why is the Meridian off-strategy?
  // =====================================================================
  {
    sessionId: 'lhc11111-1111-4aaa-9aaa-aaaaaaaaaaaa',
    timestamp: '2026-05-18T09:14:00Z',
    summary:
      "Walked the Meridian's four historical decisions and the eight assumptions beneath them, identified the three expired ones, traced the chain back to the source memos.",
    turns: buildSession([
      ['2026-05-18T09:14:00Z', false, "Why is the Meridian flagged off-strategy?", 'meridian-status'],
      [
        '2026-05-18T09:14:18Z',
        true,
        "The Meridian's strategy alignment is 38%. The fleet strategy is *compliant and charter-ready through 2035*; the Meridian's commitment chain has aged underneath that frame. Four decisions sit on the lifeline (2018 no-scrubber, 2021 long-charter, 2023 refinanced, 2025 comply-via-allowances). Of the eight assumptions those decisions rest on, three are expired and three are ageing. Three rechecks are overdue. The next dry-dock window is ~14 months out — that is the cheap window to re-decide. Want me to walk the lifeline year by year?",
      ],
      ['2026-05-18T09:15:00Z', false, "Yes, start with the 2018 decision.", 'meridian-status'],
      [
        '2026-05-18T09:15:24Z',
        true,
        "The 2018 decision was *not to fit a scrubber* at that year's dry-dock. The recorded rationale (memo-no-scrubber-2018-rationale.md) cites three load-bearing claims: (a) the HSFO/VLSFO spread will narrow within five years, (b) the low-sulphur premium will stay small, and (c) the USD 3.35M capex earns a better return refinancing the charter. The first two are the assumptions that have since expired. Per the 2024 analyst note (analyst-fuel-spread-2024.md), the realised spread widened — €220/t in 2020, €270/t in 2022 — and did not return to the 2018 forecast range. The agent put 'fuel spread narrows' on ageing in late 2020 and on expired in 2022.",
      ],
      ['2026-05-18T09:16:10Z', false, "And the agent flagged it in every packet since?", 'meridian-status'],
      [
        '2026-05-18T09:16:22Z',
        true,
        "Yes — every quarterly packet for two years. The agent does not decide the retrofit; it brings the decision back. The reason the packets did not produce a re-decision is the topic of the 2024 charter review memo, which is a separate story.",
      ],
      ['2026-05-18T09:17:00Z', false, "What about the 2021 charter — is that expired too?", 'meridian-status'],
      [
        '2026-05-18T09:17:18Z',
        true,
        "Ageing, not expired. The 2021 charter rested on two assumptions: 'charter rate holds at plan' and 'counterparty solid'. The 2024 charter review (memo-charter-review-2024.md) records realised income ~11% below plan, but counterparty performance has been exemplary. So one of the two assumptions is amber — the agent does not move it to expired until the index actually breaks, and that has not happened. The other stays fresh. Rule: cite the source document when ageing an assumption — and never move an ageing item to fresh without an explicit human re-decision.",
      ],
      ['2026-05-18T09:18:00Z', false, "Refinancing in 2023 — what is the status?", 'meridian-status'],
      [
        '2026-05-18T09:18:14Z',
        true,
        "Refinanced against a residual-value glide; rests on 'rates settle below plan' (expired since Q3 2023, never recovered) and 'residual value glide holds' (ageing — broker valuations drifting down per valuation-meridian-2026.md, but not falsified outright). One expired, one ageing.",
      ],
      ['2026-05-18T09:18:50Z', false, "And the 2025 EUA decision?", 'meridian-status'],
      [
        '2026-05-18T09:19:08Z',
        true,
        "Built on EUA price stability at €75/t with €90/t sensitivity. The Q1 2026 average was €103/t per analyst-eua-price-2026.md, and the forward curve sits at €110-140/t through 2028. 'EUA price stable' moved to expired in Q4 2025. The companion assumption — 'no retrofit needed yet' — stays ageing because it becomes a forced choice at the 2027 dry-dock anyway.",
      ],
      ['2026-05-18T09:19:50Z', false, "What is the agent recommending?", 'meridian-status'],
      [
        '2026-05-18T09:20:02Z',
        true,
        "The agent is *not recommending*. The retrofit-vs-defer-vs-scrap call is irreversible; per the project's rules a second agent argues the case-against, the human adjudicates on the record. The red-team workflow on this decision is already created. What the agent *does* recommend is that the live quarterly packet be actioned before the dry-dock window opens (~14 months) — no silent default. Want me to open the packet?",
      ],
      ['2026-05-18T09:20:35Z', false, "Open the packet.", 'meridian-status'],
      [
        '2026-05-18T09:20:42Z',
        true,
        "Opening the Q2 2026 packet: 3 assumptions expired (fuel-spread-narrows, low-sulphur-premium-small, rates-below-plan, EUA-price-stable — let me re-count, that is 4), 1 gate approaching (gate-meridian-drydock-2027, 14 months out, 3 deferred items), 1 projection breached (Meridian lifetime earnings, left the cone in 2023), 1 vessel drifted off-strategy (Meridian at 38%). Actions on the packet: Escalate / Acknowledge / Open Decisions. The packet stays open until one of those is recorded.",
      ],
    ]),
  },

  // =====================================================================
  // Session 2 — Projection-vs-reality on the Meridian
  // =====================================================================
  {
    sessionId: 'lhc22222-2222-4bbb-9bbb-bbbbbbbbbbbb',
    timestamp: '2026-05-19T10:02:00Z',
    summary:
      "Reviewed the Meridian's lifetime-earnings projection cone, identified the 2023 breach point, refused to auto-re-baseline, set up the convening review.",
    turns: buildSession([
      ['2026-05-19T10:02:00Z', false, "Show me the Meridian projection vs actuals.", 'projection-review'],
      [
        '2026-05-19T10:02:14Z',
        true,
        "The Meridian carries a lifetime-earnings projection from 2018 with a 15% uncertainty band. Actuals tracked inside the band through 2022 (peaked around the post-pandemic rate cycle), then **left the lower band in Q2 2023** and have stayed below since. The breach is the review trigger. Status on the projection record is 'review-requested', rebaselined: false.",
      ],
      ['2026-05-19T10:03:05Z', false, "Update the projection so it matches the new run-rate.", 'projection-review'],
      [
        '2026-05-19T10:03:18Z',
        true,
        "I cannot do that. The hard rule on this project is: *the agent never re-baselines a projection*. Only a human re-baselines, on the record, and the old projection stays beside the new one. The tempting move when actuals diverge is to quietly update the forecast so the dashboard turns green — that erases the history of having been wrong, which is exactly what future-you will need years from now to make the next decision. What I can do is *convene the review*: lay out whether the model was wrong or the world changed, and produce a structured decision packet for you to adjudicate.",
      ],
      ['2026-05-19T10:04:00Z', false, "OK, convene the review.", 'projection-review'],
      [
        '2026-05-19T10:04:12Z',
        true,
        "Convening. Two columns: 'model wrong' and 'world changed'. Model-wrong evidence: the 2018 fuel-spread forecast was off, the 2023 refi assumed rates settling below plan, both of those were assumption errors the projection priced in. World-changed evidence: EU ETS arrived in 2024 (was drafted in 2018 but not adopted), FuelEU intensity steps tightening from 2025, IMO 2027 net-zero framework approved in 2025. Both columns have load-bearing weight. My read: this is mostly 'world changed' on the regulatory pathway and 'model wrong' on the residual-value assumption. But you adjudicate — not me.",
      ],
      ['2026-05-19T10:05:00Z', false, "If I do re-baseline, what is the process?", 'projection-review'],
      [
        '2026-05-19T10:05:14Z',
        true,
        "Three steps. (1) You record a re-baseline decision with a rationale referencing the convening review. (2) The new projection cone is created beside the old one — the original stays on the record, never deleted, never overwritten. (3) The dependent assumptions (fuel pathway, residual value glide) are explicitly tagged as 'priced into new baseline' so a future ageing event flags them against the new cone, not the old one. The dashboard then shows both cones for the rest of the vessel's life so future-you can always see where the bet originally was.",
      ],
      ['2026-05-19T10:06:00Z', false, "Defer the re-baseline; let's first run the red-team on the retrofit.", 'projection-review'],
      [
        '2026-05-19T10:06:08Z',
        true,
        "Right call — the retrofit decision changes the inputs to the projection in a way that makes a mid-flight re-baseline misleading. Holding the projection in 'review-requested' until the red-team adjudication is recorded. The other four vessels' projections are within band; nothing else needs attention.",
      ],
    ]),
  },

  // =====================================================================
  // Session 3 — Gate countdown + the deferred items
  // =====================================================================
  {
    sessionId: 'lhc33333-3333-4ccc-9ccc-cccccccccccc',
    timestamp: '2026-05-20T14:30:00Z',
    summary:
      "Walked the dry-dock countdown panel, surfaced the three deferred items parked at the Meridian 2027 gate, established the freeze-on-missed-packet rule.",
    turns: buildSession([
      ['2026-05-20T14:30:00Z', false, "What gates are within 18 months?", 'gates'],
      [
        '2026-05-20T14:30:12Z',
        true,
        "One: gate-meridian-drydock-2027, dueDate 2027-06-15, ~14 months out. Three deferred items parked at it: scrubber retrofit (deferred since 2018, urgent), ballast-water treatment (compliance item, due), fuel-system preparation (future-fuel readiness, planning). The yard slot is confirmed (Singapore). Out-of-cycle cost multiplier on the deferred work is ~3x — this is the cheap window.",
      ],
      ['2026-05-20T14:31:00Z', false, "What happens if we miss the next quarterly packet?", 'gates'],
      [
        '2026-05-20T14:31:12Z',
        true,
        "Per the no-silent-default rule, the three deferred items **freeze**. A frozen commitment cannot be silently rolled to the next quarter, cannot have its assumptions re-aged as if reviewed, and cannot be marked compliant on the dashboard. It can be unfrozen — explicitly, by a human, on the record, with a written rationale. The freeze is a forced pause; it is uncomfortable, and that is the point. A silent roll-forward is how a dry-dock window passes with stale assumptions unexamined.",
      ],
      ['2026-05-20T14:32:00Z', false, "Show me the gate countdown view.", 'gates'],
      [
        '2026-05-20T14:32:08Z',
        true,
        "Gate countdown:\n\n  Meridian (mid-2027)  : 14 months  ◆ live items: 3  ◆ packet status: open Q2 2026\n  Nordic Star (2028)   : 25 months  ◆ live items: 1  ◆ packet status: clear\n  Cape Pioneer (2028)  : 30 months  ◆ live items: 1  ◆ packet status: clear (open question on fuel-system)\n  Aurora (2029)        : 33 months  ◆ live items: 1  ◆ packet status: clear\n  Orion (2030)         : 51 months  ◆ live items: 0  ◆ packet status: clear\n\nOnly the Meridian is inside the 18-month rule's enforcement window. The Cape Pioneer fuel-system question is worth opening early — the choice between bringing the work forward to its own 2028 dry-dock vs deferring to 2033 should not be a default.",
      ],
      ['2026-05-20T14:33:00Z', false, "Open the Cape Pioneer fuel-system question.", 'gates'],
      [
        '2026-05-20T14:33:14Z',
        true,
        "Opened as an OpenQuestion: 'Should Cape Pioneer's fuel-system preparation be brought forward to the 2028 dry-dock?' Parked against gate-cape-pioneer-drydock-2028. It now appears on the next quarterly packet as a decision-to-be-taken, not as a deferred item — there is no prior commitment to age. Status: needs-evidence.",
      ],
      ['2026-05-20T14:34:00Z', false, "Last thing — can the agent re-decide any of this on its own?", 'gates'],
      [
        '2026-05-20T14:34:08Z',
        true,
        "No. The agent ages, flags, counts down, convenes, and freezes. It does not place the bet and it does not re-place it. The danger over a long horizon is autopilot — a fleet quietly running on assumptions set by people who have moved on, with no one consciously re-affirming them. The agent's job is to refuse that autopilot, not to substitute its own.",
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
