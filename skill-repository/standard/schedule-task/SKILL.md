---
name: schedule-task
description: Allows the agent to create cron job to execute actions later or regularly
---
# Schedule Task

This skill enables you to schedule tasks to run at specific times. When a user requests something to happen at a future time, this skill parses the time expression, creates a scheduled task, and optionally saves the prompt for reuse.

## When to Use This Skill

Use this skill when the user asks you to do something at a specific time, such as:
- "Today at 16:00 look up the stock prices for nvidia and write me an email"
- "Tomorrow at 9am remind me to check the server logs"
- "At 14:30 run the backup script"
- "In 2 hours send me a summary of today's news"
- "Every day at 8am give me a weather report"
- "Schedule a task to check API health at midnight"

## Workflow

### Step 1: Parse the User Request

Extract two components from the user's request:
1. **Time expression**: When should this run (e.g., "today at 16:00", "tomorrow at 9am", "every Monday at 10:00")
2. **Task prompt**: What should be done (e.g., "look up the stock prices for nvidia and write me an email")

### Step 2: Convert Time to Cron Expression

Convert natural language time expressions to cron format (`minute hour day month weekday`):

| Expression | Cron Expression | Notes |
|------------|-----------------|-------|
| Today at 16:00 | `0 16 7 2 *` | Single run: specific date |
| Tomorrow at 9am | `0 9 8 2 *` | Single run: specific date |
| At 14:30 | `30 14 7 2 *` | Single run: today at that time |
| Every day at 8am | `0 8 * * *` | Recurring daily |
| Every Monday at 10:00 | `0 10 * * 1` | Recurring weekly |
| Every hour | `0 * * * *` | Recurring hourly |
| In 2 hours | Calculate current time + 2 hours | Single run |

**Current date reference**: Use the system date to calculate "today", "tomorrow", etc.

**Cron format**: `minute hour day-of-month month day-of-week`
- Minutes: 0-59
- Hours: 0-23 (24-hour format)
- Day of month: 1-31
- Month: 1-12
- Day of week: 0-6 (0=Sunday, 1=Monday, etc.)

### Step 3: Create the Scheduled Task

Use the scheduler API to create the task:

```
POST /api/scheduler/{project}/task
Content-Type: application/json

{
  "id": "unique-task-id",
  "name": "Task name (short description)",
  "prompt": "The full prompt to execute",
  "cronExpression": "0 16 7 2 *",
  "timeZone": "Europe/Berlin"
}
```

**Important fields:**
- `id`: Generate a unique ID (e.g., `task-{timestamp}` or UUID)
- `name`: A short, descriptive name for the task
- `prompt`: The exact prompt that Claude should execute when the task runs
- `cronExpression`: The cron expression from Step 2
- `timeZone`: Use the user's timezone (default: "Europe/Berlin" or ask if unclear)

### Step 4: Confirm to User

After creating the task, confirm with the user:
- When the task will run
- What prompt will be executed
- The task ID for reference

## API Reference

### Create Task
```
POST /api/scheduler/{project}/task
Body: { id, name, prompt, cronExpression, timeZone }
Response: { task: TaskDefinition }
```

### List Tasks
```
GET /api/scheduler/{project}/tasks
Response: { tasks: TaskDefinition[] }
```

### Delete Task
```
DELETE /api/scheduler/{project}/task/{taskId}
Response: { success: true }
```

### View Task History
```
GET /api/scheduler/{project}/history
Response: { history: TaskHistoryEntry[] }
```

## Example Interactions

### Example 1: Single Run Today

**User**: "Today at 16:00 look up the stock prices for nvidia and write me an email"

**Analysis**:
- Time: Today at 16:00 -> `0 16 {today's day} {today's month} *`
- Prompt: "look up the stock prices for nvidia and write me an email"

**API Call**:
```json
POST /api/scheduler/current-project/task
{
  "id": "task-1707321600000",
  "name": "Stock prices email",
  "prompt": "look up the stock prices for nvidia and write me an email",
  "cronExpression": "0 16 7 2 *",
  "timeZone": "Europe/Berlin"
}
```

**Response to user**: "I've scheduled your task for today at 16:00. At that time, I'll look up Nvidia stock prices and send you an email. Task ID: task-1707321600000"

### Example 2: Recurring Daily Task

**User**: "Every day at 9am give me a summary of overnight news"

**Analysis**:
- Time: Every day at 9am -> `0 9 * * *`
- Prompt: "give me a summary of overnight news"

**API Call**:
```json
POST /api/scheduler/current-project/task
{
  "id": "task-1707321600001",
  "name": "Daily news summary",
  "prompt": "give me a summary of overnight news",
  "cronExpression": "0 9 * * *",
  "timeZone": "Europe/Berlin"
}
```

### Example 3: Tomorrow

**User**: "Tomorrow at 14:00 check if the backup completed successfully"

**Analysis**:
- Time: Tomorrow at 14:00 -> `0 14 {tomorrow's day} {tomorrow's month} *`
- Prompt: "check if the backup completed successfully"

## Time Parsing Guidelines

### Common Patterns

| Pattern | Example Input | Parsed As |
|---------|---------------|-----------|
| Today at HH:MM | "today at 16:00" | Current date, specified time |
| Tomorrow at HH:MM | "tomorrow at 9am" | Next day, specified time |
| At HH:MM | "at 14:30" | Today, specified time |
| In X hours | "in 2 hours" | Current time + X hours |
| In X minutes | "in 30 minutes" | Current time + X minutes |
| Every day at HH:MM | "every day at 8am" | `0 8 * * *` |
| Every X hours | "every 2 hours" | `0 */2 * * *` |
| Every Monday at HH:MM | "every Monday at 10:00" | `0 10 * * 1` |
| Every weekday at HH:MM | "every weekday at 9am" | `0 9 * * 1-5` |

### Time Format Recognition

- 24-hour: 16:00, 14:30, 09:00
- 12-hour with am/pm: 4pm, 9am, 2:30pm
- Relative: "in 2 hours", "in 30 minutes"

### Timezone Handling

Default to Europe/Berlin unless the user specifies otherwise. Common timezones:
- Europe/Berlin (CET/CEST)
- Europe/London (GMT/BST)
- America/New_York (EST/EDT)
- America/Los_Angeles (PST/PDT)
- UTC

## Error Handling

If time parsing is ambiguous, ask the user for clarification:
- "Did you mean 4am or 4pm?"
- "Which timezone should I use for this task?"
- "Is this a one-time task or should it repeat?"

## Notes

- For single-run tasks, the cron expression uses specific day/month values
- The scheduler will execute the task and store results in task history
- Users can view scheduled tasks and history through the UI or by asking
- Tasks can be deleted by ID if no longer needed
