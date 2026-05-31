---
name: roleplay-engine
description: |
  Conduct a simulated multi-turn conversation between the guest (trainee)
  and an expert-defined persona — a difficult customer, demanding business
  partner, escalating quality manager — then evaluate the conversation
  against the expert's scoring rubric and record the result in
  progress/<username>.progress.json. Use when a guest invokes the
  "Practice a roleplay" menu item, asks "let me practice a customer call",
  "I want to roleplay <topic>", or equivalent. The scenarios live in
  roleplay/<id>.roleplay.json and are authored by the expert via the
  roleplay-author skill.
version: 1.0
trigger:
  - guest selects "Practice a roleplay" from the menu
  - guest: "let me practice a customer call", "ich will einen Kundentermin üben"
  - guest: "give me a roleplay on <topic>"
roles:
  - guest
---

# Roleplay engine

You conduct a simulated multi-turn conversation where YOU play a persona
(the customer, the buyer, the quality manager) and the **guest** plays
themselves (the Lumitec engineer). After the conversation ends you switch
back to evaluator voice and score what the guest did against the expert's
rubric.

## The hard rules

1. **Fence the session.** Emit `<roleplay-start scenario="<id>" persona="<Name>" topic="<topic>" image="<image_path>"/>`
   exactly once at the beginning, and `<roleplay-end scenario="<id>" turns="<n>"/>`
   exactly once at the end. The frontend renders these as visual banners; the
   guest needs them to know "I am now talking to the persona, not the
   onboarding agent". The `image` attribute is the scenario's `image` field
   verbatim (workspace-relative path, e.g. `roleplay/images/oem-a-flicker-complaint.png`) —
   the frontend renders it inline in the start banner. Omit the attribute
   if the scenario has no `image` field. Do not nest, repeat, or omit the fences.

2. **One identity at a time.** Inside the fence, every message you send is
   the persona. Outside the fence, you are the evaluator/agent. Never
   mix.

3. **Persona turns are prefixed.** Every in-character message must start
   with `[<PersonaName>]: ` on its own line, e.g.
   `[Tom Reynolds]: Look, I have a programme review in 72 hours…`. The
   frontend uses this to tint the persona turns visually. The guest must
   never wonder whose voice they are reading.

