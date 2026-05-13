# OneDrive / Microsoft 365 Integration

End-to-end integration that mirrors a user's OneDrive (and SharePoint, with org mode) into a project's workspace volume so Claude Code can read and write those files as if they were local. Implemented as a single Nest.js module with five layers:

1. **OAuth + token storage** — per-project Microsoft identity, refresh on demand.
2. **Graph client** — typed wrapper over `https://graph.microsoft.com/v1.0`, with retry/throttle handling.
3. **OneDrive sync service** — stub generation, hydration, delta polling, mapping persistence.
4. **Write-back watcher** — chokidar-based local-to-remote upload, with conflict detection.
5. **MCP bridge** — exposes the sync engine as MCP tools at `/mcp/ms365`, so Claude Code in any session can manage its own connection.

A "thin pass-through" of an external MCP server was **deliberately rejected**. Instead, the backend talks to Microsoft Graph directly, because:

- The pass-through approach (`softeria/ms-365-mcp-server` as a child process) shares one token cache across all projects, with per-tool `account` injection — one mistake leaks files across tenants.
- A native Graph client lets the backend own per-project tokens via the existing `SecretsManagerService` (OpenBao / Azure KV / AWS Secrets Manager / env), with no extra process to supervise.
- Sync, write-back, and conflict tracking already run server-side. Adding an extra hop through stdio MCP would just slow them down.

The cost: every Graph endpoint we use was implemented explicitly. The current set covers OneDrive + SharePoint drives + delta + upload-session for large files. Excel workbook editing, Teams, Outlook, Planner, and the rest of Graph are **not** wired up — add them to `GraphClientService` and `ms365-bridge-tools.ts` as needed.

---

## Architecture

```
                                +-------------------------------+
                                | Microsoft identity platform   |
                                | login.microsoftonline.com     |
                                +-------------------------------+
                                          ^         ^
                                  authorize|         |token refresh
                                          |         |
       Browser <---OAuth popup--- /api/ms365/:project/connect
                                          |
                                          v
       +---------------------------------------------------------------+
       | Backend (Nest.js, :6060)                                      |
       |                                                               |
       |  Ms365OAuthController          Ms365TokenService               |
       |     code -> tokens   -------->   stores in SecretsManager      |
       |                                  (keys: ms365/<project>/*)    |
       |                                                               |
       |  GraphClientService  <-- uses TokenService for Bearer header  |
       |                                                               |
       |  OneDriveSyncService   stubTree / hydratePath / runDelta      |
       |     mapping.json     <-- /workspace/<project>/onedrive/.meta/ |
       |                                                               |
       |  WritebackWatcherService   chokidar -> upload + conflict      |
       |                                                               |
       |  McpServerFactory  registers "ms365" group ---> /mcp/ms365    |
       |     tools: list_drives, add_sync_root, stub_tree,             |
       |            hydrate_path, sync_status, run_delta, ...          |
       +---------------------------------------------------------------+
                                          |
                                          v
                  /workspace/<project>/onedrive/
                    .meta/
                       mapping.json     (driveItemId, eTag, hydrated, ...)
                       exclude.json     (optional)
                       conflicts/       (timestamped copies on 412/409)
                    <label>/             (one subdir per sync root)
                      Documents/
                        foo.docx.onedrive-stub    <-- placeholder
                        bar.txt                    <-- hydrated
```

### Lifecycle

1. **Connect.** User clicks "Connect Microsoft 365" in the project. Backend redirects to Microsoft, code comes back to `/api/ms365/oauth/callback`, tokens land in `SecretsManager` keyed by project name. The `home_account_id` and `account_email` are read from `/me`.

2. **Choose what to sync.** User adds a sync root (`add_sync_root`): a `{ driveId?, remotePath, label }` tuple. `driveId` blank means personal `/me/drive`; any other value is a SharePoint or shared drive ID from `list_drives` / `list_sites` / `list_site_drives`.

