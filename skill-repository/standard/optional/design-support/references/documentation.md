# Desalination Pilot — Engineering Design Support

This project runs on the **Engineering Design Support System**. It is your
design memory and your honest second opinion across the months of designing
this reverse-osmosis pilot. You stay in flow; it accumulates the structure,
watches for gaps, and tells you the uncomfortable parts — when you ask.

This page is your how-to. It opens automatically each time you enter the
project.

---

## The contract: pull, not push

The system **does not interrupt you**. It accumulates and waits until you ask.
There is exactly **one exception**: if something you've captured directly
**contradicts the current mission**, it will surface that immediately — a
silent mission contradiction is too expensive to sit on.

Everything else — gaps, stale evidence, stalled questions, whitespots — waits
in the registers until you pull it (a status report, a triage, a question).

---

## What the system maintains for you

- **Mission** (`wiki/_meta/mission.md`) — intent, constraints, non-goals,
  acceptance criteria, **versioned**. Every edit is snapshotted to
  `mission/history/`. You can always ask what changed and when.
- **A typed dependency graph** in the knowledge graph — concepts, decisions,
  risks, assumptions, evidence, open questions, hypotheses — connected by
  typed links (`supports`, `contradicts`, `blocks`, `dependsOn`, `entails`,
  …). This is the system of record.
- **The scrapbook** — the visual mindmap mirror of that graph. Every item
  carries **relevance** (how structurally tied to the mission — stable) and
  **focus** (how much attention it needs now — decays over time, with a fixed
  total attention budget).
- **The wiki** — readable prose the system synthesizes once a part of the
  design has been stable for a few days.
- **Hypotheses** — claims you are testing, each run through a lifecycle so
  none of them silently drift.
- **Reports** — timestamped, immutable status snapshots under `reports/`.

---

## Day-to-day — just talk to the assistant

> *"Add a decision: 2-element SW30 train, 38% recovery. It depends on the
> hypothesis that single-pass boron stays under the EU 1.5 mg/L limit."*
> *"Propose a hypothesis: multimedia pre-treatment alone keeps the membrane
> alive 5 years on this feedwater."*
> *"Link: the genset-hybrid decision contradicts the solar-only constraint."*
> *"What did we rule out, and what did it affect?"*
> *"What changed since the last report?"*
> *"Generate a status report."*  /  *"…an external one for management."*
> *"Show me the whitespots."*

You can also **drop a sketch, datasheet, or photo** into the chat. Images are
first-class evidence — they are stored, turned into Evidence nodes, linked to
the relevant decision, and embedded in the synthesized wiki.

The quick-action buttons on the welcome screen run the most common of these
for you.

---

## The hypothesis lifecycle — what to expect

When you propose a hypothesis it enters **Proposed**. It will **not progress**
until you've written both *what would confirm it* and *what would refute it*.
This is deliberate — the anti-vagueness gate. The system will not invent these
for you.

Once sharpened, the system builds a **test queue** (literature, calculation,
simulation, prototype, expert consultation, market signal), pursues the
cheap-but-informative tests itself, and runs falsification probes against the
claim. Evidence accumulates with a strength and a direction until it leans.

| State | What it means |
|---|---|
| **Proposed** | Needs confirm + refute criteria from you. |
| **Sharpened** | Criteria set; test queue generated; pick the first test. |
| **Under test** | Researcher pursues tests; critic probes for refutation. |
| **Provisional support / refutation** | Leaning, not closed. On a refute lean, dependent decisions are annotated "weakening" — not invalidated. |
| **Supported** | Confidence frozen; the wiki stops hedging the claims that rested on it. |
| **Refuted** | **The important one** — see below. |
| **Stalled** | Evidence dried up. You'll be asked, specifically: commit to a real test, or demote? |
| **Demoted** | You chose not to pursue it; becomes an Assumption with the full history kept ("was a hypothesis from … until …, not pursued because …"). |
| **Superseded** | You reformulated it; the replacement starts in Proposed and inherits the links. |

**Refutation is a first-class event.** When a hypothesis is refuted the system
produces a **cascade report**: every decision that depended on it, every
entailed hypothesis (these are automatically reopened for re-evaluation), and
every wiki section weighted heavily by it — each with a review status you work
through. Proving something wrong *scopes the cleanup* instead of leaving you to
reconstruct, six weeks later, what depended on what.

> Edit a hypothesis's status **through the assistant**, never by hand — the
> workflow owns the status so nothing gets out of sync.

---

## Mission edits are accountable

Every time you edit `wiki/_meta/mission.md`, the system surfaces the
**implicit empirical claims** the edit introduced and asks you to triage each
one: pursue it as a hypothesis, record it as an assumption, or dismiss it.
Every mission version gets a triage record. Three months in, *"did we ever
consider X?"* has an answer.

---

## The status report

Ask any time.

- **Internal** — brutally honest: recent decisions with provenance traces back
  to the mission, open questions and risks, hypotheses by state, the cascade
  reports, gaps and unknowns, and a **confidence dashboard** of several
  signals (decision/question ratio, assumption-vs-evidence on load-bearing
  decisions, evidence recency, mission change rate, and how many load-bearing
  decisions rest on still-open hypotheses). Each signal shows its inputs.
- **External** — the same facts, filtered for management: speculative
  whitespots removed, gaps reframed as areas under active investigation,
  decisions and evidence and confidence kept. **Filtered, never falsified.**

Both are written to `reports/status-<timestamp>-<variant>.md` and never
overwritten.

---

## Why does the system think that?

No derived number is a black box. Ask *"why is this relevant?"* or *"why that
confidence?"* — relevance keeps its four components (mission distance, vector
similarity, neighbor inheritance, your assertion) separately, and every
dashboard signal lists its inputs. If you set an importance by hand and it
diverges sharply from what the system derived, that divergence is flagged in
the next report rather than hidden.

---

## Tuning

The knobs live in `design-support/config.json` (and the skill's own copy under
`.claude/skills/design-support/config.json`):

- **focus budget & decay** — how much total attention exists and how fast it
  fades (default budget 20, decay τ 21 days).
- **evidence thresholds** — how much evidence moves a hypothesis to
  provisional vs. confirmed (default low 0.4, high 0.75; per-hypothesis
  overrides allowed).
- **stall window** — how long without new evidence before a hypothesis stalls
  (14–28 days, scaled by relevance).
- **cluster stability** — days unchanged before the wiki synthesizes a section
  (default 5).
- **curator schedule** — the nightly tidy-up (default 03:00 UTC).

Defaults are sensible for a months-long single-engineer project. Adjust if
your pace differs.

---

Everything is saved automatically. Close the chat, come back weeks later — the
mission, the graph, the hypotheses, the cascade reports, and the full history
are all still here.
