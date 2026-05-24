/**
 * Wiki pages for the long-horizon-commitments seed project.
 *
 * Five vessel pages, the *Meridian* commitment lifeline, the gates and the
 * regulatory backdrop, the agent's operating rules. Cross-links use
 * `[label](../topics/<slug>.md)` so wiki-add.ts auto-creates backlinks.
 */

export interface WikiPageDraft {
  title: string;
  slug: string;
  bucket: 'topics' | 'sources' | 'queries';
  status: 'stable' | 'draft' | 'stub';
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  mission_relevance: number;
  body: string;
  classification?: 'public' | 'private' | 'secret';
}

export const WIKI_PAGES: WikiPageDraft[] = [
  // -- Fleet overview ----------------------------------------------------
  {
    title: 'Fleet overview',
    slug: 'fleet-overview',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['fleet'],
    mission_relevance: 1.0,
    body: `# Fleet overview

Five midsize crude tankers, built 2015–2020, total ~520k dwt.

| Vessel | Built | DWT | Strategy alignment | Status |
|---|---|---|---|---|
| [Meridian](../topics/meridian.md) | 2015 | 113k | 38% | Off-strategy |
| [Aurora](../topics/aurora.md) | 2018 | 105k | 84% | Aligned |
| [Nordic Star](../topics/nordic-star.md) | 2017 | 110k | 72% | Aligned |
| [Cape Pioneer](../topics/cape-pioneer.md) | 2016 | 108k | 55% | Watch |
| [Orion](../topics/orion.md) | 2020 | 115k | 91% | Aligned |

**Fleet strategy:** *"Compliant and charter-ready through 2035."* Scored
nightly against EU ETS, FuelEU Maritime intensity steps, IMO 2027 net-zero
framework, and remaining hull life. See [drift against fleet strategy
](../topics/drift-against-fleet-strategy.md).

The Meridian is the load-bearing case study: three of the four assumptions
under its 2018/2021/2023/2025 decision cohort have expired, and the next
[dry-dock window](../topics/dry-dock-windows.md) is ~14 months out.
`,
  },

  // -- Vessels (5) -------------------------------------------------------
  {
    title: 'Meridian',
    slug: 'meridian',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['vessel', 'meridian', 'off-strategy'],
    mission_relevance: 1.0,
    body: `# Meridian

Midsize crude tanker, IMO 9712334, built 2015 (Hyundai Heavy Industries),
113,200 dwt. Current strategy alignment: **38%** — *off-strategy*.

## Why off-strategy
Three of the four assumptions the Meridian's commitments rest on have
expired. The original 2018 call not to fit a scrubber held only as long as
the high-/low-sulphur fuel spread stayed narrow; it widened. The 2021 long-
term charter assumed rates would hold; they did not, and the 2023 refinancing
assumed rates would settle below plan, which has not happened either. The
2025 "comply via allowances" decision assumed EUA price stability — also
falsified.

## Commitment lifeline
See [commitment-lifeline-meridian](../topics/commitment-lifeline-meridian.md)
for the full timeline. Four historical decisions, eight underlying
assumptions, three of them currently red.

## Next gate
The next [special survey + dry-dock](../topics/dry-dock-windows.md) window
opens **mid-2027**, ~14 months from today. This is the cheap window to
re-decide the deferred items:

- [scrubber retrofit](../topics/scrubber-retrofit.md) — deferred since 2018.
- ballast-water treatment — compliance item, due.
- fuel-system preparation — future-fuel readiness.

Outside this window the same work costs multiples.

## Active red-team
See [red-team-on-irreversibles](../topics/red-team-on-irreversibles.md).
The retrofit-vs-defer-vs-scrap call is being argued both sides on the record
before the human adjudicates.
`,
  },
  {
    title: 'Aurora',
    slug: 'aurora',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['vessel', 'aurora', 'aligned'],
    mission_relevance: 0.7,
    body: `# Aurora

Midsize crude tanker, IMO 9788321, built 2018 (DSME), 104,800 dwt. Current
strategy alignment: **84%** — *aligned*.

Scrubber-fitted at delivery (open-loop, upgraded to hybrid in 2023). On a
shorter charter (2 year + 2 year option) that gives optionality. The fuel-
spread bet that hurt the [Meridian](../topics/meridian.md) helped here: the
scrubber paid back inside three years.

No active drift; the only assumption to watch is EUA price exposure, which
applies fleet-wide.
`,
  },
  {
    title: 'Nordic Star',
    slug: 'nordic-star',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['vessel', 'nordic-star', 'aligned'],
    mission_relevance: 0.6,
    body: `# Nordic Star

Midsize crude tanker, IMO 9745667, built 2017, 110,100 dwt. Current strategy
alignment: **72%** — *aligned*, with EU ETS cost monitored.

Scrubber-fitted, long-term charter to a counterparty with good credit. The
EU ETS exposure (full coverage 2026) is the live item — see [eu-ets-and-
fueleu](../topics/eu-ets-and-fueleu.md). Cost is being absorbed within the
charter envelope so far; if EUA prices step up, expect a renegotiation
trigger.
`,
  },
  {
    title: 'Cape Pioneer',
    slug: 'cape-pioneer',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['vessel', 'cape-pioneer', 'watch'],
    mission_relevance: 0.6,
    body: `# Cape Pioneer

Midsize crude tanker, IMO 9723145, built 2016, 108,400 dwt. Current strategy
alignment: **55%** — *watch*.

Allowance cost trending up; the vessel's compliance envelope is shrinking
year-on-year as FuelEU intensity steps tighten. Next dry-dock 2028. Worth
deciding now whether to bring it forward to a hybrid-fuel preparation in the
2027 yard window — that conversation has not been opened yet and the agent
should flag it.
`,
  },
  {
    title: 'Orion',
    slug: 'orion',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['vessel', 'orion', 'aligned'],
    mission_relevance: 0.5,
    body: `# Orion

Midsize crude tanker, IMO 9831226, built 2020, 114,900 dwt. Current strategy
alignment: **91%** — *aligned*.

The newest hull in the fleet. Scrubber-fitted at delivery, FuelEU-ready
engine room, long-dated charter. No live drift; the only assumption needing
periodic revalidation is the residual-value glide path beyond 2030.
`,
  },

  // -- The Meridian deep-dives ------------------------------------------
  {
    title: 'Commitment lifeline — Meridian',
    slug: 'commitment-lifeline-meridian',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['meridian', 'lifeline', 'assumptions'],
    mission_relevance: 1.0,
    body: `# Commitment lifeline — Meridian

Every fleet decision sits on a timeline with the assumptions it rests on
stacked beneath it, each ageing at its own rate. Below is the *Meridian's*
chain as of 2026-05-24.

## 2018 — No scrubber fitted
Decision: do not fit a scrubber at the 2018 dry-dock.

Assumptions:
- **fuel spread narrows** — *expired*. The high-/low-sulphur spread widened
  after IMO 2020, not narrowed.
- **low-sulphur premium small** — *expired*. Same cohort.

## 2021 — Long-term charter re-let
Decision: re-let on a 5-year charter at terms premised on the 2018 call.

Assumptions:
- **charter rate holds** — *ageing*. Rate did not hold at the planned level.
- **counterparty solid** — *fresh*. Counterparty remains AA-rated.

## 2023 — Refinanced
Decision: refinance against a residual-value glide path.

Assumptions:
- **rates below plan** — *expired*. Refi rate sits above plan since Q3 2023.
- **residual value** — *ageing*. Broker valuations drifting down (see
  [projection-vs-reality](../topics/projection-vs-reality.md)).

## 2025 — Comply via allowances
Decision: meet EU ETS exposure by purchasing EUAs rather than retrofitting.

Assumptions:
- **EUA price stable** — *expired*. EUA prices have moved well above the
  2025 plan.
- **no retrofit yet** — *ageing*. Becomes a forced choice at the 2027 dry-
  dock window.

## Aggregate
Three assumptions red, three amber, two green. Three rechecks overdue. The
agent has been flagging this packet quarterly for two years. The next
dry-dock at **mid-2027** is the cheap window to re-decide.

See [retrofit-payback-2027](../topics/retrofit-payback-2027.md) for the
red-team case both sides.
`,
  },
  {
    title: 'Projection vs. reality',
    slug: 'projection-vs-reality',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['projection', 'review', 'meridian'],
    mission_relevance: 0.9,
    body: `# Projection vs. reality

Every vessel carries the projection it was bought or chartered on — lifetime
earnings, total cost of ownership — drawn with the uncertainty band it
deserves. The agent tracks actuals against that cone year after year.

## Meridian
The Meridian's actuals **left the cone in 2023** and have stayed below the
lower band since. This is a *review trigger*, not an action: the question
the agent forces back to a human is the literal one — *was the model wrong,
or did the world change?*

If the model was wrong, the projection is re-baselined (with the original
preserved on the record). If the world changed, the underlying assumptions
get re-aged and the dependent commitments get re-decided.

**The agent never re-baselines a projection.** This is the hard rule the
article calls out specifically. The tempting move when actuals diverge is
to let the system quietly update the forecast so the dashboard turns green.
The agent refuses; only a human re-baselines, on the record, and the old
projection stays beside the new one.

## Other vessels
Aurora, Nordic Star, Orion: actuals inside the cone. Cape Pioneer: actuals
on the lower edge of the cone; watch.
`,
  },

  // -- Domain backdrop ---------------------------------------------------
  {
    title: 'Dry-dock windows',
    slug: 'dry-dock-windows',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['gate', 'dry-dock', 'special-survey'],
    mission_relevance: 0.9,
    body: `# Dry-dock windows

Classification rules require a special survey roughly every five years, with
dry-docking — the vessel out of the water, the only practical moment for
major structural work or a retrofit. The window is **scheduled, immovable,
and unforgiving**: the same job done out of cycle costs multiples.

## Why the agent counts down to each window
Out-of-cycle docking adds cost on three axes: yard slot premium, lost
trading days, and re-mobilisation. The agent's whole purpose around these
gates is to make sure every deferred item gets re-decided *before* the
window opens, not after.

## Current upcoming windows

| Vessel | Window opens | Deferred items |
|---|---|---|
| [Meridian](../topics/meridian.md) | mid-2027 (~14 months) | [scrubber retrofit](../topics/scrubber-retrofit.md), ballast-water, fuel-system prep |
| Aurora | Q1 2029 | hybrid scrubber service |
| Nordic Star | mid-2028 | ballast-water upgrade |
| Cape Pioneer | late-2028 | fuel-system prep (open question) |
| Orion | Q3 2030 | none deferred |

The Meridian window is the live one. See [retrofit-payback-2027](../topics/retrofit-payback-2027.md).
`,
  },
  {
    title: 'Scrubber retrofit',
    slug: 'scrubber-retrofit',
    bucket: 'topics',
    status: 'stable',
    confidence: 'medium',
    tags: ['retrofit', 'compliance', 'scrubber'],
    mission_relevance: 0.85,
    body: `# Scrubber retrofit

A scrubber (exhaust gas cleaning system, EGCS) lets a vessel burn higher-
sulphur fuel oil and clean the exhaust to MARPOL Annex VI limits. Three
variants: open-loop, closed-loop, hybrid.

## When it pays
- High-/low-sulphur fuel spread is wide and expected to stay wide.
- Vessel has ≥8 years of remaining useful life at retrofit time.
- A dry-dock window is open (out-of-cycle retrofit roughly triples the cost).

## When it does not pay
- Spread narrow or volatile.
- <5 years of hull life left.
- Trading area increasingly restricts open-loop discharge (Med, parts of
  Asia tightening).

## For the *Meridian*
The 2018 decision was *no scrubber*, premised on the fuel spread narrowing.
That assumption is now expired. The retrofit question is back on the table
at the 2027 dry-dock with ~8 years of hull life remaining. See
[retrofit-payback-2027](../topics/retrofit-payback-2027.md) for the live
case for and against.
`,
  },
  {
    title: 'Retrofit payback — 2027',
    slug: 'retrofit-payback-2027',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['retrofit', 'meridian', 'red-team'],
    mission_relevance: 0.95,
    body: `# Retrofit payback — Meridian 2027

The decision the *Meridian* is queued to bring back to a human before the
2027 dry-dock window closes: retrofit a scrubber, defer (and plan), or sell
/ scrap.

## Case for retrofit
- Restores charter-ability as rules tighten — EU ETS + FuelEU trajectory to
  2050, charterers screening on emissions.
- The 2027 dry-dock is the *cheap* window to act — in-dock vs out-of-cycle
  cost gap; the next gate is five years away.

## Case against
- ~8 years of hull life left — payback is tight against capex.
- Residual value vs retrofit capex — broker valuations have drifted down.
- 2 of 5 earnings scenarios don't clear.
- Fuel pathway uncertain — IMO 2027 framework still settling; no resale
  uplift modelled.

## Adjudication
One agent argues for, one argues against, the human adjudicates **on the
record**. Three outcomes: retrofit / defer + plan / sell + scrap. The
adjudication artefact is preserved beside the original 2018 decision so the
history of having been wrong stays on the record. See
[red-team-on-irreversibles](../topics/red-team-on-irreversibles.md).
`,
  },

  // -- Regulatory backdrop -----------------------------------------------
  {
    title: 'EU ETS and FuelEU Maritime',
    slug: 'eu-ets-and-fueleu',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['regulation', 'eu', 'ets', 'fueleu'],
    mission_relevance: 0.85,
    body: `# EU ETS and FuelEU Maritime

The two EU instruments that bracket the fleet's compliance pathway through
2030 and beyond.

## EU ETS (shipping)
Since 1 January 2024 the EU Emissions Trading System covers shipping for
vessels above 5,000 GT. Phase-in:

- 2024: 40% of reportable emissions.
- 2025: 70%.
- **2026: 100%.**

Operators must surrender EUAs for every covered tonne. The 2025 "comply via
allowances" decision on the Meridian sat on top of an assumption that EUA
price would stay broadly stable; it has not. See
[commitment-lifeline-meridian](../topics/commitment-lifeline-meridian.md).

## FuelEU Maritime
Effective 2025; cuts the permitted greenhouse-gas intensity of shipboard
energy in five-year steps:

| Year | Reduction vs 2020 baseline |
|---|---|
| 2025 | -2% |
| 2030 | -6% |
| 2035 | -14.5% |
| 2040 | -31% |
| 2050 | -80% |

Pooling and banking flexibilities exist but are commercially priced. A 2018-
era vessel without fuel-system flexibility hits the 2035 step squarely; this
is why fuel-system prep is one of the [Meridian](../topics/meridian.md) gate
deferred items.

See also: [imo-2027-framework](../topics/imo-2027-framework.md).
`,
  },
  {
    title: 'IMO 2027 framework',
    slug: 'imo-2027-framework',
    bucket: 'topics',
    status: 'draft',
    confidence: 'medium',
    tags: ['regulation', 'imo', 'net-zero'],
    mission_relevance: 0.8,
    body: `# IMO 2027 framework

The IMO's 2023 strategy targets net-zero greenhouse-gas emissions *"by or
around"* 2050. A binding net-zero framework was approved in 2025 and enters
force in 2027 — combining a global fuel-intensity standard with an economic
measure (a pricing mechanism on emissions above a benchmark).

## Why this matters for fleet bets
The framework is still settling at the implementation-detail level. That
*uncertainty itself* is one of the live assumptions: the 2025 "comply via
allowances" decision on the Meridian implicitly bet that the IMO mechanism
would land in a particular zone. Until the implementation regulations are
final, this assumption stays *ageing*, not *expired* — but it is on the
list to revalidate at the 2027 dry-dock window.

See [eu-ets-and-fueleu](../topics/eu-ets-and-fueleu.md) for the EU regime
that sits alongside.
`,
  },
  {
    title: 'Charter strategy',
    slug: 'charter-strategy',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['commercial', 'charter'],
    mission_relevance: 0.7,
    body: `# Charter strategy

Long-term charter vs spot trading is a years-long bet. A long-term charter
locks in a counterparty, a rate, and an operating envelope; the spot market
gives optionality at the price of revenue volatility.

## Fleet stance
- *Meridian* — long-term, 2021 vintage. Rate did not hold. Counterparty
  strong. See [commitment-lifeline-meridian](../topics/commitment-lifeline-meridian.md).
- *Aurora* — 2+2 year structure. Optionality preserved.
- *Nordic Star* — long-term to AA counterparty. EU ETS cost absorbed within
  envelope so far.
- *Cape Pioneer* — long-term legacy charter; renegotiation likely if
  allowance costs step up.
- *Orion* — long-dated charter at fresh terms.

A charter that "fits" the original vessel-spec bet quietly stops fitting as
fuels and regulations move underneath it. The agent watches this drift in
the [drift-against-fleet-strategy](../topics/drift-against-fleet-strategy.md)
score.
`,
  },
  {
    title: 'Drift against fleet strategy',
    slug: 'drift-against-fleet-strategy',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['strategy', 'drift', 'scoring'],
    mission_relevance: 0.95,
    body: `# Drift against fleet strategy

A fleet described as *"compliant and charter-ready through 2035"* can drift
vessel by vessel into *"increasingly hard to charter under tightening rules"*
without anyone ever re-labelling it.

## How the score is built
Each vessel is scored nightly against the stated strategy on four axes:

1. **Compliance envelope** — EU ETS + FuelEU + IMO 2027 cost vs revenue.
2. **Charter-ability** — how the vessel scores in current charterer
   screening (emissions intensity, scrubber fit, fuel flexibility).
3. **Residual value glide** — broker valuation vs the original glide path.
4. **Hull/maintenance state** — survey condition, deferred items.

The single number on the fleet dashboard is the weighted aggregate. The
chain of provenance — why a vessel scored what it did, with the source
documents — is preserved for every score.

## What the agent does with drift
**Surface, not decide.** A vessel that drops into *off-strategy* gets a
quarterly-packet entry; a vessel in *watch* gets a flag. The agent does not
recommend buy / sell / retrofit; it convenes the conversation. See
[red-team-on-irreversibles](../topics/red-team-on-irreversibles.md).
`,
  },

  // -- Operating rules ---------------------------------------------------
  {
    title: 'Quarterly review cadence',
    slug: 'quarterly-review-cadence',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['cadence', 'packet', 'review'],
    mission_relevance: 0.9,
    body: `# Quarterly review cadence

Rather than pinging continuously, the agent works to the fleet's review
cadence — quarterly — and at each checkpoint assembles **one packet**:

- which assumptions expired since the last packet,
- which gates are approaching (next 18 months),
- which projections broke,
- which vessels drifted off-strategy.

The packet has three actions: **Escalate**, **Acknowledge**, **Open
Decisions**. The packet is not closed until one of the three is recorded.

See the hard rule: [no-silent-default](../topics/no-silent-default.md).
`,
  },
  {
    title: 'No silent default',
    slug: 'no-silent-default',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'gate', 'freeze'],
    mission_relevance: 1.0,
    body: `# No silent default

**The most dangerous "feature" a long-horizon system could ship is the
ability to let a review slide.** A skipped quarterly packet feels harmless;
four skipped packets is how a dry-dock window passes with a stale assumption
unexamined. So the agent's gates can **freeze** the affected commitments
when a review goes un-actioned by its deadline.

## What "freeze" means
A frozen commitment cannot:
- Be silently rolled forward to the next quarter.
- Have its underlying assumptions re-aged as if reviewed.
- Be marked compliant on the dashboard.

It *can* be unfrozen — explicitly, by a human, on the record, with a
written rationale. A forced pause is uncomfortable; a silent roll-forward
is expensive.

## Pair rule
This pairs with [projection-vs-reality](../topics/projection-vs-reality.md):
the agent never re-baselines a projection on its own. Same instinct — keep
the history of having been wrong exactly where someone will need it years
later.
`,
  },
  {
    title: 'Red-team on irreversibles',
    slug: 'red-team-on-irreversibles',
    bucket: 'topics',
    status: 'stable',
    confidence: 'high',
    tags: ['rule', 'red-team', 'adjudication'],
    mission_relevance: 0.95,
    body: `# Red-team on irreversibles

For the decisions you cannot walk back — retrofit vs scrap, a long-term
charter vs staying on spot, refinancing — a **second agent** is tasked to
argue against the leading option and attack its assumptions.

## How it runs
- Agent A makes the case **for** the proposed commitment, with evidence.
- The red-team agent makes the case **against**, attacking each pillar of
  the case-for with a specific rebuttal.
- The human sits where they belong: **as the judge between two agents**,
  not the supervisor of one.

## The artefact
The output is a structured case-for / case-against record, with the
human's adjudication and rationale appended. This artefact is preserved
beside the original commitment so years later — when the people who took
the call have rotated out — the chain of reasoning is still readable.

## Live red-team
The live one is on the [Meridian retrofit at the 2027 dry-dock
](../topics/retrofit-payback-2027.md). Three outcomes on the table:
retrofit, defer + plan, sell/scrap.
`,
  },
];