3. **Stub.** `stub_tree` walks every sync root via Graph, creates the folder structure under `/workspace/<project>/onedrive/<label>/`, and writes `<file>.onedrive-stub` files containing the `driveItemId`, remote path, size, eTag, and a hint telling Claude to call `hydrate_path`. Each entry also lands in `.meta/mapping.json` with `hydrated: false`.

4. **Hydrate on demand.** When Claude wants to read `Documents/foo.docx`, it calls `hydrate_path` with that remote path. The service downloads via `@microsoft.graph.downloadUrl`, atomically replaces the stub with the real file, flips `hydrated: true` in the mapping.

5. **Edit & write-back.** `start_writeback` arms a chokidar watcher on `/workspace/<project>/onedrive/`. Local writes are debounced 2 s, resolved to a remote path via the mapping, and pushed back via `uploadSmallFile` (≤ 4 MB) or `uploadLargeFile` (chunked upload session). If Graph returns 412/409, the local content is copied into `.meta/conflicts/` and the conflict is logged.

6. **Stay in sync.** Every `MS365_DELTA_INTERVAL_MS` (default 5 min), `runDelta` calls `/me/drive/root/delta` per root, updates mapping entries for items that changed remotely, and stores the new delta token. **Hydrated files are not auto-refreshed** — call `hydrate_path` again to pull a fresh copy. This is intentional: silently overwriting a local edit because the remote changed is worse than a stale read.

---

## Components

### `Ms365TokenService` — [backend/src/ms365/ms365-token.service.ts](backend/src/ms365/ms365-token.service.ts)

Stores `access_token`, `refresh_token`, `expires_at`, `home_account_id`, `account_email` under keys `ms365/<project>/*` in `SecretsManagerService`. `getValidAccessToken(project)` refreshes 5 min before expiry, with an in-flight-refresh map to prevent stampedes when concurrent requests arrive.

Calls `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token` with `grant_type=refresh_token`. Tenant defaults to `common` (multi-tenant + personal accounts); set `MS365_MCP_TENANT_ID` to lock to a single tenant.

### `Ms365OAuthController` — [backend/src/ms365/ms365-oauth.controller.ts](backend/src/ms365/ms365-oauth.controller.ts)

