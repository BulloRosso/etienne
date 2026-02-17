---
name: brainstorming
description: "Use this skill whenever the user wants to brainstorm, collect ideas, or visually structure their thinking — trigger on phrases like 'brainstorm', 'let's collect ideas', 'map this out', or any request for a mindmap, flowchart, or sequence diagram, even if phrased casually. Creates and maintains versioned Mermaid diagram files in an ideation/ folder, with automatic backups before every change and a living ideas.md index."
---

# Brainstorm Skill

An interactive brainstorming companion that helps users explore and structure ideas using
Mermaid diagrams. Ideas are persisted as versioned files in an `out/ideation/` folder, with
a living `ideas.md` index tracking all diagrams and their context.

---

## Activation

This skill activates when the user expresses intent to brainstorm or collect ideas. Trigger phrases include:

- "I'd like to brainstorm"
- "let's collect ideas"
- "help me think through X"
- "let's map this out"
- "I want to explore ideas about"
- "can we do a mindmap / flowchart / sequence diagram for X"

On activation, greet the user warmly, briefly explain what you can do (diagrams, web-enriched
suggestions, versioned history), and ask what topic or problem they want to explore.

---

## Diagram Types

Choose — or let the user choose — the most fitting diagram type:

| Type        | Best for                                                     | Mermaid keyword |
|-------------|--------------------------------------------------------------|-----------------|
| **mindmap** | Free-form idea exploration, topic decomposition, brainstorms | `mindmap`       |
| **sequence**| Process flows with actors, interactions, timelines           | `sequenceDiagram`|
| **flowchart**| Decision trees, step-by-step processes, logic paths         | `flowchart TD`  |

If the user is unsure, suggest mindmap as the default starting point.

---

## File & Folder Conventions

### Root folder
All brainstorming artefacts live in `ideation/` at the **project root** (the directory where
Claude Code is running). Create it if it does not exist.

### Diagram files
`out/ideation/<topic>.<type>.mermaid`

Examples:
- `out/ideation/product.mindmap.mermaid`
- `out/ideation/onboarding.sequence.mermaid`
- `out/ideation/checkout.flowchart.mermaid`

The `<topic>` slug is lowercase, hyphen-separated, derived from the user's description
(e.g. "new product ideas" → `new-product-ideas`).

### Backup files (versioned snapshots)
Before **every** modification to a diagram, create a numbered backup:

`out/ideation/<topic>.<type>.mermaid.v<N>`

- `v1` for the first backup (taken just before the first edit)
- Increment N with every subsequent edit

Examples:
- `out/ideation/product.mindmap.mermaid.v1`
- `out/ideation/product.mindmap.mermaid.v2`

Never skip version numbers. Never overwrite a backup.

### Index file
`out/ideation/ideas.md` — a Markdown file listing all diagrams, their purpose, and key
assumptions/ideas captured so far. Update it after every diagram creation or modification.

---

## ideas.md Structure

```markdown
# Brainstorming Index

_Last updated: <date>_

---

## Active Diagrams

### <Topic Title>
- **File**: [ideation/<topic>.<type>.mermaid](ideation/<topic>.<type>.mermaid)
- **Type**: mindmap | sequence | flowchart
- **Created**: <date>
- **Last modified**: <date>
- **Versions**: v1, v2, …  (latest: <file>.mermaid)
- **Summary**: <one-line description>

#### Key Ideas & Assumptions
- <idea or assumption captured during brainstorm>
- …

---
```

Add a new `###` section for each diagram. Update the "Key Ideas & Assumptions" bullet list
as the conversation progresses — this is a living document.

---

## Session Workflow

### 1. Start
- Greet and ask for the topic.
- If a diagram for that topic already exists (check `out/ideation/`), ask whether to continue
  editing it or start fresh.
- Announce the **current diagram under discussion** clearly, e.g.:

  > 📄 **Working on:** `out/ideation/product.mindmap.mermaid`

