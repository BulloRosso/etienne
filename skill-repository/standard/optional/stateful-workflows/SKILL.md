---
name: stateful-workflows
description: Create and manage XState-based stateful workflows with human-in-the-loop support via MCP tools
---
# Stateful Workflows

This skill enables you to create, manage, and advance stateful workflows using the `workflows` MCP tools. Workflows are XState v5 state machines stored as JSON files that track multi-step processes with automatic persistence and optional human-in-the-loop integration.

## When to Use This Skill

Use this skill when the user asks you to:
- Create a multi-step process or approval workflow
- Track the state of a business process
- Set up a review/approval pipeline
- Create any process that requires multiple stages and transitions
- Build human-in-the-loop flows where steps need human approval or input
- Manage workflows that span email communication

## Important: Project Name

All workflow MCP tools require a `project_name` parameter. **Extract the project folder name from your current working directory.** For example, if your working directory is `/workspace/my-project`, pass `project_name: "my-project"`.

## MCP Tools Reference

### workflow_create
Creates a new workflow from an XState v5 machine configuration.
- `project_name` (string, required): The project directory name
- `name` (string, required): Human-readable workflow name
- `description` (string): What this workflow does
- `machine_config` (object, required): XState v5 machine definition (see format below)
- `tags` (array of strings): Optional tags for categorization

### workflow_send_event
Sends an event to advance a workflow to a new state. If the new state has `waitingFor: "human_chat"`, an interactive dialog is automatically shown to the user.
- `project_name` (string, required)
- `workflow_id` (string, required): The workflow ID (slug derived from name, e.g., "customer-onboarding")
- `event` (string, required): Event name matching a transition in the current state
- `data` (object): Optional event payload

### workflow_get_status
Get current state, available transitions, and whether the workflow is waiting for human input.
- `project_name` (string, required)
- `workflow_id` (string, required)

### workflow_list
List all workflows for the project with summary info.
- `project_name` (string, required)
- `tag` (string): Optional filter by tag
- `state` (string): Optional filter by current state

### workflow_get_definition
Get the full workflow definition including machine config, persisted state, and transition history.
- `project_name` (string, required)
- `workflow_id` (string, required)

### workflow_delete
Delete a workflow permanently.
- `project_name` (string, required)
- `workflow_id` (string, required)

### workflow_register_trigger
Register a condition monitoring rule that triggers a workflow state transition when an event matches. Connects real-time events (Email, MQTT, Filesystem, Webhook) to workflow transitions.
- `project_name` (string, required)
- `rule_name` (string, required): Human-readable name for the trigger rule
- `workflow_id` (string, required): Target workflow slug
- `workflow_event` (string, required): Event name to send to the workflow (must match a transition)
- `condition` (object, required): Event condition to match (see condition types below)
- `map_payload` (boolean): If true (default), passes the triggering event's full payload as data

### workflow_unregister_trigger
Remove condition monitoring rules. Pass `rule_id` to delete a specific rule, or `workflow_id` to remove all triggers for that workflow.
- `project_name` (string, required)
- `rule_id` (string): Specific rule ID to delete
- `workflow_id` (string): Delete all triggers for this workflow

### workflow_list_triggers
List all condition monitoring rules that trigger workflows.
- `project_name` (string, required)
- `workflow_id` (string): Optional filter by workflow

## Machine Config Format

The `machine_config` parameter must be a valid XState v5-style JSON object:

```json
{
  "initial": "draft",
  "states": {
    "draft": {
      "on": { "SUBMIT": "pending_review" },
      "meta": {
        "label": "Draft",
        "description": "Document is being drafted"
      }
    },
    "pending_review": {
      "on": {
        "APPROVE": "approved",
        "REJECT": "draft",
        "REQUEST_CHANGES": "draft"
      },
      "meta": {
        "label": "Pending Review",
        "description": "Waiting for reviewer approval",
        "waitingFor": "human_chat",
        "waitingMessage": "A document is pending your review. Please approve, reject, or request changes."
      }
    },
    "approved": {
      "type": "final",
      "meta": {
        "label": "Approved",
        "description": "Document has been approved"
      }
    }
  }
}
```

