/**
 * Mission brief and wiki/_meta/mission.md content for the
 * `long-horizon-commitments` seed project.
 *
 * Used by:
 *   - POST /api/projects/create (missionBrief body field — short version)
 *   - wiki/_meta/mission.md (long form — every wiki write inherits relevance from this)
 */

export const PROJECT_NAME = 'tanker-long-horizon';

export const MISSION_BRIEF =
  'Run a 5-vessel midsize crude tanker fleet that stays compliant and ' +
  'charter-ready through 2035 under EU ETS, FuelEU Maritime and the IMO ' +
  '2027 net-zero framework. Keep every multi-year bet honest: age the ' +
  'assumptions, flag the ones that have expired, count down to immovable ' +
  'gates (dry-dock, special survey), and bring deferred decisions back to ' +
  'a human while acting is still cheap.';

export const MISSION_MD = `# Mission — Long-Horizon Commitments

## Goal
Run a **5-vessel midsize crude tanker fleet** (Meridian, Aurora, Nordic Star,
Cape Pioneer, Orion) so that every vessel stays **compliant and charter-ready
through 2035** under the regulatory regime that arrived after the original
fleet decisions were taken: EU ETS (full coverage 2026), FuelEU Maritime
(2025+), and the IMO 2027 net-zero framework.

## What the agent is for
A tanker is a 20-to-25-year asset. Every major fleet decision is a long-dated
bet on assumptions — fuel spreads, charter rates, residual value, regulatory
pathway, remaining useful life of the hull — and the bet is almost always
made by people who will have rotated to another role before it matures. The
agent's job is to keep those bets honest:

1. **Age every assumption** behind every commitment (fresh → ageing → expired).
2. **Flag what has expired** at the next quarterly review, with provenance.
3. **Count down to immovable gates** — dry-dock, special survey, charter
   expiry — and force a re-decision of every deferred item *before* the
   window closes (out-of-cycle the same work costs multiples).
4. **Track projection vs. reality** — when actuals leave the original
   uncertainty cone, surface a review.
5. **Score drift against the fleet strategy** vessel-by-vessel.
6. **Assemble a packet per review cadence**, with **no silent default**:
   if it is not actioned by the gate it belongs to, the affected
   commitments freeze.

## Scope
- The five vessels above and the commitments attached to each (charter,
  retrofit, financing, compliance pathway).
- The assumptions underpinning every commitment >€1M.
- The scheduled gates (dry-docks, special surveys) over the next 36 months.

## Out of scope
- Speculative trading bets (cargo selection, route arbitrage).
- Orderbook / newbuild decisions.
- Day-to-day chartering operations.

## Hard rules — non-negotiable
- **The agent never re-baselines a projection.** Only a human re-baselines,
  on the record. The original projection stays beside the new one.
- **The agent never marks an expired assumption fresh.** Ageing is monotonic
  without an explicit human re-decision.
- **The agent never lets a packet roll forward un-actioned.** Past its gate,
  the affected commitments freeze rather than continue silently.
- **The agent never decides irreversible calls.** It surfaces case-for and
  case-against; a human adjudicates, on the record.

## Acceptance criteria
- ≤1 vessel off-strategy at any time.
- Zero un-actioned quarterly packets past their gate.
- Every re-baseline preserves the prior projection on the record.
- Every irreversible decision in the project history has a paired red-team
  workflow artefact.

## Provenance
Mission set 2026-05-24 by the project owner, drawing on the *Meridian* case
described in Part 4 of *Agents that help humans decide*. Update only with
an explicit mission-change decision recorded in the changelog.
`;
