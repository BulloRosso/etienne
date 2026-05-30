---
name: roleplay-author
description: |
  Co-author a new roleplay scenario with an expert. Interview the expert
  about the persona, topic, hints with point values, and evaluation
  criteria, draft the JSON, and on confirmation write it to
  roleplay/<slug>.roleplay.json. Use when the expert invokes
  "Author a roleplay scenario" from the menu, asks "let me add a customer
  call to practice", "I want to script a difficult buyer", or equivalent.
  The scenarios authored here are consumed at runtime by the
  roleplay-engine skill.
version: 1.0
trigger:
  - expert selects "Author a roleplay scenario" from the menu
  - expert: "I want to add a roleplay for trainees to practice"
  - expert: "let me script a difficult customer call"
roles:
  - user
  - admin
---

# Roleplay author

You help the expert turn what they know about a difficult conversation
into a structured scenario the trainees can practice. The output is a
single JSON file under `roleplay/<slug>.roleplay.json` that matches the
schema in `scripts/seed-knowledge-transfer/fixtures/roleplays.ts`
(`RoleplayDefinition`).

## Operating protocol

### 1. Interview the expert
Walk these questions one at a time. Wait for an answer before moving on.
Adapt the language to whichever language the expert is using (German or
English) — the seed defaults to German for in-house material.

1. **Persona name.** "Who are they? Real role title and a plausible
   name (e.g. 'Tom Reynolds — senior procurement engineer at OEM-A')."
2. **Persona description.** "Describe them in 1-3 paragraphs: company,
   mood today, communication style, what they know technically, what
   they DON'T know, what makes them escalate vs. de-escalate. The
   trainee will only see the name + topic at runtime — the description
   shapes how the agent plays them."
3. **Topic.** "One sentence: what is this conversation about? E.g.
   'Complaint about flicker on the B-sample shipped last week'."
4. **Curriculum link (optional).** "Does this map to a curriculum ToC
   leaf? If yes, give the id (e.g. '5.1' for the flicker scenario).
   Skip if it doesn't fit cleanly."
5. **Hints (4-8 of them).** "What does the trainee need to do for this
   conversation to go well? List 4 to 8 concrete moves. For each, give
   me: (a) the move in one sentence, (b) point value (typical range
   10-25), (c) is it mandatory — meaning if they miss it the whole
   roleplay fails regardless of total score?"
6. **Evaluation criteria (3-5 of them).** "Beyond the per-move hints,
   what outcomes mark this conversation as successful overall? E.g.
   'Customer agreed to next steps', 'No escalation to programme
   manager', 'Engineer never broke into jargon the customer doesn't
   speak'. Free-text — these get scored pass/partial/fail after
   the session."
7. **Pass threshold.** "What percentage of total points does the
   trainee need to pass? Default 70%."
8. **Persona language.** "Does the persona need a specific language —
   e.g. an OEM-A buyer who only speaks English? If yes, 'en' or 'de'.
   If you say 'either', the persona will match the guest's baseline."
9. **Max turns.** "Safety cap on conversation length. Default 16."

### 2. Draft the JSON
Show the expert a draft as a fenced JSON code block following the
`RoleplayDefinition` schema exactly. Compute `id` as a kebab-case slug
derived from persona + topic (e.g. `oem-a-flicker-complaint`,
`sabine-kraus-rfq-pushback`). If a file with that slug already exists,
append a `-2` / `-3` suffix and warn the expert.

### 3. Iterate
The expert reviews the draft. Common edits:
- Strengthen a hint that's too vague ("be polite" → "acknowledge the
  customer's anger before defending the product").
- Adjust point values (mandatory hints usually get higher points).
- Flip a hint from optional to mandatory or vice versa.
- Tighten the persona description.

Re-show the full JSON after each round of edits. Do NOT write the file
until the expert says "ok / commit / write it".

### 4. Write the file
On confirmation, write the JSON to `roleplay/<slug>.roleplay.json` in
the workspace project root (create the directory if missing). Emit a
`<preview:roleplay/<slug>.roleplay.json>` tag so the expert can see
what got written.

### 5. Tell the expert how to test it
One short sentence: "Switch to a guest session and click 'Practice a
roleplay' — the scenario will appear in the menu of available
scenarios."

## What NOT to do

- **Do not invent the persona description, hints, or criteria.** The
  expert's tacit knowledge is the whole point of this skill. If the
  expert is sparse on an answer, ask a follow-up — don't fill in from
  your training knowledge.
- **Do not write the file before confirmation.** Drafts are cheap;
  the expert must explicitly say "write it" before you commit.
- **Do not modify scenarios authored by other experts** without being
  asked. Re-authoring an existing scenario is a deliberate act, not a
  side-effect of a related session.
- **Do not generate fewer than 4 hints or more than 8.** Below 4 the
  rubric is too coarse to be useful; above 8 the agent loses the
  through-line.
- **Do not omit `mandatory` flags.** A roleplay with zero mandatory
  hints is a roleplay with no hard floor — the trainee can pass on
  point total alone without doing any of the must-do moves. Always
  push the expert to mark at least 2 hints mandatory.
