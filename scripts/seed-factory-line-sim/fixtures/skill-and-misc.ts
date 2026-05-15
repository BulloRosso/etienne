/**
 * SKILL.md content, the .claude/CLAUDE.md role prompt, settings.json,
 * the seed insights/*.md, the event-handling.json + prompts.json
 * fixtures, and the workspace-level quick-action chip entry.
 */

import { TODAY } from './mission';

export const CLAUDE_MD = `# Factory Line Simulation — Claude project role

You are the **Line Quality Insights** agent for a 3-machine discrete
manufacturing line (CNC-5AX → DEBURR-HAND → QA-INSP).

Your job is to help shop-floor operators and shift leads understand
**what is hurting quality today and over the past few days**, by
combining four data sources: quality reports (xlsx), machine status
(json), production orders (json), and live MQTT events.

**Always**:
- Default the time window to **today and the past 7 days**. Refuse
  hindsight requests beyond that window.
- Cite concrete evidence: row numbers from quality reports, timeline
  entries from status JSONs, MQTT event timestamps. Never speculate
  beyond what the data supports.
- Use the wiki under \`wiki/topics/\` as your root-cause taxonomy:
  every claim should map to a root-cause page (e.g.
  \`root-cause-coolant-degradation\`).
- When you produce a useful insight, **emit it as a quick-action**
  (see the [line-quality-insights skill](.claude/skills/line-quality-insights/SKILL.md)
  for the procedure).

**Never**:
- Propose fixes ("change the coolant", "recalibrate vision"). Surface
  the signal and the evidence; the user decides the action.
- Modify production orders, quality reports, or status JSONs — they
  are upstream system-of-record.
`;

export const SETTINGS_JSON = {
  model: 'claude-opus-4-7',
  defaultSubagentModel: 'claude-sonnet-4-6',
  permissions: {
    deny: [
      'Bash(rm -rf:*)',
      'Bash(git push --force:*)',
    ],
    allow: [
      'Read(quality-reports/**)',
      'Read(status/**)',
      'Read(production-orders/**)',
      'Read(linedashboard/**)',
      'Read(insights/**)',
      'Read(wiki/**)',
      'Read(documents/**)',
      'Write(insights/**)',
    ],
  },
};