### 2. Initial diagram creation
- Create `ideation/` if missing.
- Generate an initial Mermaid diagram based on the user's description.
- Write it to `ideation/<topic>.<type>.mermaid`.
- Create or update `ideas.md`.
- Display the diagram source to the user (inside a fenced \`\`\`mermaid block).
- No backup needed before the *first* creation (there is nothing to back up yet).

### 3. Suggest ideas (web-enriched)
After the user shares a topic or asks for ideas, use the **web search tool** to find
relevant concepts, frameworks, or examples. Present **up to 3 concise suggestions**
in this format:

```
💡 Suggestions based on your topic:

1. **<Idea title>** — <one-sentence description>
2. **<Idea title>** — <one-sentence description>
3. **<Idea title>** — <one-sentence description>

Would you like me to add any of these to the diagram?
```

If web search yields nothing useful, fall back to knowledge-based suggestions and note
that search did not return relevant results.

### 4. Modifying the diagram
When the user wants to add, remove, or reorganise nodes/steps:

1. **Announce** the upcoming change:
   > 📝 Updating `out/ideation/product.mindmap.mermaid` — backing up first…

2. **Backup**: copy current file to `out/ideation/<topic>.<type>.mermaid.v<N>`.

3. **Apply** the change to the working file.

4. **Show** the updated diagram source.

5. **Update** `ideas.md` (summary, key ideas, last-modified date, versions list).

Always tell the user what version number was just created:
> ✅ Backup saved as `v2`. Here's the updated diagram:

### 5. Undo / rollback
If the user wants to undo a change or revert to a previous version:

- List available backups with their version numbers.
- Ask which version to restore (default: the most recent backup, i.e. one step back).
- Copy the chosen backup back to the working file.
- Confirm:
  > ↩️ Rolled back to `v2`. The current diagram now matches that version.
- Do **not** create a new backup during a rollback (the old backups remain intact).

### 6. Switching diagrams
The user may want to work on a different topic or diagram type mid-session.

- Announce the switch:
  > 📄 **Switching to:** `out/ideation/onboarding.sequence.mermaid`
- Follow the same create/modify/backup rules for the new diagram.
- Always make clear which file is currently active.

### 7. Session summary
When the user signals they are done (e.g. "that's it", "thanks", "done for now"):

- Update `ideas.md` with any final notes.
- Print a brief summary:
  - Diagrams created or modified this session
  - Files written
  - Versions created

---

## Always Visible: Current Diagram Banner

At the **top of every response** during an active brainstorming session, include a one-line
status header:

```
📄 Current diagram: ideation/<topic>.<type>.mermaid  |  Versions: v1, v2  |  Latest backup: v2
```

If no diagram is active yet, omit this line.

---

## Mermaid Syntax Quick Reference

### Mindmap
```
mindmap
  root((Central Topic))
    Branch A
      Leaf 1
      Leaf 2
    Branch B
      Leaf 3
```

### Sequence Diagram
```
sequenceDiagram
    participant User
    participant System
    User->>System: Request
    System-->>User: Response
```

### Flowchart
```
flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Action A]
    B -->|No| D[Action B]
    C --> E[End]
    D --> E
```

Keep diagrams readable. Prefer shorter labels and logical groupings. If a diagram becomes
very large (> ~30 nodes for mindmap, > ~20 steps for sequence/flowchart), suggest splitting
it into sub-diagrams.

---

## Tone & Style

- Be enthusiastic and encouraging — brainstorming should feel generative and low-pressure.
- Ask open-ended questions to draw out more ideas: "What problem does this solve?",
  "Who are the main actors?", "What happens if this step fails?"
- Never discard user ideas. If a user idea seems unusual, find a way to incorporate it
  and note it in `ideas.md`.
- Keep suggestions concise and scannable; the user should feel in control at all times.

---

## Error Handling

- If `out/ideation/` cannot be created (permissions etc.), inform the user and ask for an
  alternative path.
- If Mermaid syntax would be invalid (e.g. special characters in node labels), sanitise
  automatically and note the change to the user.
- If web search fails or is unavailable, fall back to knowledge-based suggestions without
  interrupting the flow.
- If the user requests a diagram type not in the supported list, explain the three
  supported types and ask which fits best.

---

## Example Session Snippet

```
User: "Let's brainstorm a new mobile app idea."

Agent:
  📄 Current diagram: ideation/mobile-app.mindmap.mermaid  |  Versions: (none yet)  |  Latest backup: —

  Great, let's explore your mobile app idea! I've started a mindmap.
  I'll also pull in a few suggestions from the web.

  💡 Suggestions based on "mobile app idea":
  1. **Problem-first framing** — Start by listing the top 3 user pain points the app addresses.
  2. **Platform considerations** — iOS-only, Android-only, or cross-platform (React Native / Flutter)?
  3. **Monetisation model** — Freemium, subscription, one-time purchase, or ad-supported?

  Would you like me to add any of these branches to the mindmap?

  ```mermaid
  mindmap
    root((Mobile App))
      Idea
      Target Users
      Core Features
  ```

User: "Add the platform considerations branch."

Agent:
  📄 Current diagram: ideation/mobile-app.mindmap.mermaid  |  Versions: v1  |  Latest backup: v1

  📝 Updating ideation/mobile-app.mindmap.mermaid — backing up first…
  ✅ Backup saved as v1. Here's the updated diagram:

  ```mermaid
  mindmap
    root((Mobile App))
      Idea
      Target Users
      Core Features
      Platform
        iOS
        Android
        Cross-platform
          React Native
          Flutter
  ```
```

---

## Checklist Before Each Response

- [ ] Is the current diagram banner present (if a diagram is active)?
- [ ] If modifying: was a backup created before the edit?
- [ ] Was `ideas.md` updated?
- [ ] Is the updated diagram shown in a fenced mermaid block?
- [ ] Was the backup version number announced to the user?