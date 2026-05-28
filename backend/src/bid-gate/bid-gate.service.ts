/**
 * Bid / no-bid gate — aggregates the coverage matrix into a single
 * Go / Caution / No-Go verdict the team sees *before* drafting effort
 * is spent. Pure function over the coverage payload; no DB, no I/O.
 *
 * Rules (priority order — first match wins for `no-go`; everything
 * triggered shows up in `reasons`):
 *
 *   no-go
 *     - ANY row flagged `isKnockout` is in `open`, `drafted`, or
 *       `deviation`. A knockout-non-compliant clause kills the bid;
 *       the team's time is better spent on the next opportunity.
 *     - More than 0 mandatory rows still non-compliant past the
 *       `g3_commit_gate.dueDate` (the contractual submission cut-off).
 *
 *   caution
 *     - Weighted coverage < 60 % past `g2_engineering_review.dueDate`
 *       (we've crossed the engineering-review milestone but the
 *       weight-adjusted coverage hasn't moved enough).
 *     - More than 10 % of mandatory rows lack a planned-response wiki
 *       page (the slug is set but plannedResponseExists is false).
 *
 *   go
 *     - none of the above fire
 *
 * Every triggered rule is appended to `reasons` so the cockpit's
 * "Why?" disclosure shows the bid manager what to act on. Empty
 * `reasons` is the success signal.
 */

export type BidGateRecommendation = 'go' | 'caution' | 'no-go';

export interface BidGate {
  totalMandatoryRows: number;
  mandatoryNonCompliant: number;
  knockoutFlagged: number;
  knockoutNonCompliant: number;
  weightedCoveragePct: number;
  recommendation: BidGateRecommendation;
  reasons: string[];
  computedAt: string;
}

interface ComputeBidGateInput {
  rows: any[];
  gates?: Record<string, any>;
  now?: Date;
}

const COMMITTED_LIKE = new Set(['committed', 'deviation', 'clarify']);
const NON_COMPLIANT_KNOCKOUT_STATES = new Set(['open', 'drafted', 'deviation']);

/**
 * Snapshot the bid-gate verdict from the current coverage payload.
 *
 * `now` is injectable so tests / the cockpit can rewind to model "what
 * does the gate say on the submission date if we don't ship anything
 * else?". Defaults to wall-clock time.
 */
export function computeBidGate(input: ComputeBidGateInput): BidGate {
  const { rows, gates } = input;
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  // --- Mandatory + knockout counts -------------------------------------
  const mandatoryRows = rows.filter((r) => r?.priorityClass === 'mandatory');
  const mandatoryNonCompliant = mandatoryRows.filter(
    (r) => !COMMITTED_LIKE.has(r?.state),
  ).length;
  const knockoutRows = rows.filter((r) => r?.isKnockout === true);
  const knockoutNonCompliant = knockoutRows.filter((r) =>
    NON_COMPLIANT_KNOCKOUT_STATES.has(r?.state),
  ).length;

  // --- Weighted coverage % ---------------------------------------------
  // Only rows that carry a numeric weight contribute. When no rows are
  // weighted yet (legacy projects, pre-Phase-2 data) we report 0 % but
  // do NOT fire a caution rule on it — the gate stays silent when it
  // has nothing to say.
  const weightedRows = rows.filter((r) => typeof r?.weightPoints === 'number');
  const weightTotal = weightedRows.reduce(
    (acc, r) => acc + (r.weightPoints as number),
    0,
  );
  const weightCommitted = weightedRows
    .filter((r) => COMMITTED_LIKE.has(r.state))
    .reduce((acc, r) => acc + (r.weightPoints as number), 0);
  const weightedCoveragePct =
    weightTotal === 0 ? 0 : Math.round((weightCommitted / weightTotal) * 100);

  // --- Gate deadlines ---------------------------------------------------
  const g2Due = parseGateDate(gates?.g2_engineering_review?.dueDate);
  const g3Due = parseGateDate(gates?.g3_commit_gate?.dueDate);

  // --- Rule evaluation --------------------------------------------------
  // no-go: knockouts
  if (knockoutNonCompliant > 0) {
    const ids = knockoutRows
      .filter((r) => NON_COMPLIANT_KNOCKOUT_STATES.has(r?.state))
      .map((r) => r.requirementId)
      .slice(0, 5);
    reasons.push(
      `${knockoutNonCompliant} knockout requirement(s) non-compliant: ${ids.join(', ')}${
        knockoutNonCompliant > ids.length ? ', …' : ''
      }`,
    );
  }
  // no-go: mandatory past g3
  let pastG3 = false;
  if (g3Due && now > g3Due && mandatoryNonCompliant > 0) {
    pastG3 = true;
    reasons.push(
      `${mandatoryNonCompliant} mandatory requirement(s) non-compliant past commit gate (${gates?.g3_commit_gate?.dueDate}).`,
    );
  }

  // caution: weighted coverage below threshold past g2
  let cautionWeighted = false;
  if (
    g2Due &&
    now > g2Due &&
    weightTotal > 0 &&
    weightedCoveragePct < 60
  ) {
    cautionWeighted = true;
    reasons.push(
      `Weighted coverage ${weightedCoveragePct} % is below 60 % past engineering review (${gates?.g2_engineering_review?.dueDate}).`,
    );
  }

  // caution: mandatory rows missing planned-response pages
  if (mandatoryRows.length > 0) {
    const missingPlannedResponse = mandatoryRows.filter(
      (r) =>
        !r?.plannedResponseSlug || r?.plannedResponseExists === false,
    ).length;
    const missingPct = (missingPlannedResponse / mandatoryRows.length) * 100;
    if (missingPct > 10) {
      reasons.push(
        `${missingPlannedResponse} of ${mandatoryRows.length} mandatory rows (${Math.round(missingPct)} %) have no planned-response page yet.`,
      );
    }
  }

  // --- Verdict ----------------------------------------------------------
  let recommendation: BidGateRecommendation = 'go';
  if (knockoutNonCompliant > 0 || pastG3) {
    recommendation = 'no-go';
  } else if (reasons.length > 0) {
    recommendation = 'caution';
  }
  // When the verdict is 'go' we still want a single positive line in
  // the cockpit's Why drawer so it doesn't look empty.
  if (recommendation === 'go' && reasons.length === 0) {
    reasons.push(
      `All gates clear: ${mandatoryRows.length} mandatory rows, ${knockoutRows.length} knockouts, weighted coverage ${weightedCoveragePct} %.`,
    );
  }

  return {
    totalMandatoryRows: mandatoryRows.length,
    mandatoryNonCompliant,
    knockoutFlagged: knockoutRows.length,
    knockoutNonCompliant,
    weightedCoveragePct,
    recommendation,
    reasons,
    computedAt: now.toISOString(),
  };
}

// Gate dueDate is hand-authored prose — keep parsing tolerant: accept
// ISO date and ignore everything else (no surprise NaN propagation).
function parseGateDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
