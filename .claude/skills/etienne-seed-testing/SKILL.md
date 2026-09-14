---
name: etienne-seed-testing
description: "Drive an Etienne seed/demo project in a real browser to verify it end to end — step-by-step screenshots, scripted UI flows, and screen recordings converted to mp4 — and use those artefacts to debug what the UI actually renders. Trigger on 'test the seed', 'verify the demo end to end', 'screenshot the flow', 'record a video of the demo', 'why is the cockpit empty', 'the app shows the welcome page instead of my app', or any request to check, film, or debug a workspace/<project> demo in the browser."
---

# Etienne Seed Testing

Verify and debug an Etienne seed project the way a viewer experiences it: in a
browser, against the running stack, capturing screenshots or a video you can
replay. Built from a full TenderTrace end-to-end session where nine defects were
found that unit tests could not see, and where reaching the app's own UI took
nine diagnostic probes.

**The single most useful thing in this skill:** the navigation chain in §3. A
scripted browser does **not** land on your app. It lands on a welcome page with
no sidebar, and every selector you write against the app will fail. Read §3
before writing any automation.

---

## 1. When to use this

- verifying a seed end to end after changing a pipeline, prompt, or MCP tool
- producing step-by-step screenshots for review ("show me each stage")
- recording a demo video of a long-running flow, delivered as mp4
- debugging "the UI shows nothing" when the backend clearly has data

Not for pure logic bugs: those belong in `backend/test/*.test.ts`, which is far
cheaper. Use this when the question is **what the browser actually renders**.

## 2. Preflight — five things, in this order

Check all five before writing automation. Four of the five bit during the
session this skill came from.

| # | Check | Command | Why |
|---|---|---|---|
| 1 | services listening | `Get-NetTCPConnection -State Listen` filtered to 5000/6060/5950/7000/7100 | `netstat \| grep` silently returned nothing on this machine; the PowerShell cmdlet is reliable |
| 2 | a Playwright **library** | look for `playwright-core` in a project or install it to a scratchpad | the Playwright **MCP server** runs via `npx @playwright/mcp` and leaves no importable package; it also cannot record video |
| 3 | a chromium **binary** | `%USERPROFILE%\AppData\Local\ms-playwright\chromium-*/chrome-win64/chrome.exe` | already cached; do not download another. The `chrome.exe` is ~4 MB because the payload is `chrome.dll` (~284 MB) beside it — that is normal, not a broken install |
| 4 | a **real** ffmpeg | `winget` build at `…\Gyan.FFmpeg…\bin\ffmpeg.exe` | Playwright's bundled ffmpeg is `--disable-everything` with only VP8/WebM/png. **It cannot write mp4.** Verify with `-encoders \| findstr libx264` |
| 5 | no live pipeline run | the app's own status tool | a forced re-run is usually refused while another is live |

```powershell
# 2 — install the library WITHOUT pulling browsers (they are already cached)
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
npm install playwright-core@1.63.0 --no-audit --no-fund
```

## 3. The navigation chain (read this before anything else)

A fresh browser context reaches **a login form**, then **a welcome page**, and
**no sidebar at all**. Three separate gates, each with a non-obvious fix. Every
one of them cost multiple probes to find.

```js
// 1 — AUTH. Seed the token; do not type into the login form.
//     POST :5950/auth/login {username,password} -> {accessToken, refreshToken, user}
//     AuthContext restores a session from these localStorage keys.
localStorage.setItem('auth_accessToken',  token);
localStorage.setItem('auth_refreshToken', refresh);
localStorage.setItem('currentProject',    project);   // ProjectContext reads this

// 2 — SIDEBAR. THE BIG ONE.
//     UxModeContext.getInitialUxType() defaults to 'verbose', and AppLayout
//     renders <MinimalisticSidebar> ONLY when isMinimalistic === true.
//     In verbose mode the sidebar DOES NOT EXIST — no rail, no expand button,
//     no application menu. Selectors for it can never match.
localStorage.setItem('uxModeOverride', 'minimalistic');

localStorage.setItem('splitRatio', '30');   // optional: chat pane width %
```

```js
// 3 — WELCOME PAGE. The second big one.
//     shouldShowWelcome = welcomePage config && showWelcomeMessage !== false
//                         && (message || quickActions?.length) && !hasExistingSessions
//     Demo projects ship quickActions and start with 0 chat sessions, so this is
//     TRUE on every load. AppLayout then renders <WelcomePage> INSTEAD OF
//     <SplitLayout> — and SplitLayout is what contains the ArtifactsPane that
//     holds preview tabs. So your app has nowhere to render even when its file
//     loaded fine.
//
//     Dismiss it by clicking the PiChats box (top-right, "Vorherige Gespräche"):
await page.evaluate(() => {
  const hit = [...document.querySelectorAll('div')].find((e) => {
    const t = (e.innerText || '').trim();
    const r = e.getBoundingClientRect();
    return t.startsWith('Vorherige Gespräche') && r.width > 0 && r.width < 420 && r.y < 80;
  });
  if (hit) hit.click();          // -> onReturnToDefault -> setShowWelcomePage(false)
});

// 4 — OPEN THE APP from the application-type sidebar section.
await page.locator('text="Analyse-Cockpit"').first().click();   // your menu label
```

The app renders in an **iframe** (an MCP-UI previewer). Find it by content, and
poll — it mounts about a second after the click:

```js
const findApp = async (page, marker) => {
  for (const f of page.frames()) {
    try { if (await f.locator(`text=${marker}`).count()) return f; } catch {}
  }
  return null;
};
let frame = null;
for (let i = 0; i < 40 && !frame; i++) { await page.waitForTimeout(1000); frame = await findApp(page, 'Dokumente einlesen'); }
```

