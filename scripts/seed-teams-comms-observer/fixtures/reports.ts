/**
 * Prewritten reports (out/, reports/) and the two hand-built dashboard data
 * exports (pattern-occurrences.json, agreement-norms.json).
 *
 * The third export, reports/data/hive-metrics.json, is NOT built here — the
 * seed runs the project's own hive-analytics compute-metrics script over the
 * seeded transcripts so dashboard numbers and agent numbers always agree.
 */

import { shiftWorkdays } from './transcripts';

function isoDay(base: Date, offset: number): string {
  return shiftWorkdays(base, offset).toISOString().slice(0, 10);
}

// Must mirror the id/time computation in transcripts.ts so evidence links
// point at the exact seeded messages.
function msgUrl(slug: string, base: Date, day: number, time: string): string {
  const d = shiftWorkdays(base, day);
  const [h, m] = time.split(':').map(Number);
  d.setUTCHours(h, m, 0, 0);
  return `https://teams.microsoft.com/l/message/19%3A${slug.replace(/[^a-z0-9]/g, '')}%40thread.tacv2/${d.getTime()}`;
}

// ─── out/hive-mind-report.md ────────────────────────────────────────────────

export function hiveMindReport(base: Date): string {
  return `# Hive-Mind Report — standing analysis

_Observation window: ${isoDay(base, -5)} … ${isoDay(base, -1)} · channels:
hive-alpha--general, hive-alpha--dev · metrics: reports/data/hive-metrics.json
(computed by hive-analytics) · rewritten by the nightly analysis._

## Verdict

Hive Alpha shows a **moderate hyperactive-hive-mind profile**: coordination
works — nothing falls through permanently — but it works through continuous
reaction. The three highest-cost findings:

### 1. Unanswered blocker cost ≈ one working day (severity 5)
A blocker question in #dev ("does the gateway strip the Authorization header
on retries?") waited **26 hours** ([${isoDay(base, -3)} 10:05](${msgUrl('hive-alpha--dev', base, -3, '10:05')})
→ ${isoDay(base, -2)} 12:15). The asker re-pinged once and lost most of a day.
No agreed response ceiling + no escalation path = open-ended waiting.
→ Remedy: **4 h response norm with escalation path** (would-prevent link in KG).

### 2. Morning ping-storms interrupt the best hours (severity 3)
[${isoDay(base, -4)} 09:02–09:06](${msgUrl('hive-alpha--general', base, -4, '09:02')}):
7 fragmented messages in 4 minutes, re-ping "any update??" after 13 minutes;
two people context-switched immediately. The pattern recurs in the
weekday×hour heatmap (Pattern Radar): message density peaks 09:00–10:00 —
exactly the deep-work window. → Remedy: **deep-work block 09:00–11:30**.

### 3. Response pressure extends past 22:00 (severity 3)
[${isoDay(base, -3)} 22:10–22:36](${msgUrl('hive-alpha--general', base, -3, '22:10')}):
deploy request and execution with 2-minute replies. Effective in the moment;
systemically it teaches the team that evenings are reachable. → Remedy: the
4 h core-time norm makes the pause after 18:00 explicit.

## Further occurrences (see Pattern Radar for the full list)
- **Undocumented decision** — auth-flow v2 decided in-thread
  ([${isoDay(base, -2)} 14:38](${msgUrl('hive-alpha--dev', base, -2, '14:38')})),
  no artifact. → decision log rule.
- **Jargon mismatch** — "AC" = anti-corruption layer vs acceptance criteria,
  second recurrence. → glossary + decision log rule.
- **Interruption cascade** — 3 people context-switched before 09:30
  ([${isoDay(base, -1)} 09:10–09:25](${msgUrl('hive-alpha--dev', base, -1, '09:10')})).
  → office hours.
- **Ambiguous ownership** — "can someone review the release notes?" produced
  zero replies for a day, then two duplicate reviews.

## Positive observations
- Thread discipline in #dev is good: questions and answers stay threaded.
- The team is self-aware: the "ping density" complaint (${isoDay(base, -2)},
  3 likes) is an open door for the team agreement.
- One documented decision exists as counter-example (release-branch cut,
  ${isoDay(base, -5)}) — the decision log rule has a local success story.

## Next analysis
Nightly cron continues; the Friday retro should decide on norms 1–4 in
\`out/team-agreement-draft.md\`.
`;
}

// ─── out/team-agreement-draft.md ────────────────────────────────────────────

