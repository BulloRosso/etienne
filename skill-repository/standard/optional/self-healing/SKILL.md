---
name: self-healing
description: "Report application issues for automated diagnosis and patching. Use when the user wants to report a bug, error, or malfunction. Guides users through creating a structured issue report with title, description, reproduction steps, expected and actual behavior. Issues are submitted to an admin for review before any automated repair is triggered."
---

# Self-Healing Issue Reporter

## When to Use

Activate this skill when the user:
- Reports a bug, error, or unexpected behavior
- Says something is "broken", "not working", or "crashing"
- Describes a problem they want fixed
- Asks about the self-healing or issue reporting system
- Wants to check the status of a previously reported issue

## Workflow Overview

Explain to the user how the self-healing system works:

1. **User reports an issue** — you help them create a complete, structured report
2. **Admin reviews** — the admin sees the issue and decides whether to approve or reject
3. **AI diagnosis** — if approved, an AI agent investigates the root cause
4. **Automated patch** — depending on the autonomy level, a patch may be applied automatically or presented for review
5. **Verification** — the system verifies the fix worked; if not, automatic rollback occurs

## Gathering Issue Information

When a user wants to report an issue, collect the following information through conversation:

### Required Fields
- **Title**: A short, descriptive summary (ask: "What would you call this issue in one sentence?")
- **Description**: Detailed explanation of the problem (ask: "Can you describe what's going wrong in detail?")

### Optional but Valuable Fields
- **Steps to Reproduce**: How to trigger the problem (ask: "What steps lead to this issue?")
- **Expected Behavior**: What should happen (ask: "What did you expect to happen?")
- **Actual Behavior**: What actually happens (ask: "What actually happens instead?")

## Creating the Issue

Once you have gathered all the information, confirm the details with the user and then submit the issue using the API:

```bash
curl -s -X POST "http://localhost:6060/api/issues/${PROJECT_NAME}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "title": "<title>",
    "description": "<description>",
    "stepsToReproduce": "<steps>",
    "expectedBehavior": "<expected>",
    "actualBehavior": "<actual>"
  }'
```

Replace `${PROJECT_NAME}` with the current project name (derived from the current working directory) and `${TOKEN}` with the authentication token from the environment.

Always show the user a summary of the issue before submitting and ask for confirmation.

## Checking Issue Status

To check existing issues for the current project:

```bash
curl -s "http://localhost:6060/api/issues/${PROJECT_NAME}" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.issues[] | {number, title, status, severity, priority}'
```

## Adding Comments

To add a comment to an existing issue:

```bash
curl -s -X POST "http://localhost:6060/api/issues/${PROJECT_NAME}/${ISSUE_ID}/comments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"content": "<comment text>"}'
```

## Status Meanings

Help users understand what each status means:
- **OPEN** — Reported, waiting for admin review
- **APPROVED** — Admin approved, diagnosis starting
- **REJECTED** — Admin declined (check rejection reason)
- **DIAGNOSING** — AI agent is investigating
- **DIAGNOSED** — Root cause found
- **PATCH_PENDING** — Patch created, waiting for admin review
- **PATCHING** — Fix being applied
- **VERIFYING** — Checking if the fix works
- **RESOLVED** — Fixed and verified
- **FAILED** — Fix didn't work, rolled back
- **ESCALATED** — Needs manual intervention

## Important Notes

- Users can only report issues and view their own issues
- Only admins can approve, reject, or prioritize issues
- The system never makes changes without admin authorization
- All changes are backed up and can be rolled back automatically
