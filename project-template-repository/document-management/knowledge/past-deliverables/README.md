# `knowledge/past-deliverables/` — reusable material from prior projects

The drafter retrieves from this folder when it writes a response to each
customer requirement. Every Markdown file here is part of the corpus.

## What works well here

- A delivered specification from a prior procurement, broken into named
  sections.
- A library of standard answer-paragraphs your organisation has tuned
  over time (e.g. "How we describe our availability commitment", "How
  we describe our identity-provider integration").
- A type-test report or compliance statement that named, plainly, what
  the platform does and to what level.

The drafter cites the specific section it pulled from. The more
sensibly your past material is broken into headings, the easier it is
to trace a draft back to its origin.

## What's already here

- `reference-deliverable.md` — a synthetic prior HVDC converter
  station delivery (DolWin-X, 320 kV / 900 MW) used as the reuse
  corpus for the worked example. Sections are organised under the
  same chapter numbering as the new requirements document, which
  makes per-requirement citations clean (e.g. a §7.2 alarm-latency
  requirement pulls from `reference-deliverable.md`'s
  "§7.2 Priority 1 alarm presentation latency" section).

The drafter shipped with this project will refuse to write a draft
without a citation, so a passable retrieval corpus is the difference
between meaningful drafts and one-line "cannot find usable material"
stubs.