### State Configuration

Each state can have:
- `on`: Object mapping event names to target state names (e.g., `{ "APPROVE": "approved" }`)
- `type`: Set to `"final"` for terminal states that cannot be advanced
- `meta`: Metadata object with:
  - `label`: Human-readable display name for the state
  - `description`: What this state represents
  - `waitingFor`: Human-in-the-loop marker. Values:
    - `"human_chat"` -- automatically shows an elicitation dialog to the user in the chat
    - `"human_email"` -- indicates this state awaits an email response
    - `"external"` -- waiting for an external system or trigger
  - `waitingMessage`: Message displayed to the human when the workflow enters this state
  - `emailSubjectFilter`: For email-based responses, the subject filter to match incoming emails
  - `onEntry`: State-entry action configuration. When the workflow enters this state, either a prompt or a Python script is automatically executed. Supports two mutually exclusive modes:
    - **Prompt mode** (AI-driven): `promptFile` (string): Filename of a `.prompt` file in `workflows/` (e.g., `"process-email.prompt"`). Optional `maxTurns` (number, default 20). The prompt advances the workflow by calling `workflow_send_event` from within the prompt.
    - **Script mode** (deterministic): `scriptFile` (string): Filename of a `.py` file in `workflows/scripts/` (e.g., `"process-data.py"`). Optional `timeout` in seconds (default 300). The script receives workflow context as JSON via stdin. Use `onSuccess` (string) and `onError` (string) to specify event names that are automatically sent after script completion or failure, advancing the workflow to the next state.

## Human-in-the-Loop Patterns

### Pattern 1: Chat-Based Approval (Automatic)

When a workflow transitions into a state with `waitingFor: "human_chat"`, the system **automatically** displays an interactive dialog to the user. The dialog presents the available transitions as action choices. When the user responds, the workflow is automatically advanced.

**You do not need to do anything special** -- just create the state with the right `meta` fields and send the event that transitions into it. The system handles the rest.

Example flow:
1. Create workflow with a review state having `waitingFor: "human_chat"`
2. Call `workflow_send_event` with event `"SUBMIT"` to enter the review state
3. The user sees a dialog with the available actions (APPROVE, REJECT, etc.)
4. The workflow automatically advances based on the user's choice

### Pattern 2: Email-Based Approval (Manual Orchestration)

For email-based human-in-the-loop, you orchestrate the flow using the existing `email` MCP tools:

1. **Create the workflow** with an email waiting state:
   ```json
   "awaiting_email": {
     "on": { "APPROVE": "approved", "REJECT": "rejected" },
     "meta": {
       "waitingFor": "human_email",
       "waitingMessage": "Waiting for email approval",
       "emailSubjectFilter": "APPROVAL:"
     }
   }
   ```

2. **Send the approval email** using the `email_send` MCP tool:
   - Subject: `APPROVAL: [Workflow Name] - [Workflow ID]`
   - Body: Description of what needs approval, with instructions to reply with "APPROVED" or "REJECTED"

3. **Poll for responses** using the `email_check_inbox` MCP tool:
   - Filter by subject matching `APPROVAL: [Workflow ID]`
   - Parse the response body for approval/rejection keywords

4. **Advance the workflow** by calling `workflow_send_event` with the appropriate event based on the email response.

### Pattern 3: External System Wait

For states waiting on external systems, use `waitingFor: "external"`. The workflow persists in this state until you explicitly send an event to advance it. This is useful for integrations where another system or scheduled task will trigger the next step.

### Pattern 4: Event-Driven Workflows (Condition Monitoring)

Workflows can be triggered automatically by real-time events from the condition monitoring system. Use `workflow_register_trigger` to connect events (email, MQTT sensors, filesystem changes, webhooks) directly to workflow state transitions.