export function teamAgreementDraft(base: Date): string {
  return `# Team Agreement — draft for the Friday retro (v0.2)

_A one-page working agreement for Hive Alpha. Every norm carries its evidence
(links → transcripts) and its expected, measurable effect. Maintained by the
Hive Communication Observer; adopted norms move to "adopted" with a date._

## 1. Messenger response norm — 4 h within core time *(proposed)*
Replies to non-urgent messages are due within **4 hours, 08:00–18:00 Mon–Fri**;
the clock pauses outside core time. **Escalation path: a phone call means
"cannot wait".**
- Evidence: 26 h unanswered blocker in #dev (${isoDay(base, -3)}); re-ping
  after 13 min in #general (${isoDay(base, -4)}); 22:1x instant replies
  (${isoDay(base, -3)}).
- Expected effect: batching becomes legitimate; blockers get *faster* via the
  escalation path; evening monitoring stops. Metric: median reply latency
  drifts toward the ceiling, re-pings → 0, blockers answered same-day.

## 2. Deep-work block — 09:00–11:30, shared *(proposed)*
No meetings, no expected reads. Writing into channels is fine.
- Evidence: ping-storm ${isoDay(base, -4)} 09:02; cascade ${isoDay(base, -1)}
  09:10 — the most interrupted window is the highest-focus window.
- Expected effect: burst index inside the block → near zero.

## 3. Office hours — 13:00–14:00 *(proposed)*
Rotating host; synchronous questions welcome and fast; host triages
"can someone…" asks.
- Evidence: the ${isoDay(base, -1)} cascade was a queue of questions that
  could have waited hours and been answered in minutes, together.
- Expected effect: cascade depth ≤ 1 outside office hours; no duplicate work
  from ambiguous ownership.

## 4. Decision log rule — "not decided until written down" *(proposed)*
Every decision thread closes with ✅ Decided → <link> (wiki/ticket/doc:
decision, options, who, date).
- Evidence: auth-flow v2 (${isoDay(base, -2)}) exists only in-thread; AC/ACL
  confusion cost a second clarification round.
- Expected effect: undocumented decisions → 0; terminology sharpens.

## Deferred: meeting-free Wednesday *(needs local evidence)*
Research basis is strong — MIT Sloan 2022 (Laker, Pereira et al., 76
companies): **one meeting-free day per week** improved autonomy,
communication, engagement, satisfaction and productivity while stress fell —
*because* forced asynchrony produced cleaner handovers, explicit dependencies
and documented decisions. Proposal: measure norms 1–4 for two weeks, then
trial the meeting-free day. Prevention potential is tracked on the Agreement
Scoreboard.

---
_Review cadence: retro every two weeks — keep / adjust / drop, with data from
the Hive Pulse dashboard. Norms protect people; they are ceilings and
windows, not SLAs and surveillance._
`;
}

// ─── reports/comms-insights-log.md ──────────────────────────────────────────

export function commsInsightsLog(base: Date): string {
  return `# Comms Insights Log — hive-alpha

_Append-only findings log of the nightly analysis. The marker below tells the
next run where to resume._

## ${isoDay(base, -1)} — first full analysis (days ${isoDay(base, -5)}…${isoDay(base, -1)})

- Computed baseline metrics (hive-analytics) → reports/data/hive-metrics.json.
- Recorded 6 PatternOccurrences in the knowledge graph (1× severity 5:
  unanswered blocker; 1× severity 4: undocumented decision; 3× severity 3;
  1× severity 2) with evidence links.
- Created person profiles for Anna, Jonas, Priya, Tomas (wiki/topics/).
- Drafted team agreement v0.2 with 4 proposed norms + 1 deferred
  (out/team-agreement-draft.md).
- Notable: the team itself raised ping density as a problem
  (${isoDay(base, -2)}, #general, 3 likes) — retro timing is good.

<!-- last-processed: ${isoDay(base, -1)} -->
`;
}

// ─── reports/data/pattern-occurrences.json ─────────────────────────────────

