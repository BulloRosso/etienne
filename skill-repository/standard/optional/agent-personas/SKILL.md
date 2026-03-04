---
name: agent-personas
description: "Use this skill when the user asks to install, set up, or deploy an agent persona (e.g., 'install supplyagent', 'set up supply chain agent', 'deploy agent persona', 'install persona'). Reads persona artifacts from agent-personas/, translates to the user's preferred language, and provisions sub-agents, cron jobs, knowledge graph structure, and dashboard into the current project."
---

# Agent Personas Installation Skill

This skill installs pre-built agent personas into a project. An agent persona is a complete configuration package containing sub-agent definitions, scheduled jobs, knowledge graph structure, and a dashboard — all designed around a specific domain (e.g., supply chain management).

## Available Personas

| Persona | Directory | Description |
|---------|-----------|-------------|
| supplyagent | `agent-personas/supplyagent/` | Autonomous supply chain assistant for mid-sized manufacturers. Reads supplier emails, builds a living knowledge model, and warns before problems get expensive. |

## When to Use This Skill

Use this skill when the user asks to:
- Install or deploy an agent persona
- Set up the SupplyAgent or supply chain assistant
- Configure a domain-specific agent package
- "Install supplyagent", "set up supply chain agent", "deploy agent persona"

## Prerequisites

Before starting installation, verify these skills are provisioned for the project:
- `scrapbook` — for the knowledge graph structure (requires scrapbook service on port 7000)
- `schedule-task` — for cron job registration
- `public-website` — for dashboard creation (requires webserver on port 4000)

If any are missing, inform the user and help provision them first.

---

## Installation Workflow

### Step 0: Read MANIFEST.json

Read `agent-personas/supplyagent/MANIFEST.json` to understand the artifact list and installation order. This is the authoritative source of what needs to be installed.

### Step 1: Determine Target Language

Ask the user what language the agent should use for its reports, notifications, and dashboard. Offer these options:

- **English** (default if the conversation so far has been in English)
- **German / Deutsch** (default if the conversation has been in German)
- **Chinese / 中文** (default if the conversation has been in Chinese)

Say something like:

> "What language should the SupplyAgent use for its reports, notifications, and dashboard? I'll translate all artifacts to that language during installation."

**IMPORTANT**: The canonical artifacts in `agent-personas/supplyagent/` are written in American English. If the target language is NOT English, you (the agent) will translate each text artifact as you process it — you do NOT modify the source files. You translate in-memory as you make API calls.

### Step 2: Create Sub-Agents (7 total)

For each agent definition directory, read the `system_prompt.md` and `config.yaml`. Create a subagent via the REST API.

**Source directories to process (in order):**

1. `agents/orchestrator/` → subagent name: `supplyagent-orchestrator`
2. `agents/skills/email_parser/` → subagent name: `supplyagent-email-parser`
3. `agents/skills/graph_query/` → subagent name: `supplyagent-graph-query`
4. `agents/skills/escalation/` → subagent name: `supplyagent-escalation`
5. `agents/skills/graph_maintenance/` → subagent name: `supplyagent-graph-maintenance`
6. `agents/skills/report_generator/` → subagent name: `supplyagent-report-generator`
7. `agents/skills/onboarding_orchestrator/` → subagent name: `supplyagent-onboarding`

**For each agent directory:**

1. Read `system_prompt.md` — this becomes the subagent's system prompt
2. Read `config.yaml` — extract the `description` field for the subagent description
3. If target language is NOT English: translate the system prompt content to the target language.
   - Keep untranslated: technical terms (SPARQL, JSON, RDF, OWL, API, SSE, CORS, CSV, IMAP), variable placeholders ({AGENT_NAME}, {COMPANY_NAME}, etc.), code blocks, HTTP methods and endpoints, JSON schemas
   - Translate: all natural language instructions, explanations, table headers, comments
4. Create the subagent via API:

```
POST http://localhost:6060/api/subagents/{project}
Content-Type: application/json

{
  "name": "supplyagent-orchestrator",
  "description": "Main orchestrator for SupplyAgent — routes events to specialized skills",
  "systemPrompt": "<translated system prompt content>"
}
```

After creating all 7 subagents, confirm to the user:

