/**
 * The README.md written into the project root.
 */

import { TODAY } from './mission';

export const README_MD = `# Factory Line Simulation

A 3-machine discrete-manufacturing line (CNC mill → manual deburring →
3D vision inspection) seeded with a week of operational data, two known
incidents, a streaming MQTT event source, two HTML dashboards, a
project Skill, and a hand-authored decision graph.

The point of this project is to demonstrate **multi-source quality
insights**: you can ask the chat skill questions like "what was the
worst day for quality this week, and why?" and it will combine
quality-report rows, machine-status timelines, production-order
metadata, and live MQTT telemetry to give you a grounded answer.

## What's seeded

\`\`\`
.claude/                 — role + project skill (line-quality-insights)
.etienne/                — 3 chat sessions, event-handling rules, prompts
wiki/                    — 20 pages: line, machines, root causes, schemas
documents/               — 8 RAG-indexed docs: manuals, specs, certs, SOP
production-orders/       — 5 orders (PO-1001..PO-1005)
status/                  — 8 days × 3 machines = 24 daily JSON status files
quality-reports/         — 6 inspector-uploaded XLSX files
linedashboard/           — 2 HTML dashboards + JSON data + 3 machine PNGs
insights/                — 1 seed insights report (more produced in chat)
decision-graphs/         — 1 hand-authored coolant-degradation graph
event-simulator/         — standalone TS service (not auto-started)
\`\`\`

## The two seeded incidents

The week is mostly clean, with two days where things went wrong. They're
the playground for the chat skill:

| Day | Machine | Incident | Surfaces as |
|---|---|---|---|
| ${TODAY} − 4 | CNC-5AX | Chip-bin overflow → conveyor jam → tool damage | 4 dimensional + 2 edge defects on PO-1005 |
| ${TODAY} − 2 | CNC-5AX | Coolant temperature elevated for 3 h (degraded state) | 6 surface_finish + 3 surface_staining defects on PO-1003 |

The remaining 6 days have routine breaks and tool changes only.

## The line

\`\`\`
  raw stock ─▶ [CNC-5AX] ─▶ [DEBURR-HAND] ─▶ [QA-INSP] ─▶ shipped
                Cell A         Cell B          Cell C
\`\`\`

- **CNC-5AX** — 5-axis mill. Coolant + chip-evacuation. Origin of most defects.
- **DEBURR-HAND** — manual deburring station. Operator-paced.
- **QA-INSP** — automated 3D vision. Where every defect is *first observed*.

See \`wiki/topics/line-overview.md\` for the full picture.

## How to use

### 1. Open the cross-cutting dashboard
Navigate to \`linedashboard/cnc-dashboard.html\` in the IDE file tree. It
opens in the LiveHTMLPreview pane. Click any bar to drill in;
selections persist across reloads via the \`workspace:write\` bridge.

### 2. Open the daily timeline
\`linedashboard/line-timeline.html\` shows one day of activity per
machine: production-order assignment, machine state, and quality
findings, plus the latest 10 MQTT events on the right. Pick a different
date from the day picker.

### 3. Ask the skill a question
In the project's chat:

> What was the worst day for quality this past week and why?

The skill (\`.claude/skills/line-quality-insights/SKILL.md\`) knows where
to look. It will cite specific QA-INSP rows, status timeline entries,
and MQTT events from the seeded data, and link to the appropriate
\`root-cause-*\` page in the wiki.

When the skill produces a useful insight, it writes a
markdown report to \`insights/\` and registers a clickable chip in the
**Quick Actions** bar (top of the workspace UI). Clicking the chip
opens the report in the preview pane. One such chip is pre-seeded:
"Coolant → surface defects (PO-1003)".

### 4. Stream live MQTT events
\`\`\`bash
cd workspace/factory-line-sim/event-simulator
npm install
cp .env.example .env
npm start                              # routine telemetry, one event / 10 s
npm start -- --burst chip-jam          # coordinated incident burst
npm start -- --burst coolant-degradation
npm start -- --burst vision-recalibration
\`\`\`

Events show up immediately in the line-timeline dashboard's "latest
MQTT events" panel.

### 5. View the decision graph
Open the decision-support UI for this project. The hand-authored graph
"Coolant degradation response" (\`decision-graphs/coolant-degradation-response.json\`)
shows the trigger → condition → action flow that the
\`line-quality-insights\` skill suggests for the seeded coolant pattern.

## Inputs the skill consumes

| Source | Format | Path | Documented at |
|---|---|---|---|
| Quality reports | xlsx | \`quality-reports/\` | \`wiki/topics/data-quality-reports-xlsx.md\` |
| Machine status | json | \`status/\` | \`wiki/topics/data-status-reports-json.md\` |
| Production orders | json | \`production-orders/\` | \`wiki/topics/data-production-orders-json.md\` |
| MQTT events | live | \`/api/external-events/factory-line-sim/messages/<topic>\` | \`wiki/topics/mqtt-event-catalog.md\` |

## Replacing the placeholder machine images

\`linedashboard/images/cnc-5ax.png\`, \`deburr-hand.png\`, and \`qa-insp.png\`
are 500×400 placeholders generated by the seed script. Replace them
with real machine photos at the same dimensions and filenames; no
other changes needed — the line-timeline dashboard picks them up
automatically.

## Out of scope

- Proposing fixes ("change the coolant", "recalibrate vision"). The
  skill surfaces the signal and the evidence; the user decides the
  action.
- Hindsight reports older than 7 days.
- A real MQTT broker — the simulator pushes via HTTP. Add a broker
  later if needed; the backend's external-events module supports both
  modes.
- Per-part dimensional drift modelling (sub-micron analysis).

## Re-seeding from scratch

\`\`\`bash
cd c:/Data/GitHub/claude-multitenant
# 1. delete the project from disk:
rm -rf workspace/factory-line-sim
# 2. delete from Chroma (RAG) + Quadstore (KG) via the backend admin UI
# 3. re-run:
npx tsx scripts/seed-factory-line-sim/seed-factory-line-sim.ts
\`\`\`

The seed script writes everything fresh and runs the dreaming pipeline
once at the end so a strategy candidate appears immediately.
`;
