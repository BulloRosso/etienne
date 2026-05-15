/**
 * Mission brief and wiki/_meta/mission.md content for the
 * `factory-line-sim` seed project.
 *
 * Used by:
 *   - POST /api/projects/create (missionBrief body field — short version)
 *   - wiki/_meta/mission.md (long form — every wiki write inherits relevance from this)
 */

export const PROJECT_NAME = 'factory-line-sim';

/**
 * Anchor "today" for the seeded data. The 8 days of status / quality /
 * production data are laid out as TODAY-7 .. TODAY. Quality incidents are
 * seeded on TODAY-4 (chip-jam) and TODAY-2 (coolant degradation).
 *
 * Hardcoded so the dashboard, chat sessions, and quality reports all line
 * up regardless of when the seed script is run.
 */
export const TODAY = '2026-05-15';

export const MISSION_BRIEF =
  'Daily quality insights for a 3-machine discrete manufacturing line ' +
  '(CNC mill → manual deburring → automated 3D vision inspection). ' +
  'Combine inspector quality reports (xlsx), per-machine daily status ' +
  'reports (json), production orders (json) and a streaming MQTT event ' +
  'feed to surface root causes for bad quality and long order processing ' +
  'times — for today and the past few days only. Do not propose fixes.';

export const MISSION_MD = `# Mission — Factory Line Quality Insights

## Goal
Provide **daily quality insights for a 3-machine discrete manufacturing line**
producing precision aluminium and steel parts. The skill should answer
operator questions like "what hurt quality yesterday?" or "why is PO-1003
running long?" by combining four data sources, scoping to **today and the
past 7 days**.

## The line
Three machines in series, one production order at a time on each:

1. **CNC-5AX** — 5-axis CNC mill. Cuts the part from raw stock. Needs
   coolant; generates chips that drop onto a conveyor into a trash bin
   that must be emptied manually.
2. **DEBURR-HAND** — manual deburring station. Operator removes burrs and
   sharp edges left by milling. Manually paced — bottleneck risk.
3. **QA-INSP** — automated 3D vision inspection. Measures critical
   dimensions and surface finish, marks each part pass/fail with defect codes.

## Data sources (all live under the project root)
| Source | Location | Notes |
|---|---|---|
| Quality reports | \`quality-reports/*.xlsx\` | Inspector-uploaded. One file per production order per day. Schema in [data-quality-reports-xlsx](../topics/data-quality-reports-xlsx.md). |
| Machine status | \`status/status_<MACHINE>_<YYYY-MM-DD>.json\` | One file per machine per day. Can be re-uploaded; later upload merges into existing. |
| Production orders | \`production-orders/PO-*.json\` | Routing across the 3 machines, target quantity, due date. |
| MQTT events | live, via \`/api/external-events/factory-line-sim/messages/<topic>\` | Streaming alarms, consumables low, jams, coolant temp, bin-full, fixture warnings. Simulator under \`event-simulator/\`. |

## What "useful insight" means here
- Identify the **worst quality day this week** and the **most likely root
  cause** from the wiki's root-cause catalogue, citing concrete report rows
  and status timeline entries.
- Spot **production orders running over their estimated cycle time** and
  flag the machine where the delay accumulates.
- Correlate **MQTT events** with **quality drops** in the same time window.

## Out of scope
- Proposing fixes ("change the coolant", "recalibrate vision"). Surface the
  signal and the evidence; the user decides the action.
- Hindsight reports older than 7 days.
- Per-part dimensional drift modelling (sub-micron analysis).
- Optimising routing or scheduling.

## Provenance
Mission set ${TODAY} by the project owner. Update only with an explicit
mission-change decision recorded in the changelog.
`;