> "Created 7 SupplyAgent sub-agents: orchestrator, email parser, graph query, escalation, graph maintenance, report generator, and onboarding."

### Step 3: Register Cron Jobs (6 jobs)

Read `agent-personas/supplyagent/cron/jobs.yaml` and create a scheduled task for each job.

**Translation**: If target language is NOT English, translate the `name`, `description`, and `prompt` fields to the target language before sending. Keep the `cronExpression`, `timeZone`, and `type` fields untranslated.

**For each job in jobs.yaml:**

```
POST http://localhost:6060/api/scheduler/{project}/task
Content-Type: application/json; charset=utf-8

{
  "id": "supplyagent-{job.id}",
  "name": "{translated job.name}",
  "prompt": "{translated job.prompt}",
  "cronExpression": "{job.cronExpression}",
  "timeZone": "{job.timeZone}",
  "type": "{job.type}"
}
```

All job IDs are prefixed with `supplyagent-` to namespace them.

Expected 6 jobs:
| Job ID | Name | Schedule |
|---|---|---|
| `supplyagent-weekly-briefing` | Weekly Risk Briefing | Mon 7:30 |
| `supplyagent-daily-deadline-scan` | Daily Deadline Scan | Daily 6:00 |
| `supplyagent-supplier-radar-tue` | Supplier Radar (Tuesday) | Tue 14:00 |
| `supplyagent-supplier-radar-thu` | Supplier Radar (Thursday) | Thu 14:00 |
| `supplyagent-single-source-check` | Single Source Risk Report | 1st of month 9:00 |
| `supplyagent-nightly-reasoning` | Nightly Reasoning + Score Recalc | Daily 2:00 |

After creating all jobs, confirm:

> "Registered 6 recurring cron jobs for supply chain monitoring."

### Step 4: Create Knowledge Graph Structure in Scrapbook

The supply chain ontology maps to the scrapbook hierarchy. Use the MCP scrapbook tools to create the knowledge graph skeleton.

**Translation**: If target language is NOT English, translate all labels and descriptions.

#### Step 4a: Create Root Node

```
scrapbook_create_root_node(
  project="{project}",
  label="Supply Chain Knowledge Graph",
  description="Knowledge graph for supply chain management: suppliers, parts, orders, deliveries, and risk assessment. This graph grows automatically as the agent processes emails, imports data, and runs nightly analysis.",
  icon_name="FaProjectDiagram"
)
```

#### Step 4b: Create 5 Category Nodes

**1. Suppliers:**
```
scrapbook_add_node(
  project="{project}",
  parent_node_name="Supply Chain Knowledge Graph",
  label="Suppliers",
  description="Supplier entities with reliability scores, contact information, alternative supplier relationships, and risk levels. Key properties: reliabilityScore (0.0-1.0), contactEmail, contactPhone, riskLevel (low/medium/high/critical), seasonalNote, escalationOverride, humanContactPreference.",
  priority=8,
  attention_weight=0.7,
  icon_name="FaTruck"
)
```

**2. Parts:**
```
scrapbook_add_node(
  project="{project}",
  parent_node_name="Supply Chain Knowledge Graph",
  label="Parts",
  description="Component and part entities required for production. Key properties: partNumber, description, singleSourceRisk (boolean — true if only one supplier), suppliedBy (supplier references), requiredBy (order references).",
  priority=7,
  attention_weight=0.5,
  icon_name="FaCogs"
)
```

**3. Orders:**
```
scrapbook_add_node(
  project="{project}",
  parent_node_name="Supply Chain Knowledge Graph",
  label="Orders",
  description="Customer orders with deadlines and part requirements. Key properties: orderId, deadline (date), urgentFlag (boolean — true if deadline approaching without confirmed delivery), customerName, requiredParts, status (open/in-progress/completed/delayed).",
  priority=8,
  attention_weight=0.8,
  icon_name="FaClipboardList"
)
```

**4. Delivery Events:**
```
scrapbook_add_node(
  project="{project}",
  parent_node_name="Supply Chain Knowledge Graph",
  label="Delivery Events",
  description="Delivery event tracking: delays, confirmations, price changes, quality issues, cancellations. Key properties: eventType, delayDays, eventDate, newDeliveryDate, confidence, relatedSupplier, relatedOrder.",
  priority=6,
  attention_weight=0.6,
  icon_name="FaShippingFast"
)
```

