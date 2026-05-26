# Post-Install Assistance

After a user finishes the install script and logs in for the first time, the
system runs a self-diagnostic, surfaces any environmental problems, and offers
a specialized Claude Code "support agent" that can explain issues and apply
common fixes within strict, code-enforced boundaries. The goal is to turn
silent misconfiguration into an explicit, actionable list — and to fix the
common cases automatically when the user agrees.

This document explains what is checked, how it works, and where the boundaries
are.

## When it runs

- **Trigger**: per-user, on first successful login. A `firstRunCompletedAt`
  timestamp is stored on each user in the oauth-server's `users.json`.
- **Re-trigger**: the [`HealthBanner`](frontend/src/components/HealthBanner.jsx)
  stays visible when the last report had warnings or failures and lets the user
  re-open the page. Admins can also reset a user's flag via
  `POST /api/first-run/reset/:userId`.
- **Gating**: the frontend routes to [`FirstRunPage`](frontend/src/pages/FirstRunPage.jsx)
  between the login dialog and the configuration check in
  [App.jsx](frontend/src/App.jsx).

## What is checked

Each check lives in [backend/src/first-run/checks/](backend/src/first-run/checks/)
and implements `DiagnosticCheck` from [types.ts](backend/src/first-run/types.ts).
The runner executes them in parallel with a 5 second per-check timeout;
timeouts surface as `warn` (never as `fail`) so flaky networks don't block
login.

