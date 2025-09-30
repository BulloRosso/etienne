# Backend README

## Prerequisites

* Docker Desktop installed and running.
* Node.js 20+ on the host (for the backend).
* An Anthropic API key available as an environment variable on the host: `ANTHROPIC_API_KEY`.

## Workspace layout

```
<repo-root>/
  backend/                      # NestJS API
  frontend/                     # Vite React app (optional here)
  workspace/                    # host directory mounted into Claude container
    <project>/                  # e.g., demo1
      CLAUDE.md
      data/                     # per-project HOME (sessions, config)
      out/                      # files Claude can create/update
```

---

## Start the Claude container

Mount the host `workspace` into the container at `/workspace`. Keep the container idle (sleep) so the backend can `docker exec` into it on demand.

```bash
# from <repo-root>
mkdir -p workspace
docker run -d --name claude-code \
  -v "$PWD/workspace":/workspace \
  -w /workspace \
  --env ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --entrypoint bash \
  your-claude-image:tag -lc "sleep infinity"
```

Notes:

* Do not rely on `-w` at exec time on Windows. The backend sets `cd` in the exec script.
* The backend assumes the **container root is `/workspace`**. Do not change it.
* The `claude` CLI must be installed and resolvable in the container (`which claude` inside the container should succeed).

---

## Start the backend

Environment (Windows Git Bash shown; adapt for your shell):

```bash
cd backend
export WORKSPACE_HOST_ROOT="$(pwd)/../workspace"
export CLAUDE_CONTAINER_NAME="claude-code"
export CLAUDE_TIMEOUT_MS=600000
# ANTHROPIC_API_KEY must be present in your host env; the backend passes it into docker exec

npm i
npm run dev
# backend listens on http://localhost:6000
```

---

## How the backend interfaces with Claude in the container

### Execution model

* The backend launches Claude via `docker exec` with a non-interactive script:

  * Sets a robust `PATH` to locate `claude`.
  * Forces per-project state by exporting:

    * `HOME=/workspace/<project>/data`
    * `XDG_CONFIG_HOME=/workspace/<project>/data`
    * `XDG_DATA_HOME=/workspace/<project>/data`
    * `XDG_STATE_HOME=/workspace/<project>/data`
    * `CLAUDE_CONFIG_DIR=/workspace/<project>/data`
  * `cd /workspace/<project>`.
  * Runs:

    ```
    claude \
      --print "<prompt>" \
      --output-format stream-json \
      --verbose \
      --include-partial-messages \
      --permission-mode acceptEdits \
      --allowedTools "Task" \
      --allowedTools "Read(/workspace/<project>/**)" \
      --allowedTools "Edit(/workspace/<project>/out/**)" \
      --allowedTools "Write(/workspace/<project>/out/**)" \
      --allowedTools "MultiEdit(/workspace/<project>/out/**)" \
      --allowedTools "NotebookEdit(/workspace/<project>/out/**)" \
      [--resume "$SESSION_ID" | --continue]
    ```
* The backend parses **line-delimited JSON** from `stdout` (`stream-json`):

  * Captures `session_id` from the initial `system:init` event.
  * Extracts human-visible deltas from `delta`, `partial_text`, `text`, or nested `content[].text`.
  * Aggregates token usage from `usage`/`token_usage`/`metrics`.

### Filesystem access

* Claude reads `CLAUDE.md` and writes only under `<project>/out/**` (enforced by allowed tool globs).
* The backend watches `<project>/out` with `chokidar` and emits file events as they settle.

---

## How data is returned to the frontend

### Streaming channel (SSE)

Endpoint: `GET /api/claude/streamPrompt?project_dir=<p>&prompt=<text>`

Events emitted (SSE `event:` names):

* `session` → `{ session_id, model? }` (first time for a project; also when recovered)
* `stdout` → `{ chunk }` (human-readable streamed text)
* `usage` → `{ model?, input_tokens?, output_tokens?, total_tokens? }` (updates as available)
* `file_added` → `{ path }` (relative to project root)
* `file_changed` → `{ path }`
* `completed` → `{ exitCode, usage }`
* `error` → `{ message }`

### File retrieval

* `GET /api/claude/getFile?project_dir=<p>&file_name=<rel-path>` → `{ path, content }`
* `GET /api/claude/listFiles?project_dir=<p>[&sub_dir=<rel-dir>]` → `[{ name, isDir }]`
* `POST /api/claude/addFile` with JSON `{ project_dir, file_name, file_content }` → `{ ok, path }`

