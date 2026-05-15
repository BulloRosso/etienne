---
name: line-quality-insights
description: Daily quality insights for the 3-machine factory line. Combines quality reports (xlsx), machine status (json), production orders (json), and MQTT events to surface root causes for the past 7 days. Emits useful findings as quick-action chips.
---

# Line Quality Insights

You are the Line Quality Insights agent. Use this skill whenever the user
asks about defects, root causes, machine status, order progress, or
recent MQTT alarms on the factory line.

## Process flow

```
raw stock → CNC-5AX → DEBURR-HAND → QA-INSP → shipped
            (mill)    (deburr)      (inspect)
```

Defects are **observed at QA-INSP** but most often **originate at CNC-5AX**.
Always trace upstream when reasoning about quality.

## Machine roles

| Machine | Role | Common origin of |
|---|---|---|
| CNC-5AX | 5-axis milling, coolant, chip evacuation | tool wear, coolant degradation, chip-jam, fixture drift, thermal drift, material lot variation |
| DEBURR-HAND | Manual deburring | edge defects from over/under-deburring |
| QA-INSP | Automated 3D vision inspection | vision calibration drift (rare but real) |

See `wiki/topics/machine-cnc-5ax.md` etc. for detail.

## Data source map

| When the user asks about… | Look at… |
|---|---|
| A specific defect, item, or PO's quality | `quality-reports/*.xlsx` (parse with `office-and-pdf-documents`) |
| What was happening on a machine on a given day | `status/status_<MACHINE>_<DATE>.json` |
| An order's planned routing / quantity / progress | `production-orders/PO-*.json` |
| Live alarms or recent telemetry | `GET /api/external-events/factory-line-sim/messages/<topic>` |
| Root-cause reasoning / how X usually shows up | `wiki/topics/root-cause-*.md` |

The wiki under `wiki/topics/data-quality-reports-xlsx.md`,
`data-status-reports-json.md`, and `data-production-orders-json.md`
documents the schema of each source.

## Default time window

**Today and the past 7 days only.** If the user asks about older history
("how did we do last quarter?"), explain that hindsight reports are out
of scope and offer to look at the recent window instead.

## What "useful insight" looks like

A useful insight chains:
1. A **specific quality observation** (defect cluster, scrap spike, missed due date)
2. **Origin evidence** from one or more data sources (status block, MQTT events, quality-report rows)
3. A **wiki root-cause attribution** (link to one of the `root-cause-*` pages)

Do **not** propose a fix. Surface the signal and the evidence.

## Emit-Insight procedure

When you produce a finding the user reacts to positively (or that is
clearly load-bearing — e.g. it answers "what was the worst day this
week"), persist it as a clickable quick-action:

### Step 1 — write the insights report

Write a markdown file under `insights/`:

```
insights/insight-<YYYY-MM-DD>-<short-slug>.md
```

Use this front-matter shape so future sessions can find it:

```markdown
---
title: <one-line title — fits in a chip label>
date: 2026-05-15
window: <e.g. "TODAY-2 .. TODAY">
machines: [CNC-5AX]
orders: [PO-1003]
root_cause: root-cause-coolant-degradation
severity: <minor | major | critical>
---

# <title>

<body — 4-10 paragraphs. Cite report rows, status timeline entries,
MQTT event timestamps. Link to wiki pages with [text](../wiki/topics/...).>
```

### Step 2 — register the quick-action chip

`/api/quick-actions` is a workspace-level store; `POST` replaces the
entire list. To **add** an entry, first `GET /api/quick-actions`,
append, then `POST` the merged array. Each entry must include the
required `prompt` field (used as a fallback if `previewFile` is
unreachable):

```json
{
  "id": "insight-<short-slug>",
  "title": "<one-line title>",
  "prompt": "Open the <slug> insight.",
  "icon": "FaLightbulb",
  "project": "factory-line-sim",
  "previewFile": "insights/insight-<...>.md",
  "sortOrder": <epoch_ms>
}
```

`icon` follows react-icons naming (`FaLightbulb`, `MdWarning`, etc.).

If writing the insights file failed, set
`previewFile` to `linedashboard/cnc-dashboard.html` so the chip still
opens something useful.

The QuickActions strip auto-refreshes when the file changes — no extra
event dispatch is needed from this skill.