| Check id                 | What it inspects                                            | How                                                                                                                                            | Severity if failing |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `anthropic.key.valid`    | `ANTHROPIC_API_KEY` is set **and** accepted by the API      | Reuses `ClaudeService.checkModelHealth()` — small LLM call against the configured small-tier model                                              | critical            |
| `anthropic.network`      | Outbound HTTPS to `api.anthropic.com`                       | `fetch HEAD` with a 4 s `AbortController` timeout                                                                                              | critical            |
| `claude.sdk.installed`   | `@anthropic-ai/claude-agent-sdk` resolvable                 | Dynamic ESM import probe (the same one the orchestrator uses)                                                                                  | critical            |
| `workspace.access`       | `WORKSPACE_ROOT` exists and is writable                     | `fs.stat` + write/delete a temp marker file                                                                                                    | critical            |
| `workspace.diskFree`     | Free disk space near the workspace                          | `fs.statfs` where available; warn < 2 GB, fail < 500 MB                                                                                        | high                |
| `node.version`           | Node.js ≥ v20                                               | Parses `process.version`                                                                                                                       | high                |
| `oauth.reachable`        | oauth-server running on :5950                               | `GET /auth/health`, 2.5 s timeout                                                                                                              | high                |
| `ports.availability`     | Required service ports (3000, 4000, 5000, 5950, 6060, 7000, 7100) | `net.createServer().listen()` — distinguishes "our service is running" (probes the service's own health URL) from "foreign process squatting" | medium              |
| `embeddings.reachable`   | Configured embeddings provider returns a valid vector       | Calls `EmbeddingsService.embed("ping")` and checks the vector dimension matches the provider's advertised dimension                            | medium              |
| `frontend.reachable`     | Vite dev server on :5000                                    | `fetch HEAD`, 2 s timeout. Warn-only (development convenience)                                                                                 | low                 |
| `soffice.present`        | LibreOffice for Office document parsing                     | `spawn('soffice', ['--version'])` with 2.5 s timeout                                                                                           | low (optional)      |

Each check returns a `CheckResult` with `status` (`ok`/`warn`/`fail`),
`severity`, a human-readable `message`, optional structured `evidence` (which
gets passed through a secret-redaction pass), and an optional `remediation`
hint of kind `manual`, `auto-low-risk`, or `agent-assisted`.

The overall report `overall` is `fail` if any **critical or high** severity
check failed, `warn` if any check failed or warned at a lower severity, else
`ok`.

## How the support agent fits in

When the report has any non-`ok` checks, the user can ask the embedded support
agent for help. The agent is a regular Claude Code SDK session driven through
[support-agent.service.ts](backend/src/first-run/support-agent/support-agent.service.ts)
with three differences from a normal project chat:

1. **Specialised system prompt** in
   [support-agent.prompts.ts](backend/src/first-run/support-agent/support-agent.prompts.ts).
   It knows the repo layout, the service ports, the `.env` file locations,
   that LibreOffice is optional, and the absolute rule that user data under
   `WORKSPACE_ROOT` is off-limits.

2. **Diagnostic report injected as the first user message** — the agent reads
   the structured JSON of the checks and is asked to produce a remediation
   plan. In Phase 1 (`permissionMode: 'plan'`) it cannot call mutating tools
   at all — it can only propose.

3. **Hard policy callback** in
   [support-agent.policy.ts](backend/src/first-run/support-agent/support-agent.policy.ts)
   that gates every tool call:
   - **Always allowed**: `Read`, `Grep`, `Glob`, and a short Bash read-only
     whitelist (`node -v`, `soffice --version`, `npm -v`, `git --version`,
     `curl -I`, `netstat`, `df`, `printenv`).
   - **HITL-gated** (require user approval via the existing
     [sdk-permission.controller.ts](backend/src/claude/sdk/sdk-permission.controller.ts)
     flow):
     - `Write`/`Edit` to `backend/.env` or `oauth-server/.env`.
     - Bash install commands matching `npm install`, `apt-get install`,
       `apt install`, `brew install`, `choco install`.
   - **Hard-rejected synchronously** (never even shown as a prompt to the
     user):
     - Any path that resolves under `WORKSPACE_ROOT` — checked with
       `path.resolve` + prefix comparison, not string matching.
     - Any path outside the repo root + outside the two allowed `.env` files.
     - Destructive Bash patterns: `rm -rf`, `git reset --hard`,
       `git push --force`, `dd`, `mkfs`, `shred`, redirects to `/dev/`, any
       `sudo` wrapping.

The agent never wraps install commands with `sudo` itself — when elevated
privileges are needed, it surfaces the bare command so the human approver
can run it consciously.

## API surface

All endpoints live under `/api/first-run/*` (see
[first-run.controller.ts](backend/src/first-run/first-run.controller.ts)).

| Method | Path                                  | Purpose                                                                              |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/first-run/status`               | Returns the user's `firstRunCompletedAt` + the last persisted report summary         |
| POST   | `/api/first-run/diagnostics`          | Runs all checks synchronously and returns a `DiagnosticsReport`                      |
| GET    | `/api/first-run/diagnostics/stream`   | SSE stream of per-check results — used by the frontend for live progress             |
| GET    | `/api/first-run/support-session/stream` | SSE stream of the support agent's response (optional `applyItemId`, `userPrompt`)  |
| POST   | `/api/first-run/complete`             | Marks first-run done for the calling user (proxies to oauth-server)                  |
| POST   | `/api/first-run/reset/:userId`        | Admin-only: clears the flag for any user                                             |

The oauth-server side exposes three mirror routes
(`/auth/first-run/status|complete|reset/:userId`) and stores the data on the
user record in `users.json`.

## Privacy / secrets handling

- The runner's
  [`redactEvidence`](backend/src/first-run/diagnostics-runner.service.ts)
  strips any field whose key matches `/(KEY|TOKEN|SECRET|PASSWORD|AUTH)/i`,
  regardless of what an individual check returned. It also redacts string
  values that look like long opaque tokens.
- `envKeysPresent` on the report is a **list of variable names only** — never
  values.
- The support-agent system prompt forbids the agent from echoing or storing
  environment variable values.
- Reports are cached in memory per user for 30 minutes so the Apply phase can
  reference the same data the Plan phase saw; never persisted to disk.

## Why this exists

A multi-tenant Claude Code installation has a lot of moving parts (workspace
mount, API key, LibreOffice for Office parsing, embeddings provider,
oauth-server, etc.). Without this feature, missing or misconfigured
dependencies surface much later as cryptic runtime errors — typically when the
user is mid-task and least inclined to debug infrastructure. The first-run
diagnostic turns that into an explicit, scannable checklist with a guided fix
path, which materially improves adoption.

The fix path is intentionally conservative: the agent can act on the system's
own config, never on user projects, and any change that touches `.env` or
installs a package still requires a human approval through the existing HITL
permission UI.