The frontend opens the SSE, appends `stdout` chunks into the response pane, and fetches files upon `file_added`/`file_changed`.

---

## API methods

| Method | Path                       | Query / Body                                    | Returns                                                                                | Notes                                                                                             |
| ------ | -------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/api/claude/streamPrompt` | `project_dir` (query), `prompt` (query)         | **SSE stream** of events: `session`, `stdout`, `usage`, `file_*`, `completed`, `error` | Single long-lived response. Per-project queue serializes concurrent prompts for the same project. |
| GET    | `/api/claude/getFile`      | `project_dir`, `file_name`                      | `{ path, content }`                                                                    | `file_name` is a project-relative path (e.g., `out/a.txt`).                                       |
| GET    | `/api/claude/listFiles`    | `project_dir`, optional `sub_dir`               | `[{ name, isDir }]`                                                                    | Lists a project dir (default root).                                                               |
| POST   | `/api/claude/addFile`      | JSON `{ project_dir, file_name, file_content }` | `{ ok, path }`                                                                         | Ensures project scaffold; writes file.                                                            |
| GET    | `/api/claude/health`       | —                                               | `ok`                                                                                   | Liveness probe.                                                                                   |

All file paths are validated against the project root to prevent traversal.

---

## Session management

### Storage

* `HOME` is set to `/workspace/<project>/data` for each run.
* Claude writes sessions under:
  `/workspace/<project>/data/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
* The backend persists the current session id in:
  `/workspace/<project>/data/session.id`

### Lifecycle

* **First request** for a project: no `session.id` present → backend launches with `--continue`. The stream’s first `system:init` JSON includes `session_id`. Backend:

  * emits SSE `session { session_id }`
  * writes `<project>/data/session.id`
* **Subsequent requests**: backend reads `<project>/data/session.id` and launches with `--resume "$SESSION_ID"`.
* **Token usage**: aggregated from streamed JSON and emitted as SSE `usage`. The frontend’s token pane renders the current values.

---

## Permissions configuration

### Default policy (in this backend)

* `--permission-mode acceptEdits`: automatically accept edit/write operations generated by Claude.
* Allowed tools:

  * `Task` — planning/execution orchestration. Required to make progress beyond init.
  * `Read(/workspace/<project>/**)` — allow read access to the project tree (to use `CLAUDE.md`, inspect outputs, etc.).
  * `Edit(/workspace/<project>/out/**)` — edits restricted to the `out/` subtree.
  * `Write(/workspace/<project>/out/**)` — file creation restricted to `out/`.
  * `MultiEdit(/workspace/<project>/out/**)` and `NotebookEdit(/workspace/<project>/out/**)` — batch/structured edit allowances under `out/`.

### Tightening or expanding permissions

* Restrict edits more: narrow globs (e.g., `Edit(/workspace/<project>/out/docs/**)`).
* Enable additional tools only if required (e.g., `Bash`, `WebFetch`, `WebSearch`). Omit by default to reduce surface area.
* Do not remove `Task` or `Read`; removing them will stall the agent after session init.

---

## Operational details

* **Windows path handling:** the backend intentionally avoids `docker exec -w` and uses `cd` inside the container script. It builds POSIX paths using `posixProjectPath()` to prevent MSYS path mangling.
* **Per-project concurrency:** the backend serializes prompts per `project_dir` to avoid tool-state races in a single session. Different projects can run in parallel.
* **Timeouts:** `CLAUDE_TIMEOUT_MS` (default 600 s). On timeout, the backend kills the exec and sends `error` then `completed`.
* **File event reliability:** file watcher uses `awaitWriteFinish` to avoid partial reads. Only `out/` is watched to limit noise.
* **CORS:** backend is configured for a local frontend at `http://localhost:5000`.

---

## Quick local test

1. Start Claude container (see above).
2. Start backend (see above).
3. Create a project and stream once:

```bash
# seed CLAUDE.md and run a prompt that writes two files
curl -s -X POST "http://localhost:6000/api/claude/addFile" \
  -H "content-type: application/json" \
  -d '{"project_dir":"demo1","file_name":"CLAUDE.md","file_content":"# demo1\n"}' | jq .

curl -N "http://localhost:6000/api/claude/streamPrompt?project_dir=demo1&prompt=Create%20two%20files%20under%20out/:%20a.txt%20and%20b.txt%20with%20short%20content."
# observe SSE: session → stdout → file_added → usage → completed
```

4. Inspect session files:

```bash
docker exec claude-code bash -lc 'ls -R /workspace/demo1/data/.claude/projects || true'
```

---
