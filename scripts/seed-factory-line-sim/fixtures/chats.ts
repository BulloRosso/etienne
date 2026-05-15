/**
 * 3 seeded chat sessions for factory-line-sim. Each is a short, on-topic
 * troubleshooting session that traces a concrete defect spike to a root
 * cause from the wiki — these become the evidence base from which the
 * dreaming pipeline can later distill an operations strategy card.
 *
 * Sessions:
 *   1. Coolant → surface defects on PO-1003 (TODAY-2 / TODAY-1)
 *   2. Chip-jam → dimensional + edge defects on PO-1005 (TODAY-4 / TODAY-3)
 *   3. PO-1004 running long today — diagnose where the time is going
 *
 * No corrective user turns: the agent gets the answer right first try in
 * each session, so dreaming/segment.ts scores them as 'success'.
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

function buildSession(rows: Array<[string, boolean, string, string?]>): ChatTurn[] {
  return rows.map(([timestamp, isAgent, message, contextName]) => {
    const t: ChatTurn = { timestamp, isAgent, message };
    if (contextName) t.contextName = contextName;
    return t;
  });
}

export const SESSIONS: ChatSession[] = [
  // ====================================================================
  // Session 1 — Coolant degradation root cause
  // ====================================================================
  {
    sessionId: 'a01f9e30-1111-4aaa-9aaa-aaaaaaaaaaaa',
    timestamp: '2026-05-14T08:30:00Z',
    summary:
      'Traced PO-1003 surface-finish defect spike to coolant degradation on the prior afternoon. Established the pattern: coolant_temp_high MQTT events + degraded status block + same-day or next-day surface_finish/staining defects. Concluded the line should have an unscheduled coolant test trigger at 65°C rather than waiting for the 120-hour cycle.',
    turns: buildSession([
      [
        '2026-05-14T08:30:00Z',
        false,
        "What was the worst day for quality this week and why?",
        'quality-review',
      ],
      [
        '2026-05-14T08:30:35Z',
        true,
        "Looking at the last 7 days of QA-INSP reports: yesterday (2026-05-14) PO-1003 had 6 surface_finish defects (Ra > 1.6 µm) and 3 surface_staining defects in the post-coolant batch (items 29-37 of the 80-item PO-1003 inspection), which is the largest single-PO defect cluster of the week. The originating machining ran on 2026-05-13 on CNC-5AX. Pulling the status JSON for that day — CNC-5AX shows a 'degraded' block from 12:45–15:45 with reason 'coolant_quality_degraded'. So the chain is: coolant degraded mid-afternoon Tue → parts machined in that window had marginal surface finish → surfaced at QA-INSP on Wed.",
      ],
      [
        '2026-05-14T08:31:50Z',
        false,
        "Any MQTT events that day that line up?",
        'quality-review',
      ],
      [
        '2026-05-14T08:32:05Z',
        true,
        "Yes — three coolant_temp_high events on cnc-5ax/telemetry: 13:08 (67.2 °C), 14:12 (69.0 °C), 15:30 (66.3 °C). The degraded status block starts at 12:45, so the events are concurrent. Per the coolant spec sheet (sources/coolant-spec-sheet.md), 65 °C is the threshold where surface-finish quality starts degrading measurably. The 13:08 event was the first crossing.",
      ],
      [
        '2026-05-14T08:32:50Z',
        false,
        "Was the coolant due for a change anyway?",
        'quality-review',
      ],
      [
        '2026-05-14T08:33:10Z',
        true,
        "The status JSONs show coolant_changed: false on every day this week. Service life per spec is 120 operating hours; from the past week's status timelines I count ~38 hours of running on CNC-5AX. So the sump was at roughly day 5–6 of the change cycle, not overdue per policy. The trigger here was thermal, not contamination — possible contributors: PO-1003 used Al-7075 Lot B (material-cert-al-7075-lot-B.md), which has hardness right at the spec ceiling and is documented to elevate spindle load ~8 % vs Lot A. More cutting energy → more sump heating.",
      ],
      [
        '2026-05-14T08:34:00Z',
        false,
        "So what's the takeaway?",
        'quality-review',
      ],
      [
        '2026-05-14T08:34:25Z',
        true,
        "Two patterns worth noting (no fix proposed, just signal):\n\n1. coolant_temp_high crossing 65 °C is a strong leading indicator for surface-finish defects on the *next* QA-INSP run of those parts. A targeted coolant check at the first 65 °C event — rather than waiting for the calendar-based 120-hour change — would have caught this 2–3 hours earlier.\n\n2. Hardness-margin material lots (Lot B) should be flagged in the production order so the operator knows to watch coolant temp more closely. The lot info is in the material cert but not propagated to the order JSON.\n\nRoot cause for PO-1003: coolant_quality_degraded driven by elevated coolant temperature, cause unknown but possibly aggravated by Lot B hardness.",
      ],
    ]),
  },

  // ====================================================================
  // Session 2 — Chip-jam → dimensional + edge defects
  // ====================================================================
  {
    sessionId: 'b02f9e30-2222-4bbb-9bbb-bbbbbbbbbbbb',
    timestamp: '2026-05-12T09:45:00Z',
    summary:
      'Traced PO-1005 dimensional + edge defect cluster to a chip-evacuation jam two days earlier. Established the chip-jam → tool damage → next-day dimensional/edge defect chain. The end-of-day tool change with note "chip damage" was the corroborating evidence.',
    turns: buildSession([
      [
        '2026-05-12T09:45:00Z',
        false,
        "PO-1005 has 6 scrap parts, can you tell me what happened?",
        'order-review',
      ],
      [
        '2026-05-12T09:45:18Z',
        true,
        "Looking at PO-1005 quality reports: 4 dimensional defects (length tolerance, all biased short of spec) and 2 edge defects (chipped flanges) — all 6 are clustered in the second-day inspection batch, items 19–24 of 40. Inspector notes mention 'chatter' and 'chipped flange'. Pulling the status JSON for the machining day (2026-05-11): CNC-5AX shows an error block 09:50–10:15 with reason 'chip_evacuation_jam'.",
      ],
      [
        '2026-05-12T09:46:05Z',
        false,
        "What were the MQTT events around the jam?",
        'order-review',
      ],
      [
        '2026-05-12T09:46:18Z',
        true,
        "On cnc-5ax/chip-evacuation that morning: bin_full at 09:48 (fill_pct 100), conveyor_jam_detected at 09:50 (jam_location: chip_bin), then a spindle_load_warn at 09:51 with load_pct 96 on T07. So the bin filled, the conveyor torque-tripped trying to push more chips, and the cutting tool was loaded with chips for the last few seconds before the operator stopped it.",
      ],
      [
        '2026-05-12T09:47:00Z',
        false,
        "Was a tool changed because of this?",
        'order-review',
      ],
      [
        '2026-05-12T09:47:15Z',
        true,
        "Yes — the same status JSON has tool_changes: 2 (vs 1 on a normal day) and the second change at 16:30 has the note 'T07 swap; flagged for chip damage during morning jam'. So the operator caught it: tool inspected, damage confirmed, swapped at end of day. But the parts cut between the jam at 09:50 and that EOD swap had a damaged tool — that's where the dimensional chatter and chipped-flange edges came from. The 4 dimensional + 2 edge defects we see at QA-INSP are exactly those parts.",
      ],
      [
        '2026-05-12T09:48:05Z',
        false,
        "So a clean signal end to end?",
        'order-review',
      ],
      [
        '2026-05-12T09:48:20Z',
        true,
        "Yes — chip-evacuation root cause (root-cause-chip-evacuation.md) maps cleanly: bin_full + conveyor_jam_detected → chip-jam status block → tool damage → next-day dimensional + edge defects. Six rejects, all attributable. The operator manual already says 'inspect every tool used since the jam for visible chip damage' (operator-manual-cnc-5ax.md). They did, but only at EOD — earlier inspection might have saved 4 of the 6 parts.",
      ],
    ]),
  },

  // ====================================================================
  // Session 3 — PO-1004 cycle time
  // ====================================================================
  {
    sessionId: 'c03f9e30-3333-4ccc-9ccc-cccccccccccc',
    timestamp: '2026-05-15T10:30:00Z',
    summary:
      'PO-1004 is running today; checked progress vs. estimate and confirmed the bottleneck is upstream input from CNC-5AX, not a new issue. No anomalies in MQTT or status. Recommended just monitoring; flagged that DEBURR-HAND has been idle most of the morning.',
    turns: buildSession([
      [
        '2026-05-15T10:30:00Z',
        false,
        "How is PO-1004 tracking against estimate?",
        'order-review',
      ],
      [
        '2026-05-15T10:30:18Z',
        true,
        "PO-1004 is 22 of 60 units complete. Routing is CNC-5AX (12 min/unit) → DEBURR-HAND (5 min) → QA-INSP (2 min). At 22 units done in ~2.5 hours of CNC time today (08:00 → 10:30), the per-unit cycle is ~6.8 min — well under the 12 min estimate, which is normal because the estimate includes setup-amortised headroom. The order is on track.",
      ],
      [
        '2026-05-15T10:31:00Z',
        false,
        "Anything weird in the events?",
        'order-review',
      ],
      [
        '2026-05-15T10:31:15Z',
        true,
        "Today's MQTT log (cnc-5ax topics) shows only routine spindle_load_warn events at the usual hourly cadence; load_pcts in the 78–86 range, all under the 90 threshold. No coolant, no chip-evacuation, no fixture events. CNC-5AX status JSON for today has only running and one short operator_break — no degraded or error blocks.",
      ],
      [
        '2026-05-15T10:32:00Z',
        false,
        "And DEBURR?",
        'order-review',
      ],
      [
        '2026-05-15T10:32:15Z',
        true,
        "DEBURR-HAND has been idle since the shift started — its status JSON shows 'no_input_parts' from 08:00 with a note 'Waiting on CNC-5AX output for PO-1004'. That's expected: PO-1004 just started this morning, so the first units are still upstream. Once CNC finishes the first batch (probably around 12:00 based on current pace), DEBURR will fill its buffer. No action needed — this is just normal line warm-up rhythm.",
      ],
    ]),
  },
];