export function patternOccurrencesJson(base: Date): unknown {
  const po = (
    id: string, type: string, severity: number, channel: string, day: number,
    time: string, participants: string[], summary: string,
  ) => ({
    id,
    type,
    severity,
    channel,
    timestamp: (() => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + day);
      const [h, m] = time.split(':').map(Number);
      d.setUTCHours(h, m, 0, 0);
      return d.toISOString();
    })(),
    participants, // initials only — the dashboard stays read-aloud-safe
    summary,
    evidenceUrl: msgUrl(channel, base, day, time),
    wouldPrevent: PREVENTION_MAP[id] ?? [],
  });

  return {
    generatedAt: new Date(base).toISOString(),
    occurrences: [
      po('po-ping-storm-anna', 'ping-storm', 3, 'hive-alpha--general', -4, '09:02', ['AM', 'PN', 'JW'],
        '7 fragmented messages in 4 minutes plus a re-ping after 13 min; two immediate context switches.'),
      po('po-after-hours-anna-priya', 'after-hours-activity', 3, 'hive-alpha--general', -3, '22:10', ['AM', 'PN'],
        'Deploy request and execution 22:10–22:36 with 2-minute replies — evening response pressure.'),
      po('po-unanswered-blocker-priya', 'unanswered-blocker', 5, 'hive-alpha--dev', -3, '10:05', ['PN', 'JW'],
        'Explicit blocker waited 26 h for the answer; ≈ one lost working day.'),
      po('po-undocumented-decision-auth', 'undocumented-decision', 4, 'hive-alpha--dev', -2, '14:38', ['TE', 'JW', 'PN', 'AM'],
        'Auth-flow v2 decided mid-thread; no wiki/ticket/doc artifact exists.'),
      po('po-jargon-ac', 'jargon-mismatch', 2, 'hive-alpha--dev', -2, '15:05', ['TE', 'PN'],
        '"AC" read as acceptance criteria, meant as anti-corruption layer — second recurrence.'),
      po('po-cascade-tomas', 'interruption-cascade', 3, 'hive-alpha--dev', -1, '09:10', ['TE', 'JW', 'PN', 'AM'],
        'Sequential @mentions answered within minutes — three context switches before 09:30.'),
      po('po-ambiguous-relnotes', 'ambiguous-ownership', 2, 'hive-alpha--general', -4, '14:30', ['AM', 'JW', 'PN'],
        '"Can someone review…" got no reply for a day, then two duplicate reviews.'),
    ],
  };
}

const PREVENTION_MAP: Record<string, string[]> = {
  'po-ping-storm-anna': ['norm-deep-work-block', 'norm-response-4h'],
  'po-after-hours-anna-priya': ['norm-response-4h'],
  'po-unanswered-blocker-priya': ['norm-response-4h'],
  'po-undocumented-decision-auth': ['norm-decision-log'],
  'po-jargon-ac': ['norm-decision-log'],
  'po-cascade-tomas': ['norm-office-hours'],
  'po-ambiguous-relnotes': ['norm-office-hours'],
};

// ─── reports/data/agreement-norms.json ─────────────────────────────────────

export function agreementNormsJson(base: Date): unknown {
  return {
    generatedAt: new Date(base).toISOString(),
    norms: [
      {
        id: 'norm-response-4h',
        title: 'Messenger response norm — 4 h in core time',
        status: 'proposed',
        adoptionDate: null,
        compliance: { metric: 'share of replies within 4 core-time hours + zero re-pings', currentPct: 62, targetPct: 95 },
        wouldPrevent: 4,
        trend: [58, 60, 55, 64, 62],
        rationale: 'Removes the implicit "instantly"; blockers get an explicit escalation path instead of open-ended waiting.',
      },
      {
        id: 'norm-deep-work-block',
        title: 'Deep-work block 09:00–11:30 (shared)',
        status: 'proposed',
        adoptionDate: null,
        compliance: { metric: 'share of block-time minutes without expected-read pings', currentPct: 41, targetPct: 90 },
        wouldPrevent: 1,
        trend: [45, 38, 52, 35, 41],
        rationale: 'The most interrupted window is the highest-focus window; storms and cascades land before 09:30.',
      },
      {
        id: 'norm-office-hours',
        title: 'Office hours 13:00–14:00 (rotating host)',
        status: 'proposed',
        adoptionDate: null,
        compliance: { metric: 'cascade depth ≤ 1 outside office hours', currentPct: 55, targetPct: 95 },
        wouldPrevent: 2,
        trend: [70, 65, 60, 58, 55],
        rationale: 'Concentrates genuinely synchronous questions; the host owns "can someone…" triage.',
      },
      {
        id: 'norm-decision-log',
        title: 'Decision log rule — not decided until written down',
        status: 'proposed',
        adoptionDate: null,
        compliance: { metric: 'decision threads closed with an artifact link', currentPct: 50, targetPct: 100 },
        wouldPrevent: 2,
        rationale: '1 of 2 observed decisions documented; the undocumented one is load-bearing (auth flow).',
        trend: [100, 100, 100, 50, 50],
      },
      {
        id: 'norm-meeting-free-day',
        title: 'Meeting-free Wednesday',
        status: 'deferred',
        adoptionDate: null,
        compliance: { metric: 'MIT Sloan 2022: autonomy/engagement/productivity up, stress down', currentPct: 0, targetPct: 100 },
        wouldPrevent: 0,
        trend: [0, 0, 0, 0, 0],
        rationale: 'Strong research basis (76-company study); trial after two measured weeks of norms 1–4.',
      },
    ],
  };
}