Routes:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ms365/:project/connect` | Build authorize URL + redirect. CSRF state stored in-memory with 10-min TTL. |
| `GET` | `/api/ms365/oauth/callback` | Exchange code, fetch `/me`, store tokens. Returns a small HTML page that `postMessage`s back to the opener and closes itself. |
| `GET` | `/api/ms365/:project/status` | `{ connected, accountEmail, expiresAt }` |
| `POST` | `/api/ms365/:project/disconnect` | Delete all `ms365/<project>/*` keys. |

Marked `@Public()` because the OAuth callback can't carry the app's JWT (Microsoft does the redirect, not the frontend). The `state` parameter is the only CSRF protection on the callback — the in-memory map is intentionally per-process; if you run multiple backend instances behind a load balancer, replace `stateStore` with a shared store (Redis, SecretsManager namespace) before going to production.

### `GraphClientService` — [backend/src/ms365/graph-client.service.ts](backend/src/ms365/graph-client.service.ts)

Thin axios wrapper around `https://graph.microsoft.com/v1.0`. Every method takes `project` as the first argument and looks up that project's token. `withRetry` handles:

- **401 once** → force token refresh, retry once. If a second 401 comes back, throw.
- **429** → honor `Retry-After`, up to 5 attempts.
- **5xx** → exponential backoff, up to 5 attempts.

High-level methods:

- `listDrives` / `listSites` / `listSiteDrives`
- `getRootChildren` / `getChildrenByPath` / `getItemByPath` / `getItemById`
- `downloadItemContent` (uses `@microsoft.graph.downloadUrl`, returns Buffer)
- `uploadSmallFile` (≤ 4 MB inline PUT) / `uploadLargeFile` (chunked upload session, 3.2 MB chunks)
- `createFolder` / `deleteItem` / `moveOrRenameItem`
- `searchFiles`
- `getDelta` (handles `@odata.nextLink` and `@odata.deltaLink` automatically)

Adding a new Graph capability is mechanical: drop a method here, expose it as a tool in the bridge.

### `OneDriveSyncService` — [backend/src/ms365/onedrive-sync.service.ts](backend/src/ms365/onedrive-sync.service.ts)

State lives in `/workspace/<project>/onedrive/.meta/mapping.json`:

```jsonc
{
  "version": 1,
  "roots": [
    { "driveId": null, "remotePath": "Documents", "label": "personal", "localRoot": "/workspace/foo/onedrive/personal/Documents" }
  ],
  "deltaTokens": { "personal": "https://graph.microsoft.com/v1.0/.../delta?token=..." },
  "entries": {
    "Documents/foo.docx": {
      "driveItemId": "01ABCD...",
      "driveId": null,
      "remotePath": "Documents/foo.docx",
      "eTag": "\"{abc-123},1\"",
      "size": 12345,
      "lastModifiedDateTime": "2026-05-13T10:00:00Z",
      "hydrated": false,
      "lastSync": 1715600000000
    }
  },
  "pendingUploads": [],
  "conflicts": []
}
```

`withMapping(project, fn)` serializes access via a per-project lock — all reads and writes go through it, so concurrent tool calls don't clobber each other.

The stub file format (a JSON object with `driveItemId`, `remotePath`, `size`, `eTag`, and a `hydrate` hint) is intentionally human-readable. If you `cat` a stub you get a clear message: "Call hydrate_path with this remote path."

Exclude patterns live in `.meta/exclude.json` (optional). Defaults skip `~$*` (Office lock files), `*.tmp`, `.DS_Store`, `Thumbs.db`, and any file > 500 MB. Patterns are simple `*` globs against the file name.

### `WritebackWatcherService` — [backend/src/ms365/writeback-watcher.service.ts](backend/src/ms365/writeback-watcher.service.ts)

`startWatching(project)` spawns a chokidar watcher rooted at `/workspace/<project>/onedrive/`, ignoring `.meta/**` and `*.onedrive-stub`. Events:

- `add` / `change` → debounce 2 s, then `uploadSmallFile` or `uploadLargeFile`. Mapping is updated with the response's `driveItemId` and `eTag`, and the path is removed from `pendingUploads`.
- `unlink` → look up `driveItemId` in mapping, call `deleteItem`, remove from mapping.

On 412 (precondition failed) or 409 (conflict), the local content is copied to `.meta/conflicts/<timestamp>-<flattened-path>` and surfaced via `sync_status`. There is **no automatic three-way merge** — manual resolution is intentional.

Large files (> 4 MB) use `createUploadSession` and PUT chunks directly to the pre-authed `uploadUrl` Microsoft returns. This bypasses the 4 MB cap that applies to inline `:/content` PUTs. The chunk size (3.2 MB) is a multiple of the 320 KiB alignment Graph requires.

### `ms365-bridge-tools.ts` — MCP tools — [backend/src/ms365/ms365-bridge-tools.ts](backend/src/ms365/ms365-bridge-tools.ts)

Registered as the `ms365` group in `McpServerFactoryService`. Reachable from a project session as:

```
POST /mcp/ms365
  Authorization: Bearer test123
  X-Project-Name: <project>
  Content-Type: application/json
  { "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "<tool>", "arguments": { ... } } }
```

Tools:

| Tool | Purpose |
|---|---|
| `list_drives` | OneDrive + shared drives for the connected account. |
| `list_sites` | SharePoint sites (org mode). Optional `query`. |
| `list_site_drives` | Document libraries inside a SharePoint site. |
| `add_sync_root` | Register `{ drive_id?, remote_path, label }` as a sync root. Auto-starts delta polling. |
| `list_sync_roots` | Currently configured roots. |
| `remove_sync_root` | Unregister by label; doesn't delete local files. |
| `stub_tree` | Walk the remote tree and materialize stub files. Optional `root_label`. |
| `hydrate_path` | Download real content for a remote path; replace stub. **Call before `Read`.** |
| `search_onedrive` | Graph search; metadata only. |
| `sync_status` | Roots, entries, hydrated count, pending uploads, conflicts, polling state. |
| `run_delta` | Force a delta poll now. |
| `start_writeback` / `stop_writeback` | Toggle chokidar watcher. |
| `create_folder` | `parent_path`, `folder_name`, optional `drive_id`. |

The project context comes from `X-Project-Name` (or `?project=`). The `Ms365BridgeTools` resolves the project via a closure over `McpServerFactoryService.currentProjectRoot`, the same mechanism every other dynamic tool group uses.

### Frontend — [frontend/src/components/MS365Connect.jsx](frontend/src/components/MS365Connect.jsx)

A single panel:

- **Connect / Disconnect** button. The connect button opens `/api/ms365/:project/connect` in a popup; the callback page `postMessage`s back, the panel refreshes.
- **Sync status** chips: roots / entries / hydrated / pending / conflicts / delta polling / write-back state.
- **Sync roots** list with "stub" and "remove" actions; an add form with three fields (label, drive ID, remote path).
- **Browse drives** — `list_drives` button populates a list; each row has a "Use" button that pre-fills the add-root form.
- **Browse SharePoint sites** — search-driven (`list_sites`).

The frontend calls the MCP HTTP endpoint directly, including the static `Bearer test123` token (same as Claude does). The Streamable HTTP response shape is `{ result: { content: [{ type: "text", text: "<JSON>" }] } }`, so the helper extracts and parses the inner text. Mount this component anywhere a per-project settings panel exists — it takes a single `projectName` prop.

---

## Microsoft Entra app registration

You need an app registration in Microsoft Entra ID (formerly Azure AD).

1. Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `claude-multitenant-onedrive` (or anything).
3. **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts" if you want to support both work and personal OneDrives. Set to single-tenant if you want to restrict.
4. **Redirect URI:** Web → `http://localhost:6060/api/ms365/oauth/callback` (dev). Add the prod URL alongside it once deployed.
5. After creation:
   - **Application (client) ID** → `MS365_MCP_CLIENT_ID`
   - **Directory (tenant) ID** → `MS365_MCP_TENANT_ID` (or use `common`)
   - Under **Certificates & secrets**, create a new **client secret** if you need confidential-client behavior (server-side OAuth, refresh tokens without PKCE). → `MS365_MCP_CLIENT_SECRET`. Public-client / PKCE flow works without a secret, but this backend currently uses confidential-client.
6. Under **API permissions** → **Microsoft Graph** → **Delegated permissions**, add:
   - `offline_access` (required to get refresh tokens)
   - `User.Read`
   - `Files.Read` and `Files.ReadWrite` (personal drive)
   - `Files.Read.All` and `Files.ReadWrite.All` (org mode — SharePoint and other users' drives)
   - `Sites.Read.All` and `Sites.ReadWrite.All` (org mode — SharePoint sites)

   Click **Grant admin consent for <tenant>**. The `.All` scopes require an admin to consent once per tenant; individual users connecting after that won't be prompted again.

---

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MS365_MCP_CLIENT_ID` | yes | — | Entra app's Application (client) ID. |
| `MS365_MCP_CLIENT_SECRET` | yes (confidential client) | — | If absent, code-exchange falls back to public-client mode (PKCE flow only). |
| `MS365_MCP_TENANT_ID` | no | `common` | Use a specific GUID/domain to lock to a single tenant. |
| `MS365_REDIRECT_URI` | no | `http://localhost:6060/api/ms365/oauth/callback` | Must exactly match the Entra app registration. |
| `MS365_SCOPES` | no | `offline_access Files.ReadWrite.All Sites.ReadWrite.All User.Read` | Space-separated. Drop `.All` for personal-OneDrive-only mode. |
| `MS365_DELTA_INTERVAL_MS` | no | `300000` (5 min) | Per-project delta poll cadence. |
| `WORKSPACE_ROOT` | no | `/workspace` | Where projects (and their `onedrive/` subdir) live. |
| `SECRET_VAULT_PROVIDER` | no | `openbao` | Already a backend-wide setting; tokens go into whichever vault is selected. |

---

## End-to-end walkthrough

Assumes: Entra app registered, env vars set, backend running on :6060, frontend on :5000.

1. **Open project `acme` in the frontend.** Navigate to the MS365 panel (wherever you mount `<MS365Connect projectName="acme" />`).
2. **Click "Connect Microsoft 365".** A popup opens to `login.microsoftonline.com`. Sign in, consent. The popup posts back and closes; the panel shows "Connected as alice@contoso.com".
3. **Click "List my drives".** You see at minimum your personal OneDrive plus any drives shared with you. Pick the one labeled "OneDrive" and click "Use" — the add-root form fills with that drive ID.
4. **Set label = `personal`, remote path = `Documents`, click Add.** Backend creates `/workspace/acme/onedrive/personal/Documents/` (empty), records the root in `mapping.json`, starts delta polling.
5. **Click the folder icon next to the root.** That fires `stub_tree`. Backend walks `Documents/` on Graph, creates the tree locally, writes `.onedrive-stub` files. You see "Stubbed 47 files, 12 folders".
6. **Click "Start write-back".** Watcher arms.
7. **In Claude Code in project `acme`:**
   ```
   ls /workspace/acme/onedrive/personal/Documents
   ```
   You see folders and `*.onedrive-stub` files. To read one:
   ```
   Call MCP tool: mcp__ms365__hydrate_path with arguments { "remote_path": "Documents/notes.md" }
   Then Read /workspace/acme/onedrive/personal/Documents/notes.md
   ```
   The stub gets replaced with the real content; subsequent reads are local file system access.
8. **Edit the file from Claude.** Within ~3 s the watcher picks it up, uploads, and the change shows up in the OneDrive web UI.
9. **Concurrent edit test.** Edit the file in the OneDrive web UI while it's also being edited locally. On the next local save, the upload fails with 412, and `.meta/conflicts/<ts>-Documents__notes.md` appears with your local content; `sync_status` shows `conflicts: 1`. Manually merge.

---

## Limitations and known constraints

**File-system illusion is incomplete.** Claude's built-in `Read`/`Glob`/`Write` tools see real files only. Stub files (`*.onedrive-stub`) show up in `Glob` results but are placeholders. The `hydrate_path` MCP tool must be called before reading. The project's CLAUDE.md template should mention this.

**4 MB inline-upload cap.** Files > 4 MB use the chunked upload-session path — slower, more API calls, but works up to ~250 GB per Graph's limits.

**`download-bytes`-style inline base64 isn't used.** The backend reads `@microsoft.graph.downloadUrl` directly via axios, streaming bytes server-side. There's no realistic file-size cap on hydration — limited by available disk in `/workspace`.

**Excel native editing isn't implemented.** This would need Graph's workbook API (`/items/{id}/workbook/...`). For now, Excel files are download-edit-upload only — the same as Word and PowerPoint.

**`account` isolation is enforced by the backend, not by Microsoft.** Every Graph call goes through `Ms365TokenService.getValidAccessToken(project)`, which looks up the project's token from `SecretsManager`. There is no shared MCP child process whose `account` param could be tampered with. Cross-tenant leakage requires a backend bug, not a single mis-routed tool call.

**Tenant admin consent is required for org mode.** `Files.ReadWrite.All` + `Sites.ReadWrite.All` need an admin to click "Grant admin consent" in the Entra portal once. After that, regular users can sign in without prompts.

**OAuth state is per-process.** `stateStore` in `Ms365OAuthController` is a `Map` in memory. Multi-instance deployments need a shared store before `state` can survive a callback hitting a different backend instance from the one that initiated the redirect.

**Hydrated files are not auto-refreshed by delta.** Delta polling updates the *mapping* (so `sync_status` sees the remote change), but does not silently overwrite a hydrated local file. Call `hydrate_path` again to pull a fresh copy. Rationale: silently overwriting an in-progress local edit because someone changed the OneDrive copy is worse than a stale read.

**MCP `start_writeback` is project-scoped.** Each project needs its own start. Backend restarts lose the "watching" state. To make it persistent, add a `meta.writebackEnabled` flag and auto-arm on module init.

**Graph throttling (429) is handled per-request, not globally.** Heavy `stub_tree` runs on a large drive could hit per-app limits across all projects. If you start seeing 429 storms, batch via Graph's `$batch` endpoint (up to 20 requests).

---

## Adding more Graph capabilities

Pattern, repeating Excel as a worked example:

1. **Add the method to `GraphClientService`:**
   ```ts
   async getWorksheets(project: string, itemId: string, driveId?: string) {
     const base = driveId ? `/drives/${driveId}` : '/me/drive';
     const data = await this.get<{ value: any[] }>(project, `${base}/items/${itemId}/workbook/worksheets`);
     return data.value;
   }
   ```
2. **Expose it in `ms365-bridge-tools.ts`:**
   ```ts
   {
     name: 'list_worksheets',
     description: '...',
     inputSchema: { type: 'object', properties: { item_id: { type: 'string' }, drive_id: { type: 'string' } }, required: ['item_id'] },
   }
   // ... in execute switch:
   case 'list_worksheets':
     return { worksheets: await graph.getWorksheets(project, args.item_id, args.drive_id) };
   ```
3. **Update Entra app permissions** if the new endpoint needs scopes you don't already request.
4. **Restart** the backend (Nest re-registers the tool group at boot).

No frontend change needed — Claude can discover the tool via the standard MCP `tools/list` round-trip.

---

## File map

```
backend/src/ms365/
├── ms365.module.ts                  (Nest module — exports services for factory)
├── ms365-token.service.ts           (M2: tokens + refresh)
├── ms365-oauth.controller.ts        (M2: /api/ms365/* OAuth routes)
├── graph-client.service.ts          (M1: typed Graph wrapper, retry/throttle)
├── onedrive-sync.service.ts         (M3: stubs, hydrate, delta, mapping)
├── writeback-watcher.service.ts     (M4: chokidar + upload + conflict store)
└── ms365-bridge-tools.ts            (M1+M3+M4+M5: MCP tool surface)

backend/src/mcpserver/
├── mcp-server-factory.service.ts    (modified — registers "ms365" group)
└── mcp-server.module.ts             (modified — imports Ms365Module)

backend/src/app.module.ts             (modified — imports Ms365Module)

frontend/src/components/
└── MS365Connect.jsx                  (M2+M5: connect panel + sync UI)
```

---

## What's intentionally not built

- **A single-MCP-child-process bridge to `softeria/ms-365-mcp-server`.** Considered and rejected for the reasons in the architecture section. If you ever want this, mount it under a different group name (e.g. `ms365-passthrough`) so it lives alongside, not instead of, this implementation.
- **Auto-sync of remote changes onto hydrated files.** See "Limitations." If you want it, hook `runDelta` so that for any entry where `hydrated && localEtag !== newEtag`, you either auto-`hydrate_path` (overwriting) or move the local copy aside first.
- **A separate per-end-user-per-project auth model.** Tokens are scoped per project, not per logged-in user. If two end users share project `acme`, they share the OneDrive that's connected to `acme`. To split them, key tokens under `ms365/<project>/<userId>/...` and pass user context into every Graph call.
- **Three-way merge on conflict.** Conflicts are recorded as side files; the user resolves them manually. A merge UI is out of scope.
- **Three-pane diff for Office documents.** Word/PowerPoint round-trip works but doesn't surface a diff.
- **Real-time presence / co-authoring.** Graph doesn't expose this for arbitrary clients; the OneDrive web UI is the only place to co-author Office files.
