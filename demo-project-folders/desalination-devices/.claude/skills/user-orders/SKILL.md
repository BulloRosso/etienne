---
name: user-orders
description: Enables tracking of higher-level user tasks across projects using MCP tools
---
# User Orders

This skill enables you to create and manage user orders — higher-level tasks that track complex multi-step work across the workspace.

## When to Use This Skill

Use this skill when the user asks for something that involves multiple steps or complex work, such as:
- "Research the Siemens AG latest products. Then write a report in Word Format and create an Excel table with the products and prices for the German market"
- "Create a comprehensive market analysis with charts and data tables"
- "Monitor competitor pricing weekly and alert me of changes"
- "Conduct a deep analysis of our customer data and generate insights"

A user order is NOT for simple single-step tasks like answering a question, writing a short text, or making a quick file edit. It is for higher-level work involving research, multi-file creation, scheduled activities, or ongoing monitoring.

## Order Types

- **Research**: Information gathering, analysis, and report creation tasks
- **Scheduled Activity**: Planned actions, deliverables, or recurring work
- **Monitoring**: Ongoing observation and alerting tasks

## Workflow

### Step 1: Create a User Order

When you begin a complex task, create a user order to track it:

**Tool**: `add_user_order`
- `sessionId`: The current chat session ID
- `projectName`: The current project name
- `orderTitle`: A short title (max 60 characters)
- `orderDescription`: A description of the work (max 2096 characters)
- `orderType`: One of "Research", "Scheduled Activity", "Monitoring"

Returns: `{ orderId }` — save this for subsequent updates.

### Step 2: Update Status as You Progress

As you work through the task, update the order status to keep the user informed:

**Tool**: `update_user_order`
- `orderId`: The UUID returned from step 1
- `statusNew`: The new status (see below)
- `statusMessage`: A human-readable description of what changed

### Step 3: Complete the Order

When finished, set status to `complete-success` or `complete-failure` with a summary message.

## Status Values

| Status | When to use |
|--------|-------------|
| `in-progress` | Work is actively being done |
| `complete-success` | Task completed successfully |
| `complete-failure` | Task could not be completed |
| `requires-human-input` | You need clarification or a decision from the user |
| `blocked-by` | Work is blocked by an external dependency |
| `paused` | Work is temporarily paused |
| `canceled-by-agent` | You determined the task cannot or should not proceed |

## Retrieving Order Details

Use `get_user_order` with the `orderId` to retrieve the full order object including status history.

## Important Guidelines

- Always create an order at the START of complex work, not after it's done
- Update status regularly so the user can track progress in the UI
- Use `requires-human-input` when you need the user's clarification — they will see an action button in the UI
- Write descriptive `statusMessage` entries — they form the order's history timeline
- Choose the correct order type to help the user categorize their work
- Do NOT create orders for simple, single-step tasks