**Available event groups:**
- `Email` -- Incoming emails (IMAP). Event name: `"Email Received"`
- `MQTT` -- IoT sensor messages. Event name: `"MQTT Message Received"`
- `Filesystem` -- File/directory changes. Event names: `"File Created"`, `"File Modified"`, `"File Deleted"`
- `Webhook` -- HTTP webhook payloads. Event name: `"Webhook Received"`
- `Claude Code` -- User interactions. Event names: `"UserPromptSubmit"`, `"PostToolUse"`

**Condition types for triggers:**

Simple (exact match):
```json
{"type": "simple", "event": {"group": "Email", "name": "Email Received"}}
```

Simple with payload filter (wildcards supported):
```json
{"type": "simple", "event": {"group": "Email", "payload.Subject": "APPROVAL:*"}}
```

Email semantic (natural language):
```json
{"type": "email-semantic", "criteria": "emails about invoice approvals"}
```

**Example: Email triggers approval workflow**

1. Create the workflow:
```
workflow_create with machine_config that has "EMAIL_RECEIVED" transition
```

2. Register the trigger (use `email-semantic` with criteria `"Any email is fine"` to let all emails pass, or describe specific filtering criteria):
```
workflow_register_trigger:
  project_name: "my-project"
  rule_name: "Email triggers approval"
  workflow_id: "document-approval"
  workflow_event: "EMAIL_RECEIVED"
  condition: {"type": "email-semantic", "criteria": "Any email is fine"}
```

3. Check registered triggers:
```
workflow_list_triggers:
  project_name: "my-project"
  workflow_id: "document-approval"
```

4. To clean up:
```
workflow_unregister_trigger:
  project_name: "my-project"
  workflow_id: "document-approval"
```

**Example: Sensor alert triggers escalation**

1. Create a workflow with an event-triggered transition:
```json
{
  "initial": "monitoring",
  "states": {
    "monitoring": {
      "on": { "SENSOR_ALERT": "alert_received" },
      "meta": { "label": "Monitoring", "description": "Waiting for sensor data" }
    },
    "alert_received": {
      "on": { "ACKNOWLEDGE": "investigating", "ESCALATE": "escalated" },
      "meta": {
        "label": "Alert Received",
        "waitingFor": "human_chat",
        "waitingMessage": "Sensor alert received. Acknowledge or escalate?"
      }
    },
    "investigating": {
      "on": { "RESOLVE": "resolved", "ESCALATE": "escalated" },
      "meta": { "label": "Investigating" }
    },
    "escalated": {
      "on": { "RESOLVE": "resolved" },
      "meta": { "label": "Escalated", "waitingFor": "human_email", "waitingMessage": "Escalated for management review" }
    },
    "resolved": {
      "type": "final",
      "meta": { "label": "Resolved" }
    }
  }
}
```

2. Register the trigger:
```
workflow_register_trigger:
  project_name: "my-project"
  rule_name: "MQTT error triggers alert"
  workflow_id: "sensor-escalation"
  workflow_event: "SENSOR_ALERT"
  condition: {"type": "simple", "event": {"group": "MQTT", "payload.message.status": "error"}}
```

Now, whenever an MQTT message with `status: "error"` arrives, the workflow automatically transitions from `monitoring` to `alert_received`, and the user sees an elicitation dialog to acknowledge or escalate.

**When the user asks you to connect events to workflows, you should:**
1. Create the workflow with appropriate event-triggered transitions using `workflow_create`
2. Register triggers using `workflow_register_trigger` for each event source
3. Use `workflow_list_triggers` to confirm the setup
4. Explain to the user which events will trigger which workflow transitions

### Pattern 5: State-Entry Actions (Automatic Prompt Execution)

States can have `onEntry` actions that automatically execute a `.prompt` file when the workflow enters that state. The prompt is executed via the Claude unattended endpoint with full workflow context (previous state, current state, triggering event, event data).

**Prompt files** are stored as `.prompt` files in the project's `workflows/` directory. They can be viewed and edited in the frontend file browser (rendered as an editable Monaco editor with a save button).

**Example: Auto-process incoming emails**