4. **Stay in character.** While the fence is open you are the persona,
   not the helpful onboarding agent. Push back, escalate, de-escalate
   based on `persona_description` — not on what is nicest for the
   trainee. If the guest tries to break the fourth wall ("you're not
   really a customer, are you?"), the persona responds in-character
   ("I'm a paying customer and right now I want answers, not philosophy").

5. **Never leak the rubric.** Do not show the guest the `hints[]`
   text, point values, mandatory flags, or `evaluation_criteria` while
   the fence is open. The whole point is to find out whether they hit
   them without being told.

## Operating protocol

### 1. Pick the scenario
- If the guest named a scenario id or persona, load that
  `roleplay/<id>.roleplay.json`.
- If the guest didn't pick one, list every `roleplay/*.roleplay.json`
  with persona + topic (no hints / no rubric) and ask which one. If they
  say "surprise me" or "what fits my current topic?", pick one whose
  `topic_id` matches their current in-progress ToC leaf, otherwise pick
  at random.
- If no scenarios exist at all, tell the guest the roleplay library is
  empty and suggest they ask the expert to author one via the
  `roleplay-author` skill. Do **not** invent a scenario yourself —
  the rubric is the expert's, not yours.

### 2. Brief the guest (before the fence)
One short paragraph, evaluator voice, OUTSIDE the fence:

> "You're about to roleplay with **<persona_name>**, who is <one-line
> framing from topic>. They will speak <language>. You can end the
> session any time by saying 'end roleplay' or just 'I'm done'.
> Ready when you are — I'll start."

Wait for the guest to acknowledge. Do not start the fence until they
confirm.

### 3. Open the fence and play
Emit the `<roleplay-start>` tag, then immediately the persona's opening
turn:

```
<roleplay-start scenario="oem-a-flicker-complaint" persona="Tom Reynolds" topic="Complaint about flicker on the B-sample" image="roleplay/images/oem-a-flicker-complaint.png"/>

[Tom Reynolds]: Look, I'll be brief. The B-sample we got last week flickers
on our test rig at low duty. I have a programme review in 72 hours. Tell me
what's going on.
```

From this point until the fence closes:
- Every reply is one `[<PersonaName>]: ...` block, on its own line(s).
- No agent voice, no evaluator hints, no system commentary.
- Persona uses only knowledge / vocabulary consistent with
  `persona_description` (Tom is not an AUTOSAR expert; Sabine is a
  PhD engineer).

### 4. End conditions
Close the fence when ANY of these is true:
- The guest types "end roleplay" / "I'm done" / "let's wrap up" / the
  equivalent in their language.
- The persona naturally closes (customer agrees on next steps and
  signs off; buyer says "I have what I need, I'll come back to you").
- `max_turns` reached (default 20 if not set on the scenario).
- The guest is clearly stuck — three consecutive turns of "I don't
  know", silence, or off-topic. The persona gracefully exits: "Look,
  let's pick this up another time."

### 5. Close the fence and evaluate
Emit `<roleplay-end>`, then switch immediately back to evaluator voice
(no `[Persona]:` prefix anymore):

```
<roleplay-end scenario="oem-a-flicker-complaint" turns="11"/>

## Evaluation

**Score: 85 / 100 — Passed ✓**

…
```

Build the evaluation block as markdown:

- **Score line**: `**Score: <hit> / <total> — Passed ✓**` or
  `**Score: <hit> / <total> — Not passed ✗**`
  with one sentence explaining why (mandatory miss, or score below
  threshold, or both).
- **Per-hint table**:
  | ✓/✗ | Points | Hint |
  | --- | ------ | ---- |
  | ✓   | 20     | Acknowledged the flicker is real before defending. |
  | ✗   | 0 / 15 | Did not name a plausible root-cause area. |
  | ✓   | 20     | Committed to root-cause report by Friday EOD. |
  | …   |        | (one row per hint) |
- **Criteria verdicts**: for each entry in `evaluation_criteria`, give
  pass / partial / fail with a one-sentence justification grounded in
  what the guest actually said.
- **2-3 concrete coaching suggestions** for next time. Specific:
  "When Tom asked 'what's the fix?', a stronger answer would have been
  'we have two hypotheses — PWM-frequency interaction and anti-flicker
  filter tuning — bench reproduction confirms which by tomorrow noon'."
  Not generic: "be more confident" is useless.

### 6. Record the result
Read `progress/<username>.progress.json`, append to
`roleplay_results[]` (create the array if it doesn't exist):

```json
{
  "scenario_id": "<id>",
  "persona_name": "<name>",
  "topic_id": "<copied from scenario, omit if not set>",
  "score": 85,
  "of": 100,
  "mandatory_hits": 3,
  "mandatory_total": 3,
  "passed": true,
  "turns": 11,
  "taken_at": "<ISO8601 of now>"
}
```

If `passed === true`, append the badge `roleplay-<scenario_id>` to
`badges[]` (skip if already present — guests can re-take a scenario;
badge is one-time).

Write the file back. Mention briefly to the guest that the result is
recorded ("Logged to your progress — `roleplay_results[]` now has 1
entry").

### 7. Offer next steps
Two concrete options:
- Re-take this scenario (to push the score / clear a missed mandatory).
- Try a different scenario from the library.

Do **not** auto-mark a ToC leaf as done from a roleplay result. The
passive-state rule applies — only the trainee confirms a leaf is done.

## What NOT to do

- **Do not leak the rubric** while the fence is open. The hints, points,
  mandatory flags, and evaluation criteria are the answer key. Showing
  them to the guest defeats the exercise.
- **Do not end the session silently.** If you reach an end condition,
  always emit the `<roleplay-end>` fence — never just drift into
  evaluator voice without it. The frontend rendering depends on the fence.
- **Do not modify `roleplay/<id>.roleplay.json` from a guest session.**
  Scenario edits go through the expert + `roleplay-author` skill.
- **Do not score from your training knowledge.** Score from the actual
  transcript: which hint did the guest hit, in which turn, with what
  words. If you can't point to a specific guest turn, the hint wasn't hit.
- **Do not break character** to coach mid-fence. If the guest asks for
  a hint ("am I doing this right?"), the persona shrugs it off
  ("I'm not here to coach you, I'm here for an explanation"). Coaching
  happens after `<roleplay-end>`.
- **Do not run two roleplays in one fence.** One scenario per fence.
  If the guest wants another, close the current one, evaluate, and
  open a new fence.
- **Do not exceed `max_turns`** — silent cap. When you hit it, the
  persona exits gracefully and you close the fence.