**5. Risk Assessment:**
```
scrapbook_add_node(
  project="{project}",
  parent_node_name="Supply Chain Knowledge Graph",
  label="Risk Assessment",
  description="Risk analysis: single-source vulnerabilities, urgent order flags, supplier reliability trends, escalation history. Auto-populated by nightly reasoning and cron jobs.",
  priority=9,
  attention_weight=0.9,
  icon_name="FaExclamationTriangle"
)
```

#### Step 4c: Create 3 Subcategory Nodes under Risk Assessment

```
scrapbook_add_node(
  project="{project}",
  parent_node_name="Risk Assessment",
  label="Single Source Risks",
  description="Parts with only one known supplier — critical supply chain vulnerabilities. Auto-detected by the nightly reasoning job. Each entry shows the sole supplier, their reliability score, and affected orders.",
  priority=9,
  attention_weight=0.8,
  icon_name="FaExclamationCircle"
)

scrapbook_add_node(
  project="{project}",
  parent_node_name="Risk Assessment",
  label="Urgent Orders",
  description="Orders flagged as urgent: approaching deadline with unresolved supply issues. Auto-populated by the daily deadline scan. Each entry shows the order, deadline, buffer days, and recommended action.",
  priority=9,
  attention_weight=0.9,
  icon_name="FaClock"
)

scrapbook_add_node(
  project="{project}",
  parent_node_name="Risk Assessment",
  label="Declining Reliability",
  description="Suppliers whose reliability score has been declining over the past 8 weeks. Auto-populated by the bi-weekly supplier radar job. Each entry shows the score trend and contributing events.",
  priority=7,
  attention_weight=0.7,
  icon_name="FaChartLine"
)
```

After creating the scrapbook structure, confirm:

> "Created supply chain knowledge graph with 5 categories and 3 risk assessment subcategories in the scrapbook."

### Step 5: Generate Dashboard (Public Website)

Create a supply chain dashboard using the public-website pattern. The dashboard provides an at-a-glance view of supply chain health.

#### 5a: Create directory structure

```bash
mkdir -p web/css
mkdir -p web/js
mkdir -p api
```

#### 5b: Create `web/index.html`

Generate a React 18 / MUI v5 single-page dashboard (using CDN, no build step) with these panels:

1. **Supplier Risk Status** — Table showing suppliers with reliability scores (color-coded bars), risk level badges, single-source warnings. Data loaded from `/web/{project}/api/suppliers`.

2. **Order Deadline Overview** — Table/timeline of orders sorted by deadline urgency. urgentFlag items highlighted in red. Buffer days displayed. Data from `/web/{project}/api/orders`.

3. **Agent Activity Log** — Scrollable log of recent agent actions: timestamp, action type, skill involved, status. Data from `/web/{project}/api/activity`.

4. **Quick Stats Cards** — Four summary cards: Total Suppliers, Open Orders, Urgent Flags, Average Reliability Score.

Use the MUI template from the public-website skill:
- React 18 via CDN
- Material-UI v5 via CDN
- Roboto font + Material Icons
- `<script type="text/babel">` for JSX
- All visible text (headers, labels, column names, empty states, button text) in the target language

#### 5c: Create API endpoints

**`api/suppliers.py`** — Reads supplier data from the scrapbook REST API:

```python
import json
import os
import urllib.request

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROJECT = os.path.basename(DATA_DIR)
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:6060")

def get(request=None):
    try:
        url = f"{BACKEND_URL}/api/workspace/{PROJECT}/scrapbook/tree"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            tree = json.loads(resp.read().decode())
        suppliers = []
        for node in tree.get("children", []):
            if "supplier" in node.get("label", "").lower():
                suppliers = node.get("children", [])
                break
        return {"suppliers": suppliers}
    except Exception as e:
        return {"suppliers": [], "error": str(e)}
```

**`api/orders.py`** — Reads order data from the scrapbook:

```python
import json
import os
import urllib.request

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROJECT = os.path.basename(DATA_DIR)
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:6060")

def get(request=None):
    try:
        url = f"{BACKEND_URL}/api/workspace/{PROJECT}/scrapbook/tree"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            tree = json.loads(resp.read().decode())
        orders = []
        for node in tree.get("children", []):
            if "order" in node.get("label", "").lower():
                orders = node.get("children", [])
                break
        return {"orders": orders}
    except Exception as e:
        return {"orders": [], "error": str(e)}
```

