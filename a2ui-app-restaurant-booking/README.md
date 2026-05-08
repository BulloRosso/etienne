# a2ui-app-restaurant-booking

Real-world A2UI demo: the [restaurant-booking lifecycle example](https://a2ui.org/concepts/data-flow/#lifecycle-example-restaurant-booking) running over a real A2A + SSE transport, no MCP tunneling, no Google account, no ADK, no Gemini.

The folder prefix `a2ui-` (not `mcp-app-`) marks the divergence: this app does **not** ride the MCP UI plumbing.

## Architecture

```
┌─────────────────────────────────┐         ┌────────────────────────────┐
│  Frontend chat UI (port 5000)   │         │  A2UI agent (port 4110)    │
│                                 │         │                            │
│  Preview pane                   │  HTTP   │  POST /a2a (JSON-RPC)      │
│  └─ A2UIAppViewer.jsx           │ ◄─SSE─► │   ├─ message/stream  (SSE) │
│      (mounted by .a2ui file)    │  proxy  │   └─ action/submit         │
│      ├─ @a2ui/react v0_9        │         │  GET /.well-known/agent.json│
│      ├─ @a2ui/web_core v0_9     │         │  GET /health               │
│      └─ MessageProcessor        │         │                            │
└─────────────────────────────────┘         └────────────────────────────┘
                  ▲                                      │
                  │            A2A Message               │
                  │  parts: DataPart × N                 │
                  │  mimeType: application/json+a2ui     │
                  │  data: { version: "v0.9", ... }      │
                  └──────────────────────────────────────┘
```

- The **agent** is a deterministic state machine (no LLM). It serves an Agent Card declaring the A2UI extension `https://a2ui.org/a2a-extension/a2ui/v0.8` and streams A2UI v0.9 messages inside A2A `DataPart`s.
- The **renderer** is a regular React component in the frontend bundle. It uses `MessageProcessor` from `@a2ui/web_core/v0_9` and `<A2uiSurface />` from `@a2ui/react/v0_9`. Action events round-trip via a separate JSON-RPC `action/submit` call.
- Integration with the chat UI is via a **`.a2ui` workspace file**. The file is a tiny JSON descriptor (`{ endpoint, title, prompt }`) that the frontend's file-extension previewer picks up — opening it in the file tree mounts the renderer and connects it to the agent. Adding a second A2UI app means dropping a second `.a2ui` file (and proxying its endpoint in `vite.config.js`).

## Styling: who owns the look

In A2UI's design, **styling lives with the host (the renderer), not with the agent.** The agent emits *semantic* component descriptions:

```json
{ "id": "submitBtn", "component": "Button", "variant": "primary", "child": "submitLabel" }
```

It does not say "blue, 6px-rounded, 8px padding". The renderer interprets `variant: "primary" | "default" | "borderless"` and decides what that looks like.

### Why this matters — A2UI vs. MCP UI

| | **A2UI** | **MCP UI** |
|---|---|---|
| What the server sends | Semantic component tree (`{component:"Button"}`) | HTML, an external URL, or RemoteDOM markup |
| Where rendering happens | Native widgets in the host's framework | Inside a sandboxed `<iframe>` (`sandbox="allow-scripts"` for raw HTML; `allow-scripts allow-same-origin` for external URLs) |
| Who controls the look | **Host** — maps semantics → native styling | **Server** — its HTML/CSS lands verbatim in the iframe |
| Possible hosts | Web (React/Lit/Angular), Flutter, native iOS/Android, kiosk — anything that can paint widgets | Browsers and WebViews only (you need a browser engine to render the iframe) |

A2UI's rule "agent expresses intent, host decides paint" is what makes **non-HTML hosts** possible. The same `{component:"Button", variant:"primary"}` can render as an MUI button on web, a `Cupertino` button on iOS, or a curses widget in a terminal — without the agent knowing or caring. MCP UI takes the opposite trade: by handing the server a sandboxed iframe, it gives the server full layout control at the cost of being effectively browser-only and unable to restyle to host conventions.

If the A2UI agent prescribed CSS, the protocol would collapse into "send arbitrary HTML" — which is exactly what MCP UI does. A2UI's deliberate avoidance of that is what buys the cross-host story.

### How we apply MUI styling here

`@a2ui/react` ships a default catalog (`basicCatalog`) that paints to plain `<button>`, `<input>`, `<label>`, etc. with its own `.a2ui-*` classes. To make A2UI surfaces look native to this app, the **host** (`frontend/`) builds a custom catalog of MUI-backed component implementations and feeds it to `MessageProcessor`. The agent stays untouched.

The strategy in three steps:

1. **Reuse the catalog id.** A custom `Catalog` is constructed with the *same id* basicCatalog uses (`https://a2ui.org/specification/v0_9/basic_catalog.json`), so the agent's `createSurface.catalogId` keeps matching.
2. **Override only what's needed.** Inherit basicCatalog's component list and replace the 5 components this demo uses (Column, Text, TextField, Button, DateTimeInput) with MUI versions. Anything else falls back to the basicCatalog default.
3. **Map A2UI variants to MUI variants.** The semantic enums survive; only the visual layer changes:

   ```jsx
   // frontend/src/components/a2ui/muiCatalog.jsx
   const MuiButtonImpl = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
     const variant = props.variant === 'primary'   ? 'contained'
                   : props.variant === 'borderless' ? 'text'
                   : 'outlined';
     return (
       <MuiButton variant={variant} color="primary" onClick={props.action}
                  disabled={props.isValid === false}>
         {props.child ? buildChild(props.child) : null}
       </MuiButton>
     );
   });

   const MuiText = createComponentImplementation(TextApi, ({ props }) => {
     const muiVariant = { h1: 'h4', h2: 'h5', body: 'body1', caption: 'caption' }
                        [props.variant || 'body'] || 'body1';
     return <Typography variant={muiVariant}>{props.text}</Typography>;
   });
   ```

   Note that `props.text`, `props.variant`, `props.action`, `props.setValue`, `props.children` are **already resolved** by A2UI's generic binder — the renderer never sees raw `{path: ...}` BoundValues, just the live string/number/setter/callback.

4. **Wire the catalog into the processor:**

   ```jsx
   import { muiCatalog } from './a2ui/muiCatalog';
   const processor = new MessageProcessor([muiCatalog], onAction);
   ```

The full implementation lives in [frontend/src/components/a2ui/muiCatalog.jsx](../frontend/src/components/a2ui/muiCatalog.jsx) (~150 LOC, 5 component overrides). To make a new A2UI app look native, point its renderer at the same `muiCatalog` — the host theme is inherited automatically.

## Validation: who owns the rules

Same shared-ownership pattern as styling, on a different axis: **the agent declares the rules, the host enforces them.**

The agent attaches `checks: [{condition, message}]` arrays to inputs and to the submit Button. Each `condition` is a `DynamicBoolean` (typically a function call like `required` against a path-bound value). Example from this demo's booking form:

```jsonc
// agent → host (inside an updateComponents message)
{
  "id": "guests",
  "component": "TextField",
  "label": "Number of guests",
  "value": { "path": "/reservation/guests" },
  "checks": [
    {
      "condition": {
        "call": "required",
        "args": { "value": { "path": "/reservation/guests" } },
        "returnType": "boolean"
      },
      "message": "Please enter the number of guests."
    }
  ]
}
```

The same `checks` array appears on the **Button** so it can auto-disable while the form is incomplete.

What each side does:

| Concern | Agent (server) | Host (renderer) |
|---|---|---|
| **Defining the rule** | Emits `checks` per component, with a localizable `message` | — |
| **Evaluating the rule** | — | Runs each `condition` against the live data model on every keystroke |
| **Surfacing errors** | Provides the user-facing `message` | Renders it (in our MUI catalog: MUI `helperText` with `error={true}`) |
| **Blocking submit** | Adds `checks` to the Button | Reads `props.isValid` (false if any Button check fails); `MuiButtonImpl` does `disabled={isValid === false}` |
| **Server-side validation** (e.g. "slot already booked") | Returns an `error`, re-emits the surface with details | Renders the re-emitted surface |

Why this split:

- **Domain knowledge belongs to the agent.** Only the agent knows guests is required, the date must be in the future, the number must be ≥ 1, etc. The host can't guess.
- **Round-trip avoidance.** Client-side checkable rules are evaluated locally, so the user gets instant feedback and the agent never receives a userAction with invalid data.
- **No cheating.** If the agent didn't declare a rule, the host won't invent one. Required-ness is a server-declared contract.
- **Server-side checks still happen for what the client can't verify** — those come back as `error` responses and the agent re-renders with details.

Net result for our demo: **the Confirm button is disabled until both fields are filled,** and per-field error helper text appears under any empty input the user has touched. Zero host-side logic was added — `MuiTextFieldImpl` already wires `validationErrors[0] → helperText`, and `MuiButtonImpl` already wires `isValid → disabled`. Adding the rules was purely an agent change.

## Run it

In two terminals:

**Terminal 1 — agent**
```bash
cd a2ui-app-restaurant-booking
npm install        # first time only
npm run dev        # tsx watch
```
Logs:
```
[a2ui-restaurant] agent listening on http://127.0.0.1:4110
[a2ui-restaurant] Agent Card: http://127.0.0.1:4110/.well-known/agent.json
```

**Terminal 2 — frontend (already part of the main repo)**
```bash
cd frontend
npm run dev        # vite dev server on :5000
```

Then in the running app:
1. Open project **`web-test`**.
2. In the file tree, click **`restaurant-booking.a2ui`** (at the project root). It's a small JSON descriptor; the `.a2ui` extension is wired to `A2UIAppViewer`, which mounts in the preview pane.
3. The booking form renders: title, datetime picker, guests field, Confirm button.
4. Fill the form, click **Confirm booking** — the surface is replaced by a confirmation panel.

The descriptor:
```json
{ "endpoint": "/a2ui-restaurant", "title": "Restaurant Booking", "prompt": "book a table" }
```
`endpoint` is the Vite-proxied prefix (forwarded to `:4110`); `prompt` is the initial user message that bootstraps the stream.

Inspect traffic in DevTools: only `/a2ui-restaurant/...` (proxied to `:4110`) — no `/mcp/*` calls.

## Verify by hand

```bash
# Agent Card
curl http://127.0.0.1:4110/.well-known/agent.json

# Open an A2UI stream — first SSE frames should include createSurface +
# updateComponents + 2 × updateDataModel inside an A2A Message envelope
curl -N -X POST http://127.0.0.1:4110/a2a \
  -H 'Content-Type: application/json' \
  -H 'X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.8' \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/stream","params":{"message":{"role":"user","parts":[{"kind":"text","text":"book"}]}}}'
```

## What this is not

- Not an LLM-driven agent. The booking flow is a hand-rolled state machine in [src/booking-state-machine.ts](src/booking-state-machine.ts). Adding an LLM is mechanical but out of scope for the demo.
- Not a generic A2UI SDK. The transport glue lives in [src/server.ts](src/server.ts); if you build a second A2UI app, factor the shared bits out then.

## Files of interest

- [src/server.ts](src/server.ts) — Express A2A server: Agent Card, `message/stream` SSE, `action/submit`.
- [src/booking-state-machine.ts](src/booking-state-machine.ts) — deterministic state machine.
- [src/booking-surface.ts](src/booking-surface.ts) — A2UI v0.9 surface payloads.
- [src/a2ui-messages.ts](src/a2ui-messages.ts) — minimal v0.9 message builders.
- [../frontend/src/components/A2UIAppViewer.jsx](../frontend/src/components/A2UIAppViewer.jsx) — the generic `.a2ui` previewer; reads the descriptor and connects to whichever endpoint it points at.
- [../frontend/src/components/viewerRegistry.jsx](../frontend/src/components/viewerRegistry.jsx) — registers `.a2ui` → `A2UIAppViewer` in `BUILTIN_DEFAULTS`.
- [../frontend/vite.config.js](../frontend/vite.config.js) — `/a2ui-restaurant` → `localhost:4110` proxy.
- [../workspace/web-test/restaurant-booking.a2ui](../workspace/web-test/restaurant-booking.a2ui) — the descriptor that launches this demo from the file tree.
