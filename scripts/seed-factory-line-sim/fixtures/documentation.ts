/**
 * documentation.md — high-level, non-technical overview of what the
 * agent does for quality monitoring and root-cause analysis on the line.
 *
 * Written to <project>/documentation.md and registered as an
 * auto-open document in .etienne/user-interface.json so it pops up
 * in the preview pane the first time the project is opened.
 */

export const DOCUMENTATION_MD = `# Quality Insights — Line 3 / MCH Werk D

Welcome to the line monitoring agent. This page explains what it does
for you in plain language — no setup needed, just open the dashboards
and ask questions.

## What is this for?

Three machines on Line 3 turn raw bar stock into finished aerospace and
maritime parts. Things go wrong: tools wear out, coolant gets too hot, a
chip bin overflows, a vision camera drifts out of focus. The agent
watches all of this for you and can answer two questions whenever you
ask:

1. **What is hurting our quality this week?**
2. **Why is this production order taking longer than expected?**

You don't have to dig through Excel files, machine logs, or alarm
history. Ask the agent and get a grounded answer with the evidence
attached.

## What the agent does for you

### It watches the whole line at once

Every machine sends signals — when it ran, when it stopped, why it
stopped, what the temperature was, what tool was loaded. Operators
upload daily quality reports. The agent reads all of this for the past
seven days and keeps the picture up to date.

### It connects the dots between sources

Quality problems usually show up at inspection (the last machine), but
they almost always start somewhere upstream. The agent traces backwards
for you. A surface-finish defect noticed Wednesday morning? It can
probably tell you the coolant ran hot Tuesday afternoon and which
specific production order was on the machine then.

### It explains the "why", not just the "what"

The agent doesn't just say "PO-1003 had defects." It says **what**
happened (6 surface-finish defects on the second-day inspection),
**when** it happened (the affected parts were machined between 12:45
and 15:45 the day before), **what triggered it** (coolant temperature
crossed 65°C three times that afternoon), and **what kind of root
cause** that points to (coolant degradation — see the wiki page on
that pattern).

### It surfaces useful findings as one-click insight reports

When the agent finds something worth your attention, it writes a short
report and adds a chip to your toolbar. Click the chip and you see the
report — no need to remember the conversation that produced it. Reports
stay around so the next shift can read them too.

## What it will NOT do

- **It does not propose fixes.** "Change the coolant" or "recalibrate
  the camera" are operator decisions. The agent gives you the signal and
  the evidence; you decide the action. This is by design.
- **It does not look back further than 7 days.** Hindsight reports older
  than that are out of scope. If you need a quarterly view, that's a
  different tool.
- **It does not change production data.** Quality reports, machine
  status files, and production orders are read-only to the agent.

## How to use it

### To check on quality
Ask in chat: *"What was the worst day for quality this week?"* or
*"How is PO-1004 tracking?"*

### To browse the line
Open **Line Dashboard** (in the toolbar) for a cross-cutting view of
all production orders, sortable and filterable by defect category, cell,
or machine. Open **Line Timeline** to see one day at a time, with
machine state, production-order assignment, and quality findings on
parallel rows.

### To see live events
The dashboards refresh themselves every 20 seconds. If you start the
event simulator (in the project's \`event-simulator/\` folder), you'll
see new MQTT events appear in the side panel of the timeline view.

### To dig into a specific incident
The agent maintains a wiki of root-cause patterns. When it traces a
defect back to a cause, it links to the relevant wiki page. Browse the
wiki to learn how each pattern looks in the data — useful when training
a new shift lead.

## What the line looks like

\`\`\`
  raw stock ─▶ [CNC-5AX] ─▶ [DEBURR-HAND] ─▶ [QA-INSP] ─▶ shipped
                Cell A         Cell B          Cell C
\`\`\`

- **CNC-5AX** does the milling. Most defects originate here. Coolant,
  chips, fixture clamps, and tool wear all live in this machine.
- **DEBURR-HAND** is the manual deburring station. Bottleneck risk —
  if CNC slows down, this station goes idle.
- **QA-INSP** is the automated 3D vision inspection. Where defects are
  *first observed*, but rarely where they *originate*.

## What's already in the project

- One week of seeded data (8 days, 5 production orders) including:
  - **Two coolant + chip incidents**: a chip-evacuation jam and a
    coolant degradation episode you can investigate end-to-end.
  - **Two tool-break incidents**: one on a steel run, one on aluminium —
    different signatures, same kind of pattern.
- A dashboard chip pointing at one **pre-seeded insight** so you can
  click and see what an insight report looks like before producing your
  own.
- Four **decision graphs** in the Decision Support Studio — each
  describes a "trigger → check → action" pattern the agent can suggest
  when a matching event fires.

Open the **Line Dashboard** chip to start, or just ask the chat
*"What's hurting quality this week?"*
`;