**`api/activity.py`** — Reads scheduler history:

```python
import json
import os
import urllib.request

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROJECT = os.path.basename(DATA_DIR)
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:6060")

def get(request=None):
    try:
        url = f"{BACKEND_URL}/api/scheduler/{PROJECT}/history"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"history": [], "error": str(e)}
```

### Step 6: Place Reference Files

Copy reference files from the persona directory into the project for sub-agent access:

```bash
mkdir -p data/supplyagent/seed_data
```

Copy these files to `data/supplyagent/`:
- `agent-personas/supplyagent/cron/cron_governance.yaml` → `data/supplyagent/cron_governance.yaml`
- `agent-personas/supplyagent/knowledge_graph/ontology.ttl` → `data/supplyagent/ontology.ttl`
- `agent-personas/supplyagent/knowledge_graph/owl_rules.ttl` → `data/supplyagent/owl_rules.ttl`
- `agent-personas/supplyagent/knowledge_graph/seed_data/example_supplier_template.csv` → `data/supplyagent/seed_data/example_supplier_template.csv`
- `agent-personas/supplyagent/knowledge_graph/seed_data/example_order_template.csv` → `data/supplyagent/seed_data/example_order_template.csv`
- `agent-personas/supplyagent/.env.template` → `data/supplyagent/.env.template`

### Step 7: Confirm Installation

Present a summary to the user (in the target language):

> **SupplyAgent has been installed successfully!**
>
> **Installed components:**
> - 7 sub-agents (orchestrator + 6 specialized skills)
> - 6 recurring cron jobs
> - Knowledge graph structure (5 categories, 3 risk subcategories)
> - Dashboard at `/web/{project}/`
> - Reference files in `data/supplyagent/`
>
> **Language:** {target_language}
>
> **Next steps:**
> 1. Open the Scrapbook view to see your supply chain knowledge graph
> 2. Say **"start onboarding"** to begin the guided setup process
> 3. Upload your supplier list (CSV/Excel) to start building the knowledge graph
> 4. Review and adjust cron job schedules in the Scheduling tab

---

## Translation Guidelines

When translating artifacts to the target language:

1. **System prompts**: Translate the natural language parts. Keep untranslated:
   - Technical terms: SPARQL, JSON, RDF, OWL, CSV, API, SSE, CORS, IMAP, HTTP, REST
   - Variable placeholders: `{AGENT_NAME}`, `{COMPANY_NAME}`, etc.
   - Code blocks and JSON schemas
   - HTTP methods and API endpoints
   - File paths and directory names

2. **Cron job names and descriptions**: Fully translate.
   Example (German): "Weekly Risk Briefing" → "Wöchentliches Risiko-Briefing"
   Example (Chinese): "Weekly Risk Briefing" → "每周风险简报"

3. **Cron job prompts**: Translate. The agent that executes the prompt understands the target language.

4. **Scrapbook labels**: Translate category names and descriptions.
   Example (German): "Suppliers" → "Lieferanten", "Parts" → "Bauteile", "Orders" → "Aufträge"
   Example (Chinese): "Suppliers" → "供应商", "Parts" → "零部件", "Orders" → "订单"

5. **Dashboard text**: All visible UI text (headers, labels, column names, button text, empty states) in the target language.

6. **Config files (YAML, JSON, TOML)**: Do NOT translate keys or field names. Only translate string values that are user-facing (descriptions, labels).

7. **Code files (Python)**: Do NOT translate code. Only translate string literals that appear in the UI or as user-facing messages.

---

## Error Handling

- **Missing prerequisite skill**: Inform the user which skill is missing and offer to provision it.
- **Scrapbook service not running**: "The scrapbook service doesn't seem to be running. Please check the process manager and ensure the rdf-store is started."
- **Scheduler API failure**: If a cron job creation fails, report the error and continue with remaining jobs. List failed jobs at the end.
- **Subagent creation failure**: If a subagent creation fails, report the error and continue. List failed agents at the end.
- **Label collision in scrapbook**: If a scrapbook node label already exists (e.g., from a previous installation attempt), skip it and note it in the summary.