export const SKILL_MD = `---
name: line-quality-insights
description: Daily quality insights for the 3-machine factory line. Combines quality reports (xlsx), machine status (json), production orders (json), and MQTT events to surface root causes for the past 7 days. Emits useful findings as quick-action chips.
---

# Line Quality Insights

You are the Line Quality Insights agent. Use this skill whenever the user
asks about defects, root causes, machine status, order progress, or
recent MQTT alarms on the factory line.

## Process flow

\`\`\`
raw stock → CNC-5AX → DEBURR-HAND → QA-INSP → shipped
            (mill)    (deburr)      (inspect)
\`\`\`

Defects are **observed at QA-INSP** but most often **originate at CNC-5AX**.
Always trace upstream when reasoning about quality.

## Machine roles

| Machine | Role | Common origin of |
|---|---|---|
| CNC-5AX | 5-axis milling, coolant, chip evacuation | tool wear, coolant degradation, chip-jam, fixture drift, thermal drift, material lot variation |
| DEBURR-HAND | Manual deburring | edge defects from over/under-deburring |
| QA-INSP | Automated 3D vision inspection | vision calibration drift (rare but real) |

See \`wiki/topics/machine-cnc-5ax.md\` etc. for detail.

## Data source map

| When the user asks about… | Look at… |
|---|---|
| A specific defect, item, or PO's quality | \`quality-reports/*.xlsx\` (parse with \`office-and-pdf-documents\`) |
| What was happening on a machine on a given day | \`status/status_<MACHINE>_<DATE>.json\` |
| An order's planned routing / quantity / progress | \`production-orders/PO-*.json\` |
| Live alarms or recent telemetry | \`GET /api/external-events/factory-line-sim/messages/<topic>\` |
| Root-cause reasoning / how X usually shows up | \`wiki/topics/root-cause-*.md\` |

The wiki under \`wiki/topics/data-quality-reports-xlsx.md\`,
\`data-status-reports-json.md\`, and \`data-production-orders-json.md\`
documents the schema of each source.

## Default time window

**Today and the past 7 days only.** If the user asks about older history
("how did we do last quarter?"), explain that hindsight reports are out
of scope and offer to look at the recent window instead.

## What "useful insight" looks like

A useful insight chains:
1. A **specific quality observation** (defect cluster, scrap spike, missed due date)
2. **Origin evidence** from one or more data sources (status block, MQTT events, quality-report rows)
3. A **wiki root-cause attribution** (link to one of the \`root-cause-*\` pages)

Do **not** propose a fix. Surface the signal and the evidence.

## Emit-Insight procedure

When you produce a finding the user reacts to positively (or that is
clearly load-bearing — e.g. it answers "what was the worst day this
week"), persist it as a clickable quick-action:

### Step 1 — write the insights report

Write a markdown file under \`insights/\`:

\`\`\`
insights/insight-<YYYY-MM-DD>-<short-slug>.md
\`\`\`

Use this front-matter shape so future sessions can find it:

\`\`\`markdown
---
title: <one-line title — fits in a chip label>
date: ${TODAY}
window: <e.g. "TODAY-2 .. TODAY">
machines: [CNC-5AX]
orders: [PO-1003]
root_cause: root-cause-coolant-degradation
severity: <minor | major | critical>
---

# <title>

<body — 4-10 paragraphs. Cite report rows, status timeline entries,
MQTT event timestamps. Link to wiki pages with [text](../wiki/topics/...).>
\`\`\`

### Step 2 — register the quick-action chip

\`/api/quick-actions\` is a workspace-level store; \`POST\` replaces the
entire list. To **add** an entry, first \`GET /api/quick-actions\`,
append, then \`POST\` the merged array. Each entry must include the
required \`prompt\` field (used as a fallback if \`previewFile\` is
unreachable):

\`\`\`json
{
  "id": "insight-<short-slug>",
  "title": "<one-line title>",
  "prompt": "Open the <slug> insight.",
  "icon": "FaLightbulb",
  "project": "factory-line-sim",
  "previewFile": "insights/insight-<...>.md",
  "sortOrder": <epoch_ms>
}
\`\`\`

\`icon\` follows react-icons naming (\`FaLightbulb\`, \`MdWarning\`, etc.).

If writing the insights file failed, set
\`previewFile\` to \`linedashboard/cnc-dashboard.html\` so the chip still
opens something useful.

The QuickActions strip auto-refreshes when the file changes — no extra
event dispatch is needed from this skill.
`;

export const SEED_INSIGHT_MD = `---
title: Coolant degradation drove PO-1003 surface defects
date: ${TODAY}
window: 2026-05-13 .. 2026-05-14
machines: [CNC-5AX]
orders: [PO-1003]
root_cause: root-cause-coolant-degradation
severity: major
---

# Coolant degradation drove PO-1003 surface defects

PO-1003 (Acme Aerospace, TURB-AL75-65X22, IT7) finished yesterday with
**9 defects in its second-day inspection batch** out of 52 inspected
items: 6 \`surface_finish\` (Ra > 1.6 µm) and 3 \`surface_staining\`. This
is the largest single-PO defect cluster of the past 7 days.

## Origin

The defective parts were machined on **2026-05-13** on **CNC-5AX**.
That day's status JSON (\`status/status_CNC-5AX_2026-05-13.json\`)
shows a **\`degraded\` block from 12:45 to 15:45** with reason
\`coolant_quality_degraded\` — the machine kept running at reduced
surface-finish quality.

Three matching MQTT \`coolant_temp_high\` events on
\`cnc-5ax/telemetry\`:

| Time | Temperature | Threshold |
|---|---|---|
| 13:08 | 67.2 °C | 65 °C |
| 14:12 | 69.0 °C | 65 °C |
| 15:30 | 66.3 °C | 65 °C |

Per the [coolant spec sheet](../wiki/sources/coolant-spec-sheet.md),
65 °C is where surface-finish quality begins to degrade measurably.

## Possible contributor

PO-1003 used **Al-7075 Lot B** (see
\`documents/material-cert-al-7075-lot-B.md\`). That lot's hardness is
right at the spec ceiling (HV 172 vs ceiling 170) and is documented to
elevate spindle load by ~8 % vs Lot A. More cutting energy → more sump
heating. The coolant was *not* due for change (only ~38 hours into the
120-hour service life), so the trigger was thermal not contamination.

## Pattern (for future watch)

\`coolant_temp_high\` crossing 65 °C is a leading indicator for
\`surface_finish\` defects on the *next* QA-INSP run of those parts. A
targeted coolant check at the first 65 °C event would have caught this
2–3 hours earlier.

Root-cause taxonomy: [root-cause-coolant-degradation](../wiki/topics/root-cause-coolant-degradation.md).
`;

