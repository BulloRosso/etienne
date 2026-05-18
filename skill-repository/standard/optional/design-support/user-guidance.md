# Engineering Design Support — Quick Start

Welcome. This system is your design memory and your honest second opinion over a
months-long project. You stay in flow; it accumulates structure, watches for
gaps, and tells you the uncomfortable parts when you ask.

---

## The one rule: pull, not push

The system **does not interrupt you**. It quietly builds up the picture and
waits until you ask. There is exactly one exception: if something you've
captured directly **contradicts the current mission**, it will surface that —
because a silent contradiction is expensive.

---

## What it holds for you

- **Mission** — your intent, constraints, non-goals, and acceptance criteria,
  *versioned*. Every edit is kept; you can always see what changed and when.
- **A typed graph** of your thinking: concepts, decisions, risks, assumptions,
  evidence, open questions — and the links between them (this *supports* that,
  this *contradicts* that, this decision *depends on* that hypothesis).
- **A scrapbook view** — the visual mindmap mirror of that graph, with
  importance (relevance) and current attention (focus) on every item.
- **A wiki** — readable prose the system writes for you once a part of the
  design has settled.
- **Hypotheses** — claims you're testing, each tracked through a lifecycle so
  none of them silently drift.

---

## Day-to-day

Just talk to the assistant:

> *"Add a decision: we'll use a 2-element SW30 train. It depends on the
> hypothesis that boron stays under the EU limit."*
> *"Propose a hypothesis: pre-treatment alone keeps the membrane alive 5 years."*
> *"What did we rule out, and what did it affect?"*
> *"What changed since last month?"*
> *"Generate a status report."* (or *"…an external one for management."*)
> *"Show me the whitespots."*

You can also drop a **sketch, datasheet, or photo** into the chat — images are
treated as first-class evidence and get linked to the relevant decision.

---

## The hypothesis lifecycle (what to expect)

When you propose a hypothesis, the system first makes you **sharpen** it: it
won't progress until you've written what would *confirm* it and what would
*refute* it. That's deliberate — it's the anti-vagueness gate.

Then it generates candidate **tests** (literature, calculation, simulation,
prototype, expert, market signal), pursues the cheap informative ones itself,
and runs falsification probes against the claim. Evidence accumulates until it
leans one way.

- **Supported** — confidence frozen; the wiki language stops hedging.
- **Refuted** — the important one. The system produces a **cascade report**:
  every decision that depended on this, every entailed hypothesis (reopened
  automatically), every wiki section that needs rewriting. Proving something
  wrong actually *scopes the cleanup* instead of leaving you to remember six
  weeks later.
- **Stalled** — evidence dried up. It'll ask you, specifically: commit to a
  real test, or demote it?
- **Demoted** — you chose not to pursue it; it becomes an assumption with the
  full history preserved ("was a hypothesis from … until …, not pursued
  because …").

Edit a hypothesis's status through the assistant, not by hand — the workflow
owns the status so nothing gets out of sync.

---

## Mission edits are accountable

Every time you edit the mission, the system surfaces the **implicit claims** it
just introduced and asks you to triage each one (pursue as a hypothesis, record
as an assumption, or dismiss). Three months later, "did we ever consider X?"
has an answer.

---

## The status report

Ask any time. The **internal** report is brutally honest — gaps, stale
evidence, hidden assumptions, brittle decisions resting on open hypotheses, a
multi-signal confidence dashboard. The **external** report is the same facts
filtered for management: speculative whitespots removed, gaps framed as areas
under active investigation, decisions and evidence kept. Filtered, never
falsified. Each report is saved as a timestamped snapshot under `reports/`.

---

## Tuning

Defaults (focus budget, decay rate, evidence thresholds, stall window, the
nightly tidy-up time) live in
`.claude/skills/design-support/config.json`. They're sensible for a
months-long project; adjust them there if your pace differs.

Everything is saved automatically. Close the chat, come back weeks later — the
mission, the graph, the hypotheses, and the history are all still there.
