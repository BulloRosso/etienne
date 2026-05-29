---
name: quiz-generator
description: |
  Generate a topic-grounded multiple-choice quiz for the trainee at the
  end of a main curriculum chapter. Use when a guest has marked every
  leaf of a top-level ToC node (e.g. "1") as done, or explicitly asks
  for a quiz on a topic they are currently working through. Renders the
  quiz as a standalone MUI-React HTML file under
  out/quizzes/<topic-slug>.quiz.html and emits a <preview:...> tag so
  the page opens in the preview pane.
version: 1.0
trigger:
  - main topic completion (top-level ToC node fully done)
  - explicit request: "quiz me on X", "give me the section N quiz"
roles:
  - guest
---

# Quiz generator

You build short, grounded multiple-choice quizzes that lock a topic in
for the trainee.

## When to invoke

- Pro-actively, the moment a top-level ToC node hits all-done in the
  guest's `progress/<username>.progress.json`.
- On explicit request: "quiz me on 3.1", "ich will den Quiz zu Topic 2",
  "give me a check on AUTOSAR".

Do **not** invoke when:
- the trainee is mid-explanation of a single leaf (use an inline
  one-MCQ check instead, recorded under `qa[]` with `kind: "check"`),
- the trainee just took a quiz on the same topic in the last 24 hours.

## How to build the quiz

### 1. Pick the source material
- The wiki page corresponding to the top-level topic (e.g.
  `wiki/topics/3-standards-und-prozesse.md`) plus every leaf wiki page
  under it.
- All RAG documents tagged or referenced by those wiki pages.
- The trainee's recorded Q/A on those leaves — questions they have
  already wrestled with deserve a slightly different phrasing in the
  quiz, not the same one.

### 2. Compose 4-9 questions
Mix of difficulty: roughly one-third surface recall (definitions), one-
third application ("which colleague would you ask…", "which tool…"),
one-third trap-recognition (common Anfänger-Fehler turned into a
distractor).

**Every question must be groundable** in a wiki page or a RAG document
that exists in the project. If you cannot ground a question, drop it
rather than invent.

### 3. Answer options
- 4 options per question.
- Exactly one correct.
- Distractors should be plausible (use neighbouring concepts, not
  random fillers).
- Avoid "all of the above" / "none of the above" — they reward
  pattern-matching, not topic understanding.

### 4. Explanations
Each question carries a one-paragraph explanation, shown after the
trainee answers, that:
- says why the correct answer is correct,
- in the failed case (when distractor is plausible) briefly names why
  it is *not* the right answer,
- ends with the wiki page / RAG document the trainee should re-read if
  they got it wrong.

## How to render

- Write the file to `out/quizzes/<topic-slug>.quiz.html` where
  `<topic-slug>` is the top-level ToC slug (e.g. `3-standards-und-prozesse`).
- Use MUI React via CDN (no bundling) — model on
  `out/quizzes/1-your-role.quiz.html` (pre-seeded example).
- Blue theme (`#1565c0` accent, `#E3F2FD` highlight) to match the
  ProgressViewer.
- Quiz container vertically + horizontally centred; max width 640 px.
- Progress bar at top, score chip in the corner.
- Final card shows score, encouraging tone, advice to re-read or
  re-take.

## After rendering

1. Emit `<preview:out/quizzes/<topic-slug>.quiz.html>` in your reply
   so the page opens in the preview pane.
2. Tell the trainee briefly what you did ("I built a 7-question quiz
   on Topic 3 from the wiki + RAG material — see preview").
3. Wait for them to play it. **Do not auto-mark the topic as done**
   from the quiz result — that's still the trainee's call.
4. When they tell you the score, append a `quiz_results[]` entry to
   their `progress/<username>.progress.json`:
   ```json
   { "topic_id": "3", "score": 6, "of": 7, "taken_at": "<iso8601>" }
   ```
5. If score ≥ 85 %, award the `completionist-<N>` badge (where N is
   the topic id).

## What NOT to do

- Do not generate quiz content from your own training knowledge if the
  wiki + RAG are silent. Tell the trainee: "I cannot ground a quiz on
  this topic without expert content in the wiki — would you like me to
  flag it for the expert?"
- Do not auto-record a quiz as "the trainee did this" without the
  trainee actually confirming a score. The HTML quiz is interactive but
  not connected back to the progress file directly.
- Do not exceed 9 questions. Past 9, the trainee zones out and the
  quiz becomes counterproductive.
- Do not translate the quiz on the fly. Match the trainee's baseline
  language (German if `baseline.language == 'de'`, English otherwise).
  Pre-seeded section-1 quiz is in German because the demo user's
  baseline is "English for deep dives, German is fine for surface" —
  section 1 is surface.
