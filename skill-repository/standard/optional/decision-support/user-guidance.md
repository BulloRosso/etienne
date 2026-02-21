# Decision Support — Quick Start

Welcome! This skill helps you turn real-world situations into structured decision plans. You describe what's happening on your plant floor, and the system builds an actionable decision graph that connects conditions to responses — so the right thing happens at the right time.

---

## What is a decision graph?

Think of it as a flowchart for automated responses. It has four building blocks:

- **Trigger** — what kicks things off (e.g. a sensor reading goes out of range)
- **Condition** — what to check (e.g. "is pressure above 150 PSI?")
- **Action** — what to do about it (e.g. schedule maintenance, shut down equipment)
- **Outcome** — the result you expect (e.g. "system is safe, maintenance is scheduled")

The graph connects these in order: trigger leads to conditions, conditions lead to actions, actions lead to outcomes. Conditions branch into "true" and "false" paths, so different situations get different responses.

---

## Getting started

Open the **Decision Support Studio** from the dashboard and describe your situation in the chat panel on the left. Just use plain language — no need for technical terms.

> *"The compressor on Unit 4 has been vibrating more than usual and the pressure gauge is reading higher than normal. What should we do?"*

The system will analyze your description, look at the equipment and sensors already registered in your project, and propose a decision graph.

---

## A walkthrough: compressor anomaly at Plant Floor

Here is a step-by-step example of how a typical session works.

### Step 1 — Describe the situation

Type something like:

> *"Unit 4 compressor is showing high vibration readings and we've had two alerts this week. Pressure is creeping above 150 PSI. I'm worried we might need to shut it down."*

### Step 2 — Review the suggestion

The system responds with a decision graph on the canvas. In this case it might suggest:

- **Condition 1**: Pressure on sensor-unit4 exceeds 150 PSI
- **Condition 2**: Two or more open alerts on the same asset
- **Action 1**: Schedule maintenance for the next available window (fires when Condition 2 is true)
- **Action 2**: Emergency shutdown of Compressor Unit 4 (fires when both conditions are true)

The graph appears visually on the canvas — purple nodes for triggers, green for conditions, red for actions, blue for outcomes.

### Step 3 — Refine if needed

If anything doesn't look right, just tell the system:

> *"Change the pressure threshold to 200 PSI"*
> *"Make the maintenance window immediate instead of next available"*
> *"Add a notification to the ops team when shutdown happens"*

The graph updates automatically with each change.

### Step 4 — Save to your project

When you're happy with the graph, click **Save to Ontology**. This stores the decision graph as a permanent part of your project's knowledge base. Conditions and actions become linked entities that other parts of the system can reference.

### Step 5 — Deploy (optional)

If you want the decision graph to actively monitor for these conditions, click **Deploy Rules**. This pushes the conditions and actions into the event monitoring system, where they run automatically whenever matching events arrive.

---

## Understanding action status

Every action in a decision graph has a status that controls whether it actually runs:

| Status | What it means |
|--------|--------------|
| **Pending** | Just created — won't run yet |
| **Approved** | Ready to execute when conditions are met |
| **Executing** | Currently running |
| **Done** | Completed successfully |
| **Rejected** | Won't be executed |

When you first create a graph, all actions start as "pending." This gives you a chance to review everything before anything happens. Change an action to "approved" when you're ready for it to go live.

---

## When to use Decision Support

This skill is useful whenever you need to connect observations to responses:

- **Equipment monitoring** — "If pressure exceeds X and we have open alerts, schedule maintenance"
- **Safety protocols** — "If temperature is above threshold, shut down the line and notify the safety team"
- **Quality control** — "If defect rate rises above 2%, slow down production and alert QA"
- **Supply chain** — "If inventory drops below minimum, trigger a reorder and notify procurement"
- **Maintenance planning** — "If vibration readings trend upward over 3 days, create a work order"

---

## Tips for good results

- **Be specific about thresholds** — "pressure above 150 PSI" works better than "pressure is high"
- **Mention equipment by name** — "Compressor Unit 4" helps the system find the right entities in your project
- **Describe the outcome you want** — "I want to schedule maintenance and notify the team" gives the system clear actions to propose
- **Start simple** — you can always add more conditions and actions in a follow-up message
- **Review before deploying** — use the Graph Details tab to check every condition and action before pushing rules to the event system

---

## Your graphs are always available

Saved graphs appear in the right sidebar of the Decision Support Studio. Click any graph to reload it, review it, or export its rules. Everything is stored in your project's knowledge base and persists between sessions.
