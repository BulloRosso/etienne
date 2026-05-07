[← back to README](../README.md)

# Budget Tracking

Etienne tracks AI inference costs per project and enforces a global budget limit across all projects.

<div align="center">
<img src="/docs/images/budget-tracking.jpg" alt="Budget tracking pane" width="500">
</div>

The budget pane can be activated from the app bar.

## How It Works

- **Always-on tracking**: Token usage is recorded for every Claude request regardless of whether the budget limit is enabled. Each cost entry includes a timestamp, session ID, input/output tokens, per-request cost, and accumulated cost.
- **Session-based counting**: A "task" in the budget dashboard corresponds to a distinct chat session (identified by `sessionId`), not an individual API call. The dashboard shows the number of unique sessions, not raw request counts.
- **Global budget limit**: The configured limit applies to the **sum of costs across all projects** in the workspace, not per-project. This prevents circumventing the budget by splitting work across projects.
- **Pre-flight enforcement**: Before processing any chat request (direct, streamed, or unattended), the backend checks whether the global budget has been exceeded and rejects the request if so.
- **Default settings**: Budget monitoring is enabled by default with a limit of 200 €.

## Cost Calculation

Costs are computed from token counts using configurable rates:

```
cost = (inputTokens / 1,000,000) × COSTS_PER_MIO_INPUT_TOKENS
     + (outputTokens / 1,000,000) × COSTS_PER_MIO_OUTPUT_TOKENS
```

## Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `COSTS_CURRENCY_UNIT` | `EUR` | Currency code shown in the UI (EUR, USD, GBP, JPY) |
| `COSTS_PER_MIO_INPUT_TOKENS` | `3.0` | Cost per million input tokens |
| `COSTS_PER_MIO_OUTPUT_TOKENS` | `15.0` | Cost per million output tokens |

## Storage

Each project stores its data under the `.etienne/` directory:

| File | Purpose |
|------|---------|
| `.etienne/costs.json` | Array of cost entries (newest first), one per API call |
| `.etienne/budget-monitoring.settings.json` | `{ enabled, limit }` — budget on/off and limit value |

## UI Dashboard

The budget indicator in the header bar shows a percentage icon (0–100 %) based on global spend vs. limit. Clicking it opens a drawer with:

- **Stacked progress bar** — blue portion represents all other projects, red represents the current project
- **Tiles** — tokens used, tokens remaining (estimated), sessions completed, average cost per session
- **Recent Activity** — collapsible table of the last 10 cost entries (collapsed by default)
- **Budget Settings** — dialog to change the limit; includes a "Reset token counters" checkbox (enabled by default) that clears cost history for all projects when saved

## Real-time Updates

The frontend subscribes to an SSE stream (`/api/budget-monitoring/:project/stream`) that pushes `budget-update` events whenever a new cost entry is recorded. On each event the UI also re-fetches global totals to keep the stacked bar accurate.

See [MCP Registry/Governance Layer](../mcp-registry.md).