export const SEED_INSIGHT_FILENAME = `insight-${TODAY}-coolant-po1003-surface.md`;

// Note: `prompt` is required by QuickActionDto but ignored when `previewFile`
// is set (QuickActions.jsx checks previewFile first). Provide a sensible
// fallback prompt anyway so the chip degrades gracefully if the file is
// removed.
export const QUICK_ACTION_INSIGHT = {
  id: 'insight-coolant-po1003',
  title: 'Coolant → surface defects (PO-1003)',
  prompt: 'Open the seeded coolant-degradation insight for PO-1003.',
  icon: 'FaLightbulb',
  project: 'factory-line-sim',
  previewFile: `insights/${SEED_INSIGHT_FILENAME}`,
  sortOrder: Date.now(),
};

export const QUICK_ACTION_DASHBOARD = {
  id: 'line-dashboard',
  title: 'Line Dashboard',
  prompt: 'Open the line quality dashboard.',
  icon: 'MdDashboard',
  project: 'factory-line-sim',
  previewFile: 'linedashboard/cnc-dashboard.html',
  sortOrder: Date.now() - 1000,
};

export const EVENT_HANDLING_JSON = {
  rules: [
    {
      id: 'rule-coolant-temp-high',
      name: 'Coolant temperature high — trigger insight pass',
      enabled: true,
      condition: {
        type: 'simple',
        event: { topic: 'cnc-5ax/telemetry', payloadType: 'coolant_temp_high' },
      },
      action: { type: 'prompt', promptId: 'insight-from-event' },
      createdAt: `${TODAY}T08:00:00Z`,
      updatedAt: `${TODAY}T08:00:00Z`,
    },
    {
      id: 'rule-conveyor-jam',
      name: 'Conveyor jam — notify shift lead',
      enabled: true,
      condition: {
        type: 'simple',
        event: { topic: 'cnc-5ax/chip-evacuation', payloadType: 'conveyor_jam_detected' },
      },
      action: { type: 'prompt', promptId: 'notify-jam' },
      createdAt: `${TODAY}T08:00:00Z`,
      updatedAt: `${TODAY}T08:00:00Z`,
    },
  ],
};

export const PROMPTS_JSON = {
  prompts: [
    {
      id: 'insight-from-event',
      name: 'Insight from event',
      body:
        'A coolant_temp_high event just fired. Check the past 4 hours of QA-INSP defect rows for surface_finish or surface_staining defects. If any spike is visible, write an insights/*.md report and emit it as a quick-action per the line-quality-insights skill.',
    },
    {
      id: 'notify-jam',
      name: 'Notify chip-jam',
      body:
        'A conveyor_jam_detected event just fired on CNC-5AX. Confirm the bin status, check whether any PO is currently being machined, and write a brief insights/*.md note. Emit a quick-action so the shift lead can read it.',
    },
  ],
};