1. Create a `.prompt` file at `workflows/process-email.prompt`:
```
You received an email as part of a workflow. Review the email content provided above in the Event Data section.

1. Extract the key information from the email
2. Determine if this is an approval, rejection, or needs further review
3. Based on your analysis, advance the workflow by calling workflow_send_event with the appropriate event (APPROVE, REJECT, or REQUEST_INFO)
```

2. Create the workflow with `onEntry` on the processing state:
```json
{
  "initial": "waiting_for_email",
  "states": {
    "waiting_for_email": {
      "on": { "EMAIL_RECEIVED": "processing_email" },
      "meta": { "label": "Waiting for Email", "waitingFor": "external" }
    },
    "processing_email": {
      "on": { "APPROVE": "approved", "REJECT": "rejected", "REQUEST_INFO": "waiting_for_email" },
      "meta": {
        "label": "Processing Email",
        "description": "AI is analyzing the email",
        "onEntry": { "promptFile": "process-email.prompt" }
      }
    },
    "approved": {
      "type": "final",
      "meta": { "label": "Approved" }
    },
    "rejected": {
      "type": "final",
      "meta": { "label": "Rejected" }
    }
  }
}
```

3. Register a trigger so incoming emails advance the workflow (use `email-semantic` with `"Any email is fine"` to accept all emails):
```
workflow_register_trigger:
  rule_name: "Email triggers processing"
  workflow_id: "email-processor"
  workflow_event: "EMAIL_RECEIVED"
  condition: {"type": "email-semantic", "criteria": "Any email is fine"}
```

Now, when an email arrives: the trigger sends `EMAIL_RECEIVED` → workflow transitions to `processing_email` → the `process-email.prompt` file is automatically executed with the email payload → Claude analyzes the email and calls `workflow_send_event` to advance to the next state.

**When the user asks you to create workflows with automated processing, you should:**
1. Evaluate whether a `.prompt` or `.py` script is more suitable for each state (see guidance below)
2. Create the appropriate file(s) in `workflows/` or `workflows/scripts/`
3. Create the workflow with `onEntry` pointing to the right file on each processing state
4. Register triggers if the workflow should react to external events
5. Explain the flow to the user: what triggers what, and what each action does

### Pattern 6: Script-Based Entry Actions (Python)

For deterministic tasks, use Python scripts instead of prompts. Scripts are stored in `workflows/scripts/` and receive workflow context via stdin as JSON. After execution, the workflow is **automatically advanced** using the `onSuccess` and `onError` events configured in `onEntry`. All executions are logged in JSONL format to `workflows/scripts/logs/`.

**Script context (received via stdin):**
```json
{
  "workflow_id": "data-pipeline",
  "workflow_name": "Data Pipeline",
  "previous_state": "waiting",
  "new_state": "processing",
  "event": "DATA_RECEIVED",
  "data": { "payload": { "file": "report.csv" } },
  "project": "my-project",
  "workspace_dir": "/workspace/my-project"
}
```

**Auto-advancement:** Scripts do not need to call any API to advance the workflow. Configure `onSuccess` and `onError` in the `onEntry` block:
- `onSuccess`: Event sent automatically when the script exits with code 0 (e.g., `"COMPLETE"`)
- `onError`: Event sent automatically when the script exits with a non-zero code or times out (e.g., `"ERROR"`)

**Example: Process CSV data with Python**

1. Create a script at `workflows/scripts/process-csv.py`:
```python
# requirements: pandas
import sys, json, pandas as pd
from pathlib import Path

context = json.load(sys.stdin)
workspace = Path(context['workspace_dir'])
payload = context['data'].get('payload', {})

# Read source file
source_file = workspace / 'out' / payload.get('file', 'data.csv')
df = pd.read_csv(source_file)

# Process
summary = {
    'rows': len(df),
    'columns': list(df.columns),
    'stats': df.describe().to_dict()
}

# Write result
output_file = workspace / 'out' / 'summary.json'
output_file.write_text(json.dumps(summary, indent=2))
print(f"Processed {len(df)} rows, summary written to out/summary.json")
# Exit code 0 → onSuccess event "COMPLETE" is sent automatically
```

