/**
 * Reference documents for documents/ (RAG-indexed). Background knowledge the
 * agent cites when explaining patterns and proposing norms — the rolling
 * channel transcripts are deliberately NOT indexed (edit churn).
 */

export interface RagDoc {
  filename: string;
  body: string;
}

export const RAG_DOCS: RagDoc[] = [
  {
    filename: 'hyperactive-hive-mind-primer.md',
    body: `# The Hyperactive Hive Mind — primer

Cal Newport's term (in "A World Without Email", 2021) for a workflow in which
a team coordinates through an ongoing, unstructured stream of messages —
e-mail, chat, ad-hoc pings — with every member expected to monitor and react
continuously.

## Why it emerges
It is the path of least resistance: no process to design, no tool to adopt,
every question gets an answer *eventually*. Each individual message is cheap;
the cost is systemic and therefore invisible in the moment.

## What it costs
- **Attention fragmentation.** Monitoring the stream forces context switches;
  knowledge work quality degrades disproportionately with each switch.
- **Collective activity without collective intelligence.** Everyone is busy
  responding; nobody has the uninterrupted time in which hard problems get
  solved.
- **Implicit obligations.** Response-time expectations are never agreed, so
  they default to "instantly" — set by the fastest responder.
- **Decision evaporation.** Decisions made mid-stream have no artifact; they
  get re-litigated or silently forgotten.

## The remedy shape
Not a new app. An **explicit, written team agreement**: how the team
communicates, when people are reachable, and how decisions get documented.
See team-agreement-playbook.md.`,
  },
  {
    filename: 'team-agreement-playbook.md',
    body: `# Team Agreement Playbook

A team agreement is a one-page, written, team-owned document. Typical
elements and the pattern each one targets:

| Element | Example | Targets |
|---|---|---|
| E-mail response norm | reply within 24 h | instant-response-pressure |
| Messenger response norm | reply within 4 h in core time | instant-response-pressure, after-hours |
| Deep-work block | 09:00–11:30, no meetings/pings | ping-storm, cascades |
| Office hours | 13:00–14:00 synchronous Q&A | interruption-cascade, ambiguous-ownership |
| Meeting-free day | Wednesdays | undocumented-decision, focus debt |
| Decision log rule | "not decided until written" | undocumented-decision, jargon-mismatch |
| Escalation path | phone call = genuinely urgent | keeps norms safe for real emergencies |

## Ground rules for introducing one
1. Base it on **observed evidence**, not vibes — people accept norms that
   address costs they have seen quantified.
2. Adopt norms **one or two at a time**; measure before adding more.
3. Norms protect people ("you are *allowed* to answer in 4 h"), they do not
   police them.
4. Review in retro after two weeks: keep, adjust, or drop — with data.`,
  },
  {
    filename: 'mit-sloan-2022-meeting-free-days-summary.md',
    body: `# MIT Sloan 2022 — The Surprising Impact of Meeting-Free Days (summary)

Laker, Pereira, et al., MIT Sloan Management Review, 2022. The researchers
surveyed **76 companies** that had introduced meeting-free days — from one
day per week up to complete meeting bans.

## Findings
Introducing even **one meeting-free day per week** improved:
- autonomy
- communication quality
- engagement
- satisfaction

while **micromanagement and stress declined** and **productivity rose**.
(Sweet spot in the study: around three meeting-free days; but the effect was
already clear at one.)

## The mechanism (the surprising part)
Productivity rose not *despite* reduced communication but **because of it**.
A reliably free day forced the team to:
- plan handovers more cleanly,
- make dependencies explicit ahead of time,
- document decisions faster instead of deferring them to the next meeting.

Fewer meetings **enforced better processes**. This is the empirical backbone
for evidence-based team agreements: constraints on ad-hoc coordination
produce structure, and the structure is what carries the productivity gain.`,
  },
  {
    filename: 'context-switching-costs.md',
    body: `# Context switching — why pings are not free

Key results the observer leans on when quantifying pattern costs:

- Resuming a demanding task after an interruption takes substantial
  reorientation time — commonly cited findings put the full recovery for
  complex work in the range of **10–25 minutes** per switch.
- Interrupted work is not only slower; error rates and stress markers rise
  (Mark et al., "The Cost of Interrupted Work: More Speed and Stress").
- Self-interruption is learned: heavily interrupted people start
  interrupting *themselves* at similar frequency — a reason ping-dense
  channels stay ping-dense even on quiet days.
- The *expectation* of interruption is itself a cost: monitoring lowers the
  quality of concurrent thought even when no message arrives.

## Rule of thumb used in reports
An interruption-cascade touching 3 people ≈ 3 × (switch + recovery) ≈
**45–75 minutes** of degraded or lost focus, on top of the visible chat time.`,
  },
  {
    filename: 'response-time-norms-guide.md',
    body: `# Response-time norms — design guide

A response-time norm converts an implicit "instantly" into an explicit,
humane ceiling. Designing one:

1. **Pick ceilings per medium.** Common: 24 h e-mail, 4 h messenger within
   core time. Outside core time the clock pauses.
2. **Pair with an escalation path.** "If it truly cannot wait: call." This is
   what makes the norm safe — urgency still has a channel, it just stops
   masquerading as chat.
3. **Protect the responder, not the asker.** The norm's purpose is that
   answering in 3 hours is *fine by agreement* — batching becomes legitimate.
4. **Measure**: median reply latency should drift *up toward* the ceiling for
   non-urgent traffic while re-pings ("any update??") disappear. Blockers
   must get *faster* (they now have the escalation path).

Anti-pattern to watch: the norm silently becoming a *target* ("everything
answered in exactly 4 h") — it is a ceiling, not an SLA.`,
  },
  {
    filename: 'deep-work-block-and-office-hours-guide.md',
    body: `# Deep-work block + office hours — design guide

These two elements work as a pair: the block removes interruptions from the
most valuable hours, office hours give the displaced questions a reliable
home.

## Deep-work block
- Shared, fixed, morning (e.g. 09:00–11:30) — shared matters: nobody is
  waiting on anyone during the block, so nobody feels obliged to monitor.
- Writing into channels is allowed; *expecting reads* is not.
- Calendar-blocked for the whole team; meetings physically cannot land there.

## Office hours
- Fixed window (e.g. 13:00–14:00), owned by a rotating host who triages.
- Questions that would have been @mention cascades queue up and get answered
  synchronously and fast — often in seconds each.
- The host owns "ambiguous ownership" asks: they either answer or assign.

## Success signals
Burst index inside the block → near zero; cascade depth outside office hours
→ ≤ 1; subjective: "I got a morning of real work" appears in retro notes.`,
  },
  {
    filename: 'decision-log-guide.md',
    body: `# Decision log rule — "not decided until it's written down"

The cheapest team-agreement element and the one with the longest memory.

## The rule
A decision thread is closed by a link: wiki page, ticket, or doc containing
(1) the decision, (2) the options considered, (3) who decided, (4) date.
Until the link exists, the decision does not exist.

## Why it works
- Kills re-litigation: "we discussed this" becomes "here is the record".
- Forces terminology precision (writing exposes ambiguity — see the AC/ACL
  incident in this project's transcripts).
- Makes chat searchable-by-outcome: the artifact is canonical, the thread is
  just history.
- Decouples deciders from the stream: someone who missed the thread reads
  one artifact instead of 40 messages.

## Practice
End the thread with: ✅ Decided → <link>. The observer counts decision
threads without such a link as undocumented-decision occurrences.`,
  },
  {
    filename: 'glossary-hive-alpha.md',
    body: `# Glossary — Hive Alpha terms

Team-specific terms the observer must not misread (and the team should stop
overloading):

- **AC** — ambiguous on this team: has meant *anti-corruption layer* (Tomas,
  architecture) and *acceptance criteria* (product/QA). Recommendation:
  write **ACL** for the layer, **acceptance criteria** in full.
- **the gateway split** — ongoing refactor separating the API gateway from
  the billing path.
- **sync fix** — Priya's token-refresh fix for the sync service (pilot
  blocker, see day −3 transcripts).
- **v2 auth flow** — client credentials + on-behalf-of tokens for
  service-to-service calls; decided in-thread on day −2 (undocumented).
- **pilot** — the first customer deployment, starts on the 15th.
- **bake time** — one calendar week a risky change must run on staging
  before the next risky change lands on top.
- **core time** — 08:00–18:00 UTC, Mon–Fri (used by all metrics).`,
  },
];
