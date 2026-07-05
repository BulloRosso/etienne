/**
 * Wiki pages for the Teams Communication Observer: the hive-mind pattern
 * taxonomy, team-agreement playbook, research basis, methodology, privacy
 * guardrails, person profiles, and channel pages.
 */

export interface WikiPageDraft {
  title: string;
  slug: string;
  bucket: 'topics' | 'sources' | 'queries';
  status: 'stub' | 'draft' | 'stable';
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  mission_relevance: number;
  body: string;
  classification?: 'public' | 'private' | 'secret';
}

export const WIKI_PAGES: WikiPageDraft[] = [
  {
    title: 'Hive-Mind Pattern Taxonomy',
    slug: 'hive-mind-pattern-taxonomy',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['taxonomy', 'hive-mind', 'core'],
    mission_relevance: 1.0,
    body: `The detectable patterns of Hyperactive-Hive-Mind communication. Every
recorded \`PatternOccurrence\` in the knowledge graph carries one of these
types. Each pattern is operationalized against transcript data so the
hive-analytics script (or a careful read) can detect it.

## instant-response-pressure
Median reply latency per person/channel far below healthy norms; escalating
re-pings ("??", "any update?") when replies take longer than a few minutes.
Signal: median reply latency < 10 min sustained across days; re-ping messages.

## ping-storm (fragmentation)
Bursts of many short messages instead of one consolidated ask. Signal: burst
index — share of messages sent < 2 min after the sender's own previous message.

## unanswered-blocker
A direct question — especially one that blocks work — with no reply within the
norm window, or lost in thread noise. Signal: root message ending in '?' with
"blocked"/"waiting" language and reply latency > 4 core-time hours.

## undocumented-decision
A decision made mid-chat and never recorded — no wiki/doc/ticket reference in
or after the thread. Signal: decision language ("let's go with", "we'll switch
to", "agreed") with no artifact link within the thread or the following day.

## after-hours-activity
Messages and — worse — response *expectations* outside core hours (08:00–18:00)
or on weekends. Signal: after-hours share of messages; after-hours exchanges
with < 15 min reply latency.

## interruption-cascade
An @mention chain where one ping triggers immediate context switches across
several people. Signal: chains of @mention messages across ≥ 3 people within
15 minutes, each replied to near-instantly.

## ambiguous-ownership
An ask addressed to everyone and therefore no one ("can someone look at…").
Signal: un-@-mentioned group asks with no reply or duplicate replies.

## jargon-mismatch
Two people using the same term with different meanings, discovered messages
later. Signal: definition corrections ("by X I meant…", "no, X means…").

## tone-escalation
Frustration accumulating across a thread (caps, "again", "as I already said").
Signal: escalating markers within one thread.

## missing-agreement-norm (meta-pattern)
Recurring instances of the above traced to the *absence* of an explicit
team-agreement element. Link occurrences to the norm that would prevent them
via the \`wouldPrevent\` relationship — see [[team-agreement-elements]].`,
  },
  {
    title: 'Team Agreement Elements',
    slug: 'team-agreement-elements',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['remedy', 'team-agreement', 'core'],
    mission_relevance: 1.0,
    body: `The classic antidote to the hyperactive hive mind is not another app —
it is a short, **written team agreement** on how the team communicates. The
observer's job is to propose and refine these norms with evidence
(see [[research-basis]] and the living draft in \`out/team-agreement-draft.md\`).

## Response-time norms
Agreed maximum reply latencies that remove the implicit "instant" expectation:
e.g. **24 h for e-mail**, **4 h for messenger within core time**. Directly
targets instant-response-pressure and rescues deep work; urgent items get an
explicit escalation path instead of re-pings.

## Morning deep-work block
A shared window (e.g. 09:00–11:30) with no meetings and no pings. Messages may
be *written* but nobody is expected to read them. Targets ping-storms and
interruption-cascades at the time of day with the highest focus value.

## Office hours
Fixed daily/weekly windows where synchronous questions are welcome and fast.
Concentrates the interruptions that genuinely need synchrony, so the rest of
the day stays quiet. Targets interruption-cascade and ambiguous-ownership
(the office-hours host owns triage).

## Meeting-free day
One weekday without meetings (see the MIT Sloan 2022 findings in
[[research-basis]]): improves autonomy, communication quality, engagement and
productivity — because the team must plan handovers, make dependencies
explicit, and document decisions in advance. Targets undocumented-decision
and after-hours spillover.

## Decision log rule
"A decision isn't made until it's written down" — every decision thread ends
with a link to the artifact (wiki/ticket/doc). Directly targets
undocumented-decision and jargon-mismatch.`,
  },
  {
    title: 'Research Basis',
    slug: 'research-basis',
    bucket: 'sources',
    status: 'stable',
    confidence: 'high',
    tags: ['research', 'newport', 'mit-sloan'],
    mission_relevance: 0.9,
    body: `## Cal Newport — the Hyperactive Hive Mind
Newport ("A World Without Email", 2021) names the workflow in which a team
without explicit collaboration processes coordinates through a constant,
unstructured stream of messages — everyone reacting to everyone, permanently.
It produces collective activity but not collective intelligence: everybody is
busy, nobody gets concentrated work. The remedy is not a new tool but explicit
workflow agreements that take coordination *out* of the ad-hoc stream.

## MIT Sloan Management Review 2022 — meeting-free days
Laker, Pereira et al. surveyed **76 companies** that introduced meeting-free
days (from one day per week up to complete bans). Findings: already **one
meeting-free day per week** improved autonomy, communication, engagement and
satisfaction, while micromanagement and stress fell and productivity rose.

The key mechanism: productivity rose not *despite* less communication but
**because of it** — a reliably free day forced cleaner handovers, explicit
dependencies, and faster documented decisions. Fewer meetings enforced better
processes.

## Implication for this project
Both sources justify the norm proposals in [[team-agreement-elements]]. When
the observer proposes a norm it should quote the observed pattern occurrences
(evidence) *and* this research basis (mechanism).`,
  },
  {
    title: 'Analysis Methodology',
    slug: 'analysis-methodology',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['methodology', 'core'],
    mission_relevance: 1.0,
    body: `The nightly analysis (and any on-demand analysis) follows this loop:

1. **Scope** — read \`reports/comms-insights-log.md\` and its
   \`<!-- last-processed: YYYY-MM-DD -->\` marker; only transcripts newer than
   the marker are in scope.
2. **Measure** — run the hive-analytics script:
   \`npx tsx .claude/skills/hive-analytics/scripts/compute-metrics.ts\`.
   It writes \`data/metrics/<date>.json\` and refreshes
   \`reports/data/hive-metrics.json\`. Metrics come from the script only.
3. **Classify** — scan the new transcript days for occurrences of the
   [[hive-mind-pattern-taxonomy]] patterns. For each: create a
   \`PatternOccurrence\` entity in the knowledge graph (type, severity 1–5,
   channel, date) with \`evidencedBy\` → message webUrl, \`exhibits\` ←
   the involved Person entities, and \`wouldPrevent\` ← the AgreementNorm
   that would have prevented it.
4. **Profile** — update the affected \`person-<slug>\` wiki pages: observed
   style traits with evidence, respecting [[privacy-and-ethics-guardrails]].
5. **Report** — rewrite \`out/hive-mind-report.md\` (standing report) and
   revise \`out/team-agreement-draft.md\` where new evidence strengthens or
   weakens a proposed norm. Regenerate
   \`reports/data/pattern-occurrences.json\` and
   \`reports/data/agreement-norms.json\` for the dashboards.
6. **Log** — append a dated findings section to
   \`reports/comms-insights-log.md\` and advance the marker.

Severity guide: 1 = cosmetic friction · 3 = measurable focus/latency cost ·
5 = blocked work or documented decision lost.`,
  },
  {
    title: 'Person Profile Template',
    slug: 'person-profile-template',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['template', 'profiles'],
    mission_relevance: 0.8,
    body: `Template for \`person-<slug>\` pages. Copy the structure; keep every
observation evidence-cited and pattern-focused (see
[[privacy-and-ethics-guardrails]]).

\`\`\`markdown
## Communication style (observed)
- <trait> — evidence: <message link / transcript date / metric>

## Strengths
- <what works well in this person's communication>

## Patterns this person is drawn into
- <taxonomy type> — <role: initiates / amplifies / absorbs> — evidence: <link>

## Preferences (stated or inferred)
- <e.g. prefers consolidated asks; answers in batches around 13:00 and 17:00>

## What would help
- <the agreement norm(s) that would reduce friction for this person>
\`\`\`

Never include: judgments of competence or character, private/health topics,
speculation about motives, or comparisons ranking people against each other.`,
  },
  {
    title: 'Privacy and Ethics Guardrails',
    slug: 'privacy-and-ethics-guardrails',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['privacy', 'ethics', 'core'],
    mission_relevance: 1.0,
    body: `Observing colleagues' communication is sensitive. These guardrails are
non-negotiable and complement the persona rules:

1. **Read-aloud test.** Every profile line and report finding must be safe to
   read aloud in front of the whole team, including the person concerned.
2. **Patterns, not character.** Describe behavior and its measurable cost.
   "The #dev channel shows a 26 h unanswered blocker" — never "Jonas ignores
   people".
3. **Systemic framing.** The unit of diagnosis is the *team workflow*, not the
   individual. Hive-mind patterns are produced by missing agreements; people
   are participants, not culprits.
4. **Data minimalism.** Transcripts stay inside this project workspace. Quote
   the minimum necessary; link instead of copying long passages.
5. **No hidden reporting.** Everything the observer produces lives in this
   project and is visible to the team. The observer never posts to Teams
   proactively and never messages individuals.
6. **Corrections welcome.** If a person disputes an observation, record the
   dispute in the profile and re-examine the evidence.`,
  },
  {
    title: 'Metrics Reference',
    slug: 'metrics-reference',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['metrics', 'hive-analytics'],
    mission_relevance: 0.9,
    body: `Definitions used by the hive-analytics script (all computed from
\`data/teams/<channel>/messages.jsonl\`, core time = 08:00–18:00 UTC,
Mon–Fri):

- **messages** — count of non-deleted messages in scope.
- **medianReplyLatencyMin** — median minutes between a root message and its
  first reply by another person (threads only).
- **afterHoursSharePct** — share of messages created outside core time.
- **burstIndexPct** — share of messages sent < 2 min after the *same
  sender's* previous message in the same channel (fragmentation proxy).
- **unansweredBlockers** — root questions ('?' + blocked/waiting language)
  with no reply within 4 core-time hours.
- **cascadeDepth** — the longest chain of @mention messages across ≥ 3
  distinct people within 15 minutes (interruption cascade).
- **hive health score** — 100 minus weighted penalties on the five metrics
  above versus their targets (see \`reports/data/hive-metrics.json\`
  \`targets\`). Higher is healthier.

Targets are the *proposed agreement norms*, so the dashboards show progress
toward the team agreement, not an arbitrary benchmark.`,
  },
  {
    title: 'Team Agreement Status',
    slug: 'team-agreement-status',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['team-agreement', 'status'],
    mission_relevance: 1.0,
    body: `Current state of the proposed norms (living detail in
\`out/team-agreement-draft.md\`, dashboard in the Agreement Scoreboard):

| Norm | Status | Evidence base |
|---|---|---|
| 4 h messenger response in core time | proposed | instant-response-pressure + after-hours occurrences |
| Morning deep-work block 09:00–11:30 | proposed | ping-storm mornings, cascade at 09:1x |
| Office hours 13:00–14:00 | proposed | cascade + ambiguous-ownership occurrences |
| Meeting-free Wednesday | proposed | research basis (MIT Sloan 2022); local evidence pending |
| Decision log rule | proposed | undocumented-decision occurrences |

None adopted yet — the seed state reflects a team that has just started
observing itself. Adoption is a team decision; the observer supplies evidence.`,
  },
  {
    title: 'Person: Anna Meier',
    slug: 'person-anna-meier',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['profile', 'person'],
    mission_relevance: 0.8,
    body: `Product manager, Hive Alpha. Profile per [[person-profile-template]].

## Communication style (observed)
- High message volume in #general; asks arrive as rapid sequences of short
  messages — evidence: ping-storm of 7 messages in 4 minutes (see the Pattern
  Radar occurrence po-ping-storm-anna, day −4).
- Active well after core hours — evidence: 22:10–22:40 exchange (day −3) with
  near-instant replies expected and received.

## Strengths
- Fast, energetic information routing; nothing she knows stays siloed.
- Clear escalation instincts — flags risks early.

## Patterns this person is drawn into
- ping-storm — initiates — evidence: po-ping-storm-anna.
- after-hours-activity — initiates — evidence: po-after-hours-anna-priya.
- instant-response-pressure — amplifies (re-pings "any update?").

## Preferences (stated or inferred)
- Thinks by writing; drafts asks incrementally in the channel.

## What would help
- Morning deep-work block + 4 h response norm: legitimizes batched answers so
  incremental drafting stops creating instant-response pressure.`,
  },
  {
    title: 'Person: Jonas Weber',
    slug: 'person-jonas-weber',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['profile', 'person'],
    mission_relevance: 0.8,
    body: `Senior developer, Hive Alpha. Profile per [[person-profile-template]].

## Communication style (observed)
- Terse, precise, low message volume; answers in batches — evidence: reply
  clusters around midday in #dev transcripts.
- Long reply latencies to channel questions — evidence: the 26 h unanswered
  blocker (po-unanswered-blocker-priya, day −3 → day −2).

## Strengths
- Answers are complete and usually settle the thread.
- Does not amplify ping-storms; no after-hours activity observed.

## Patterns this person is drawn into
- unanswered-blocker — absorbs (questions addressed at him wait) — evidence:
  po-unanswered-blocker-priya.
- interruption-cascade — victim — evidence: po-cascade-tomas (immediate
  context switch after @mention, day −1).

## Preferences (stated or inferred)
- Protects focus implicitly by ignoring the channel while working — the cost
  lands on whoever is blocked.

## What would help
- Explicit response-time norm + office hours: replaces the implicit "ignore
  until convenient" with a predictable window others can rely on.`,
  },
  {
    title: 'Person: Priya Nair',
    slug: 'person-priya-nair',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['profile', 'person'],
    mission_relevance: 0.8,
    body: `Developer, Hive Alpha. Profile per [[person-profile-template]].

## Communication style (observed)
- Fastest responder on the team — evidence: lowest median reply latency in
  \`reports/data/hive-metrics.json\` persons table.
- Replies near-instantly even after hours — evidence: 22:1x replies in the
  after-hours exchange (po-after-hours-anna-priya, day −3).

## Strengths
- Keeps threads moving; unblocks others quickly when she can.
- Asks precise, well-formed questions (single consolidated message).

## Patterns this person is drawn into
- instant-response-pressure — absorbs (her speed sets the implicit
  expectation for everyone else).
- unanswered-blocker — victim — evidence: her day −3 blocker waited 26 h.
- after-hours-activity — reciprocates.

## Preferences (stated or inferred)
- Appears to feel obliged to answer immediately; never batches.

## What would help
- The 4 h norm protects her the most: it makes *not* answering instantly a
  team agreement instead of a personal failing.`,
  },
  {
    title: 'Person: Tomas Eriksen',
    slug: 'person-tomas-eriksen',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['profile', 'person'],
    mission_relevance: 0.8,
    body: `Software architect, Hive Alpha. Profile per [[person-profile-template]].

## Communication style (observed)
- Long, dense messages with heavy architecture jargon — evidence: the "AC"
  ambiguity thread (po-jargon-ac, day −2: anti-corruption layer vs. acceptance
  criteria).
- Makes decisions mid-thread — evidence: the auth-flow v2 decision (day −2)
  concluded in-channel and never documented (po-undocumented-decision-auth).
- Fans out @mentions when he needs input — evidence: the day −1 cascade
  across Jonas, Priya and Anna (po-cascade-tomas).

## Strengths
- Decisions are well-reasoned when you can find them.
- Generous with context; his messages teach.

## Patterns this person is drawn into
- undocumented-decision — initiates — evidence: po-undocumented-decision-auth.
- interruption-cascade — initiates — evidence: po-cascade-tomas.
- jargon-mismatch — initiates — evidence: po-jargon-ac.

## What would help
- Decision log rule ("not decided until written down") + office hours for the
  input fan-outs.`,
  },
  {
    title: 'Channel: hive-alpha--general',
    slug: 'channel-hive-alpha-general',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['channel'],
    mission_relevance: 0.7,
    body: `The team's default channel — status, coordination, announcements.
Mirrored at \`data/teams/hive-alpha--general/\`.

Observed character: high-frequency, fragmented, spikes in the morning
(ping-storms) and after 22:00 (after-hours exchanges). Primary habitat of
instant-response-pressure and after-hours-activity. See the Pattern Radar
heatmap for the weekday×hour distribution.`,
  },
  {
    title: 'Channel: hive-alpha--dev',
    slug: 'channel-hive-alpha-dev',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['channel'],
    mission_relevance: 0.7,
    body: `The engineering channel — technical questions, design threads.
Mirrored at \`data/teams/hive-alpha--dev/\`.

Observed character: longer threads, slower cadence than #general, but the
costlier patterns live here: the 26 h unanswered blocker, the undocumented
auth-flow decision, the jargon mismatch, and the day −1 interruption cascade.
Decisions made here are load-bearing — the decision log rule targets exactly
this channel.`,
  },
];