2. Create the workflow with `onEntry` including `onSuccess` and `onError`:
```json
{
  "initial": "waiting",
  "states": {
    "waiting": {
      "on": { "DATA_RECEIVED": "processing" },
      "meta": { "label": "Waiting", "waitingFor": "external" }
    },
    "processing": {
      "on": { "COMPLETE": "done", "ERROR": "failed" },
      "meta": {
        "label": "Processing",
        "onEntry": { "scriptFile": "process-csv.py", "timeout": 60, "onSuccess": "COMPLETE", "onError": "ERROR" }
      }
    },
    "done": { "type": "final", "meta": { "label": "Done" } },
    "failed": { "type": "final", "meta": { "label": "Failed" } }
  }
}
```

**Important:** Always specify `onSuccess` and `onError` for script-based entry actions so the workflow advances automatically. The script itself should only focus on its task and use `sys.exit(0)` for success or `sys.exit(1)` for failure.

**Script dependency management:**
- Add a `# requirements: pandas, requests` comment at the top of your script
- Dependencies are auto-installed via `pip install` before execution
- If no requirements comment is found, imports are scanned and non-stdlib packages are installed

**Script logging:**
All script executions are logged to `workflows/scripts/logs/<YYYY-MM-DD>.jsonl` with entries for `called`, `succeeded`, and `error` events.

### Choosing Between Prompt and Script

**Use a `.prompt` file when:**
- The task requires reasoning, analysis, or natural language understanding
- The output is non-deterministic or creative
- The task needs access to MCP tools (email, workflow advancement, knowledge graph, etc.)
- You need to make decisions based on unstructured data

**Use a `.py` script when:**
- The task is deterministic (data transformation, calculations, API calls)
- Performance matters (scripts execute in seconds vs. minutes for LLM calls)
- The task involves structured data processing (CSV, JSON, databases)
- You need precise control over error handling and data flow
- The task involves binary data, file I/O, or external service integrations

**When in doubt**, ask the user: "This task could be handled by either an AI prompt (better for reasoning and flexibility) or a Python script (better for speed and deterministic processing). Which would you prefer?"

## Workflow Design Guidelines

1. **Use ALL_CAPS for event names**: `SUBMIT`, `APPROVE`, `REJECT`, `CANCEL`, `TIMEOUT`
2. **Use snake_case for state names**: `pending_review`, `awaiting_approval`, `in_progress`
3. **Always include a `meta.label`** for each state for readability
4. **Mark terminal states** with `"type": "final"`
5. **Include rejection/rollback paths** -- allow workflows to go backwards when needed
6. **Add meaningful `waitingMessage`** for human-in-the-loop states
7. **Use tags** to categorize workflows (e.g., `["approval", "content"]`)

## Example Interactions

### User asks for an approval workflow

**User**: "Create a content approval workflow where I review blog posts before publishing"

**You should**:
1. Design a machine config with states: `draft` -> `submitted` -> `under_review` (waitingFor: human_chat) -> `approved`/`needs_revision` -> `published` (final)
2. Call `workflow_create` with the config
3. Report the workflow ID and explain how to use it

### User asks about workflow status

**User**: "What workflows do I have and what state are they in?"

**You should**:
1. Call `workflow_list` to get all workflows
2. For each workflow, summarize: name, current state, whether it's waiting for input
3. Offer to advance any workflow that has available transitions

### User asks to advance a workflow

**User**: "Approve the blog post workflow"

**You should**:
1. Call `workflow_list` to find the relevant workflow
2. Call `workflow_get_status` to check current state and available events
3. Call `workflow_send_event` with the appropriate event (e.g., "APPROVE")
4. Report the transition result

## Storage

Workflows are stored at `workspace/<project>/workflows/<slug>.workflow.json` where the slug is derived from the workflow name (e.g., `customer-onboarding.workflow.json`). These files can be viewed in the frontend file browser, which renders them as interactive state machine graphs with the current state highlighted.