### How a file path becomes your app

`.claude`-side config → sidebar item → `filePreviewHandler.handlePreview(path)` →
`FILE_PREVIEW_REQUEST` → `fetchFile` → tab in `ArtifactsPane` → viewer lookup by
**file suffix** → for `type: "mcpui"` previewers, `McpUIPreview` connects to
`/mcp/<group>` and calls the render tool, which returns the app HTML.

Registration lives in `backend/src/previewers/previewer-metadata.json`:

```json
{ "viewer": "requirements-tracking", "type": "mcpui",
  "mcpGroup": "requirements-tracking", "mcpToolName": "render_requirements_tracking",
  "extensions": [".tendertrace.json"] }
```

**Debugging a blank pane, in order:** confirm the viewer is in
`GET /api/previewers/configuration` (28 previewers on a healthy stack) → confirm
the sidebar item's `payload.path` file exists in the workspace → confirm the
suffix matches the previewer's `extensions` → confirm `/mcp/<group>` answers
`tools/list` through **:5000** (Vite proxies `/mcp`, `/api`, `/auth` to :6060) →
only then suspect the app bundle.

Do **not** try to publish to the page's event bus: `claudeEventBus` is a
module-scoped singleton and is not reachable from `window`.

## 4. Recipes

Scripts live beside this file. Copy and adapt; they take the project, labels and
markers as constants at the top.

| File | Use |
|---|---|
| `scripts/probe.js` | **Run this first on any new seed.** Reports what the DOM actually contains at each gate: frames, buttons, sidebar entries, failed requests, and whether the app iframe mounted. |
| `scripts/record.js` | Drives a pipeline run with a narration strip burned into the frame and records webm. Good for progress, poor for decisions. |
| `scripts/record-interactive.js` | **Prefer this for anything a human does.** Clicks real controls (row → decision pane → Approve), so the screen actually changes. Driving the backend over HTTP while the page sits still produces a video of nothing happening. |
| `scripts/convert.ps1` | webm → H.264 mp4, with an optional speed-up for long stretches. |

```powershell
# screenshots: prefer the Playwright MCP browser (interactive, you see each step)
# video: must be playwright-core — recordVideo is set at context creation and
#        cannot be retrofitted onto an already-running browser
node scripts/probe.js
node scripts/record.js
pwsh scripts/convert.ps1 -Webm video-out/raw/page@*.webm -Mp4 video-out/demo.mp4 -Speed 6
```

### Recording notes

- `recordVideo: { dir, size }` goes on `newContext`, and the file is written
  **when the context closes**. It reads **0 bytes** the whole time it records —
  that is not a fault. Always `await ctx.close()` in a `finally`.
- Name the file yourself afterwards; Playwright names it `page@<hash>.webm`.
- Long pipeline runs make dull video. Record at real speed, then compress time
  in the conversion (`-Speed 6`) so the artefact stays honest but watchable.
- Burn a caption strip into the page (`position:fixed; z-index:2147483647`) so
  the recording explains itself without a voice-over. The caption is written
  from your status poll, the page from its own poll, so the two can differ by
  one tick (46 % in the strip, 45 % on the page). Narrate the step, and let the
  app's own progress bar be the authority on the number.
- **Never caption a negative you inferred from a text search.** MUI buttons
  render their label uppercased, so `innerText.includes("Assign")` is `false`
  while the button plainly reads `ASSIGN`. A caption then told the viewer "the
  assign field only appears once…" with the field visible on screen beside it.
  Match case-insensitively, assert against the element (`locator.count()`), and
  when a check fails prefer saying nothing over asserting an absence.

### Driving the backend directly

UI buttons often omit parameters you need. In TenderTrace the "re-ingest" button
calls the run tool **without** `force`, so a re-run skipped every unchanged file
and there was nothing to film. Fire the tool over HTTP and let the app's own
poller render progress:

```js
await fetch('http://localhost:6060/mcp/<group>', {
  method: 'POST',
  headers: { Authorization: 'test123', 'Content-Type': 'application/json',
             Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
                         params: { name: '<tool>', arguments: { projectName, force: true } } }),
});
// response is SSE: take the line starting with 'data: ', slice(6), JSON.parse,
// then result.content[0].text is itself JSON (sometimes double-wrapped in an array)
```

## 5. Traps that cost real time

- **Backslashes in Bash heredocs.** `C:\Users\ralph` became `C:Usersalph` and the
  browser "did not exist". Write scripts with the Write tool, and use forward
  slashes in paths — Node accepts them on Windows.
- **PowerShell hashtable → JSON.** An empty-ish `@{}` serialises to `[]` and MCP
  rejects it as "expected record, received array". Send a literal JSON string.
- **`-ErrorAction` and native exes.** ffmpeg writes its banner to stderr and
  PowerShell reports exit 1 even on success. Check the output file, not `$?`.
- **Wrong grep extension.** Searching `*.js` missed `viewerRegistry.jsx` and sent
  me down a false "viewer is not registered" path. Search both.
- **Recursive greps into `node_modules`** hang for minutes. Always scope the path.
- **Assuming a component from a name.** The sidebar toggle I clicked opened a
  *project picker*, whose invisible MUI backdrop then swallowed every later
  click. Dump the DOM and read it; do not infer.

## 6. What good looks like

Report what the artefacts show, not that the script ran:

- screenshots named for the step (`e2e-04-contradictions.png`), one per decision point
- for a video: duration, size, and the run's final numbers
- every defect stated as observed-vs-expected, with the file and line to fix

Verify the artefact itself before reporting — read the PNG back, probe the mp4
with `ffmpeg -i`. A screenshot of the wrong tab is worse than none, because it
looks like evidence.
