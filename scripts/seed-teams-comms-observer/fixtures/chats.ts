/**
 * Two seeded chat sessions for the teams-comms-observer project.
 * Format mirrors workspace/<project>/.etienne/chat.history-*.jsonl:
 * one JSON object per line: { timestamp, isAgent, message, contextName? }.
 *
 * Timestamps are generated relative to the seed day (day −1 evening and
 * seed-day morning) by the seed script via buildSessions(baseDate).
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

import { shiftWorkdays } from './transcripts';

function at(base: Date, day: number, time: string): string {
  const d = shiftWorkdays(base, day);
  const [h, m] = time.split(':').map(Number);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

export function buildSessions(base: Date): ChatSession[] {
  return [
    {
      sessionId: 'a7c31e02-0001-4e0a-9b1a-c0mm500000001',
      timestamp: at(base, -1, '17:30'),
      summary:
        'Reviewed the first four observation days: identified the 26 h unanswered blocker as the costliest incident, the morning ping-storms as the most frequent pattern, and mapped both to the 4 h response norm and the deep-work block.',
      turns: [
        {
          timestamp: at(base, -1, '17:30'),
          isAgent: false,
          message: 'Where is our hive mind worst? Give me the top findings from the week so far.',
          contextName: 'hive-analysis',
        },
        {
          timestamp: at(base, -1, '17:30'),
          isAgent: true,
          message:
            'Three findings dominate the first four observation days (evidence: data/teams transcripts, metrics in reports/data/hive-metrics.json):\n\n' +
            '1. **Costliest single incident — unanswered blocker, #dev.** A blocker question ("does the gateway strip the Authorization header on retries?") waited **26 hours** for an answer (day −3 10:05 → day −2 12:15). Roughly one lost working day. A 4 h response norm with an escalation path would have surfaced it same-day.\n\n' +
            '2. **Most frequent pattern — morning ping-storms, #general.** Example: 7 fragmented messages in 4 minutes (day −4, 09:02–09:06) plus a re-ping at 09:20; two people context-switched immediately. The deep-work block targets exactly this window.\n\n' +
            '3. **Response pressure extends past 22:00.** The day −3 deploy exchange (22:10–22:36) got near-instant replies. Helpful in the moment — but it teaches the team that evenings are reachable, which keeps everyone monitoring.\n\n' +
            'The channel’s own mood agrees: Jonas asked for "something about the ping density in here" on day −2 (3 likes). Full report: out/hive-mind-report.md; norm proposals with evidence: out/team-agreement-draft.md.',
        },
        {
          timestamp: at(base, -1, '17:34'),
          isAgent: false,
          message: 'Is anyone particularly affected? Careful phrasing please, this might be read in the retro.',
          contextName: 'hive-analysis',
        },
        {
          timestamp: at(base, -1, '17:34'),
          isAgent: true,
          message:
            'Phrased for the retro (patterns, not character):\n\n' +
            '- **The fastest responder absorbs the most pressure.** One team member answers near-instantly at any hour — including 22:1x. That speed quietly sets the expectation for everyone else. The 4 h norm protects exactly this person: answering later becomes an agreement, not a personal failing.\n' +
            '- **Batch-responders create waiting costs without knowing it.** Questions addressed at someone who checks the channel twice a day wait invisibly — the 26 h blocker is the extreme case. A norm plus office hours makes the waiting predictable instead of open-ended.\n' +
            '- **Decision-makers lose their own decisions.** The auth-flow v2 decision (day −2) exists only in the thread. The decision log rule ("not decided until written down") fixes this without slowing anyone down.\n\n' +
            'All three formulations pass the read-aloud test; person-level detail with evidence stays in the wiki profiles.',
        },
      ],
    },
    {
      sessionId: 'b8d42f13-0002-4f1b-8c2b-c0mm500000002',
      timestamp: at(base, 0, '08:40'),
      summary:
        'Drafted the team agreement for the Friday retro: four norms with per-norm evidence and expected effect, grounded in the MIT Sloan meeting-free-day findings.',
      turns: [
        {
          timestamp: at(base, 0, '08:40'),
          isAgent: false,
          message: 'Draft the team agreement we should propose in the Friday retro. Keep it to one page and attach evidence per norm.',
          contextName: 'team-agreement',
        },
        {
          timestamp: at(base, 0, '08:40'),
          isAgent: true,
          message:
            'Draft written to **out/team-agreement-draft.md** (also on the Agreement Scoreboard). One-page summary:\n\n' +
            '1. **Messenger response norm: 4 h within core time (08–18).** Evidence: instant-response pressure in #general (re-ping after 13 min on day −4); after-hours exchange with 2-minute replies at 22:1x. Expected effect: batching becomes legitimate, evening monitoring stops. Escalation path: a phone call means "genuinely urgent".\n' +
            '2. **Deep-work block 09:00–11:30, shared.** Evidence: the day −4 ping-storm and the day −1 @mention cascade both landed before 09:30 — the team’s highest-focus window is currently its most interrupted. Writing allowed, reading not expected.\n' +
            '3. **Office hours 13:00–14:00.** Evidence: the day −1 cascade (3 people context-switched in 15 min) was a queue of questions that could have waited 4 hours and been answered synchronously in 5 minutes total.\n' +
            '4. **Decision log rule.** Evidence: the auth-flow v2 decision (day −2) has no artifact; the AC/ACL confusion cost a second round of clarification. Rule: a decision thread closes with a link, ✅ Decided → <link>.\n\n' +
            '**Deferred (needs local evidence): meeting-free Wednesday.** Research basis is strong — MIT Sloan 2022 (76 companies): one meeting-free day/week improved autonomy, communication, engagement and productivity, *because* forced asynchrony produced cleaner handovers and documented decisions. I propose measuring two weeks of norms 1–4 first, then trialing it.\n\n' +
            'Every claim links to its transcript evidence in the draft. Suggested retro flow: show the Pattern Radar for the "what", the draft for the "so what".',
        },
        {
          timestamp: at(base, 0, '08:47'),
          isAgent: false,
          message: 'Good. What will tell us in two weeks whether it works?',
          contextName: 'team-agreement',
        },
        {
          timestamp: at(base, 0, '08:47'),
          isAgent: true,
          message:
            'Five measurable signals, all on the Hive Pulse dashboard (targets = the norms themselves):\n\n' +
            '- **Median reply latency drifts up toward (not past) 4 h** for non-urgent traffic — and re-pings ("any update??") drop to zero.\n' +
            '- **Blockers get faster, not slower**: any question marked blocking answered same-day (the escalation path is working).\n' +
            '- **Burst index inside 09:00–11:30 → near zero** (deep-work block holds).\n' +
            '- **After-hours share < 5 %** and no after-hours exchange with sub-15-min replies.\n' +
            '- **Zero undocumented decisions**: every decision thread ends with an artifact link.\n\n' +
            'I will keep recording PatternOccurrences daily; the Agreement Scoreboard shows per-norm compliance and, for the deferred meeting-free day, the prevention potential from the knowledge graph. If a norm shows no effect after two weeks, the draft says so and we adjust rather than accumulate rules.',
        },
      ],
    },
  ];
}
