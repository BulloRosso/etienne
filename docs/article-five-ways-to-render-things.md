# Five Ways to Render Things in Etienne — and How to Pick

*Or: I have a JSON file and an agent. Where does the UI live?*

---

## 1. The Gantt chart that watches you

Open `project.gantt.json` in any Etienne project. You get a Gantt chart. Drag a task left. Drop it. The chart redraws.

That part is unsurprising — every PM tool on earth has a Gantt chart. Here is the part that is surprising:

```jsx
const handleSaveName = useCallback(() => {
  setGanttData(prev => {
    let tasks = updateTaskInTree(prev.tasks, nameModalTask.id, { name: newName });
    const updated = { ...prev, tasks, userEdited: [...(prev.userEdited||[]), edits] };
    debouncedSave(updated);
    return updated;
  });
}, [...]);
```

[GanttDiagram.jsx](../frontend/src/components/GanttDiagram.jsx) keeps a `userEdited` array. Every nudge, every renamed task, every drag-and-drop appends a row: *who touched what, when, what was the old value, what is the new value.* When you stop dragging, a debounced PUT writes the whole thing back to the workspace file. The agent sees that file. The agent sees `userEdited`. The agent now knows that you just pushed the launch back two weeks, and it can do something about it — write the apology email, reshuffle dependencies, or tell you (kindly) why pushing it back two weeks won't actually help.

This is the trick: **the diagram is not just a viewer; it's a side channel**. Humans speak to the agent through structural edits, not just chat.

You have just seen one of five ways Etienne lets a UI exist. There are four others. They all solve "render something interactive in the preview pane," and yet they pick wildly different trade-offs. The rest of this article is about *when to pick which*.

> 🎬 [Video placeholder: 30s clip of dragging tasks in the Gantt viewer, showing the agent picking up `userEdited` in real time and proposing a schedule fix in chat.]

---

## 2. The five doors

Every "render something" feature in Etienne walks through one of these five doors. Each door has a canonical example you can open right now and read:

| # | Door | Canonical example | What activates it |
|---|------|-------------------|-------------------|
| 1 | Local file previewer | `.md` → `MarkdownViewer` | File extension click |
| 2 | Local *rich* file previewer | `.gantt.json` → `GanttDiagram` | File extension click |
| 3 | MCP UI component | `.budget.json` → `mcp-app-budget` | File extension click → MCP tool → sandboxed iframe |
| 4 | Remote service previewer | `#imap/inbox` → `IMAPInboxViewer` | Service path (no file) |
| 5 | A2UI app previewer | `.a2ui` → `A2UIAppViewer` | File extension click → A2A+SSE stream |

These are listed in roughly increasing order of "how much of the system has to be alive for the thing to render." A markdown file renders if Etienne's frontend bundle loads. An A2UI app needs an external agent process speaking JSON-RPC over SSE.

Let's walk each door, then build something that uses all five at once.

---

## Door 1 — Local file previewer (Markdown)

**The shape:** Click a file. A React component in the bundle reads it and paints it.

```jsx
const response = await apiFetch(
  `/api/workspace/${encodeURIComponent(projectName)}/files/${filename}`
);
const markdownText = await response.text();
const cleanHtml = DOMPurify.sanitize(await marked.parse(markdownText));
```

That is the entire interesting code path of [MarkdownViewer.jsx](../frontend/src/components/MarkdownViewer.jsx). Registration is one line in [viewerRegistry.jsx](../frontend/src/components/viewerRegistry.jsx): `{ viewer: 'markdown', extensions: ['.md'] }`. Done.

**Who owns what:** the host owns *everything* — fetch, parse, sanitize, layout, theming, edit mode, save. The backend is a dumb file store (`/api/workspace/.../files/{filename}`). The agent doesn't appear in this story at all.

**Pick this door when:** the file format is widely understood (Markdown, JSON, images, CSV), rendering is mechanical, and the user does not need to negotiate with a remote process. If you can describe the previewer as "parse and paint," this is your door.

---

## Door 2 — Local *rich* file previewer (Gantt)

Same plumbing as door 1 — but the component is no longer a parser. It's an editor with feelings.

**Where the trick lives:** [GanttDiagram.jsx](../frontend/src/components/GanttDiagram.jsx) takes a `onViewerStateChange` callback in its props (this is the only viewer in the registry that does — see [viewerRegistry.jsx:125-127](../frontend/src/components/viewerRegistry.jsx#L125-L127)). Every meaningful interaction emits `{ userEdited, selectedTasks }` upward, where the chat surface picks it up and the agent reads it.

So the Gantt viewer and the agent share a tiny structured language: *"I changed task X's end-date by Δ days; here is the audit trail."* The agent doesn't need to OCR your screen. It reads the diff.

**Who owns what:** the host owns rendering and the schema (a JSON tree of tasks). The agent owns *interpretation* — what does it mean that you moved this task? The file is the durable contract; the `userEdited` array is the conversation.

**Pick this door when:** you need a domain-specific direct-manipulation UI (Gantt, Kanban, flowchart, scrapbook, requirements list) **and** you want the agent to react to user edits structurally rather than reading chat messages like "I moved task 3." This door is where Etienne's "human-to-agent through artifacts" pattern really lives.

The cost: every interactive widget you ship is React code in your bundle. Five Ganttviewers means five Ganttviewers' worth of bundle size.

---

## Door 3 — MCP UI component (Budget donut)

You have a workspace file. You want a UI that the *server* owns end-to-end — its own HTML, its own interactivity, its own state. You also want it sandboxed, because the server is not your code.

This is the MCP UI door.

**The shape:** an `.budget.json` file is registered with `type: 'mcpui'`, `mcpGroup: 'budget'`, `mcpToolName: 'render_budget'`. When the user clicks the file, the frontend doesn't render it directly. Instead:

```jsx
const result = await mcpClient.callTool({
  name: 'render_budget',
  arguments: { filename, content },
});
<AppRenderer
  client={client}
  toolResult={result}
  sandbox={{ url: SANDBOX_PROXY_URL }}
/>
```

`AppRenderer` from [@mcp-ui/client](https://mcpui.dev) drops the server's HTML resource into a sandboxed iframe. The MCP server (in [backend/src/mcpserver/budget-tools.ts](../backend/src/mcpserver/budget-tools.ts)) advertises a tool `render_budget` whose result is a UI resource pointing at `mcp-app-budget/dist/mcp-app.html`. Click a donut slice → the iframe posts a message → the parent calls a *different* MCP tool (`select_budget_items`) → result flows back.

**Who owns what:** *the server*. Layout, styling, interaction logic — all on the MCP side. The host gives it a sandboxed rectangle and a postMessage bridge.

**Pick this door when:** you want to ship a component that is *not your code* — a third-party MCP server's UI, or a piece of your own UI that you want to evolve independently of the Etienne bundle (deploy schedules, A/B test different renderers, etc.). MCP UI is the right answer when "who can change this UI?" has a different answer from "who maintains Etienne's frontend?"

The cost: it's an iframe. You inherit the iframe's ergonomics — communication via postMessage, no shared CSS, awkward focus management. And the renderer must be HTML; you cannot reuse this on iOS or in a kiosk app without a browser engine.

---

## Door 4 — Remote service previewer (IMAP)

Now the thing you want to render isn't in a file at all. It's in the *world*.

The IMAP inbox doesn't have a file extension because there is no file. There's an email server, somewhere, with new messages arriving every few seconds. You want a viewer that *is* a live window into that.

**The shape:** instead of a file path, the previewer is keyed off a *service path* like `#imap/inbox`. Open it with `filePreviewHandler.handlePreview('#imap/inbox', currentProject)`. The dispatch in [viewerRegistry.jsx:196-200](../frontend/src/components/viewerRegistry.jsx#L196-L200) parses the leading `#`, looks up `SERVICE_PREVIEWERS['imap']`, and mounts [IMAPInboxViewer.jsx](../frontend/src/components/IMAPInboxViewer.jsx).

```jsx
apiFetch('/api/email/folders')
  .then(res => res.json())
  .then(data => setFolders(data.folders));
```

There is no descriptor file. There is a backend service (`/api/email/*`) which probes the IMAP server, and a sidebar item that only appears when `/api/email/status` says the service is up.

**Who owns what:** the remote service owns the data model and the freshness semantics. The frontend owns layout. The backend is a thin proxy with auth.

**Pick this door when:** the data is fundamentally not file-shaped. It's a queue, a stream, a remote inbox, a live sensor. Forcing it into a `.json` file would be a lie — the file would either be stale or you'd have to re-write it on every poll.

The cost: discoverability. Service previewers don't show up in the file tree. You have to surface them somewhere — a sidebar item, a chat command, a launcher. They're chrome, not artifacts.

---

## Door 5 — A2UI app previewer (Restaurant booking, and friends)

This is the new door. It is the most powerful one, and it is also the one that most easily gets confused with the others, so we'll spend a minute on what it actually is.

**The shape:** drop a tiny JSON file in your workspace. For instance, `restaurant-booking.a2ui`:

```json
{ "endpoint": "/a2ui-restaurant", "title": "Restaurant Booking", "prompt": "book a table" }
```

That's it. Click the file. [A2UIAppViewer.jsx](../frontend/src/components/A2UIAppViewer.jsx) reads the descriptor, opens an SSE stream to `endpoint/a2a`, and starts speaking the [A2A protocol](https://a2a.io). The agent on the other end emits A2UI v0.9 messages — `createSurface`, `updateComponents`, `updateDataModel` — and the frontend renders them as native MUI widgets via a custom catalog.

```jsx
const processor = new MessageProcessor([muiCatalog], async (action) => {
  await fetch(`${endpoint}/a2a`, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'action/submit',
      params: { streamId, action },
    }),
  });
});
```

The agent says "I want a TextField bound to `/reservation/guests` with a `required` check." The host decides what a TextField *looks like* (an MUI `<TextField>`, in our case) and what `required` *enforces* (disables submit, renders helperText). The agent never sends CSS. It sends *intent*.

**Why this is its own door, not a flavor of the others:**

- It's not Door 2 (Gantt) because the agent **declares the component tree**; the host does not pre-bake a Gantt-shaped editor.
- It's not Door 3 (MCP UI) because rendering is **native React widgets, not an iframe**. The same A2UI surface can paint as MUI on web, Cupertino on iOS, or curses widgets in a terminal — there is no HTML in the protocol.
- It's not Door 4 (IMAP) because the activation surface is **a workspace file**, not a service hash. Each `.a2ui` file is a *named, versionable, copy-pasteable* pointer to one A2UI app.

**Who owns what:**
- **Agent owns:** component tree, data model schema, validation rules, business logic.
- **Host owns:** what `Button variant="primary"` *looks* like, how validation errors render, what a date picker is.
- **File owns:** which agent to talk to (`endpoint`), and the opening line of the conversation (`prompt`).

**Pick this door when:** you want an agent — possibly written by someone else, possibly running on someone else's infrastructure — to express a UI without dictating its appearance, and without you shipping that UI's React code in your bundle. A2UI is the answer to "I want pluggable agents that bring their own UI but inherit my host's look-and-feel."

The cost: you are betting on a young protocol (v0.9 at time of writing). The win: the same `restaurant-booking.a2ui` file works on any A2UI host, not just Etienne. The agent doesn't know or care.

---

## The decision spine: who owns the data model?

Five doors, one question that separates them cleanly. *Where does the data model live?*

| Door | Data model owner | Validation runs in | Failure mode if owner is offline |
|------|------------------|--------------------|----------------------------------|
| 1. Markdown | The file | Frontend (none, really — it's prose) | Impossible — the file is local |
| 2. Gantt | The file (schema in TS) | Frontend (host enforces) | Impossible — it's local |
| 3. MCP UI | MCP server's tool schema | MCP server (server validates) | Iframe shows error; file unaffected |
| 4. IMAP | Remote IMAP server | Backend proxy (relays errors) | Sidebar item disappears; nothing to view |
| 5. A2UI | Agent's state machine | Agent declares, host enforces locally; agent re-validates server-side | Connection-error panel; descriptor stays in workspace |

This axis predicts almost everything else: latency profile (local = instant, agent = round-trip), bundle size (local = ships React; remote = doesn't), tooling burden (local = TypeScript types in your repo; remote = schema lives elsewhere), and most importantly, **portability** (Doors 1-2 die when Etienne dies; Door 5's `.a2ui` files work on any A2UI host).

Pick the door whose owner matches the data's actual home.

---

## The unifying example: the launch-day workspace

Theory is cheap. Here is one application that *naturally* uses all five doors, where swapping any of them makes the design worse.

You're shipping a product. The launch is in eight weeks. You give Etienne a project called `launch-q4`. By the time you're done, the workspace looks like this:

```
launch-q4/
├── brief.md                       ← Door 1: Markdown
├── timeline.gantt.json            ← Door 2: Gantt
├── marketing-spend.budget.json    ← Door 3: MCP UI
├── vendor-booking.a2ui            ← Door 5: A2UI
└── (sidebar) Inbox                ← Door 4: IMAP
```

**[brief.md](Door 1)** holds the launch narrative. PR talking points, target audience, success metrics. Prose. Humans and the agent both edit it; it's a markdown file, no more interesting than that. Door 1 because the format is universal and there's no behavior to coordinate — just text.

**[timeline.gantt.json](Door 2)** holds the schedule. Marketing campaign starts week 3. PR embargo lifts week 6. Engineering hardening, QA, social, all the dependencies. You drag a task; the agent sees `userEdited` in the file diff and writes back: "Pushing 'press preview' two days conflicts with the embargo. Should I move the embargo?" Door 2 because the artifact is structured *and* you want the agent to react to your edits without asking you to retype them in chat.

**[marketing-spend.budget.json](Door 3)** holds the campaign budget. The donut chart that renders it is shipped by the marketing team's MCP server, not by Etienne — they update its colors, add new chart types, add an "explain this slice" button, and the launch workspace picks up the new behavior the next time you open the file. Door 3 because the renderer's release cycle is independent of Etienne's. (And because they want server-side state for the "explain this slice" interactions.)

**The IMAP inbox** is in the sidebar, not the file tree. Vendor quotes, press RSVPs, partner replies all flow into a real mailbox at a real IMAP server. The viewer is a live window. Door 4 because there is no file; there's a stream of new messages arriving from outside the workspace. Trying to make this a `.json` file is what people do for a week before they realize it's wrong.

**[vendor-booking.a2ui](Door 5)** is one line of JSON pointing at the venue's A2UI agent. Click it; you get a booking form rendered in *your* MUI theme, validated by *their* business rules, talking to *their* state machine. The next vendor — caterer, AV company, livestream service — is another `.a2ui` file pointing at a different agent. Each one runs on a different machine. None of them are part of Etienne's codebase. The host (Etienne) doesn't grow; the catalog of `.a2ui` files in the workspace does.

Now ask the swap test:
- Replace Markdown with A2UI? Now you have to run an agent process to display flat prose. Insane.
- Replace Gantt with MCP UI? Now the user's drag is sandboxed in an iframe and `userEdited` doesn't reach the agent without a postMessage bridge you don't want to build. Painful.
- Replace MCP UI with a local viewer? Your bundle has to ship the marketing team's chart code, on their release schedule. Organizationally impossible.
- Replace IMAP with a `.eml` file viewer? You'd have to poll IMAP server-side and rewrite a file on every new message. Ugly and stale.
- Replace A2UI with a static React form? Now you ship a different React component for every vendor, on their schema, in your repo. You become a vendor integration shop instead of a project workspace.

Each door pulls its weight. Pick the one whose ownership boundary matches your problem.

---

## Why you should poke at this

Etienne is, frankly, a good place to experiment with all of these. The plumbing is *small*. The frontend extension registry is one file ([viewerRegistry.jsx](../frontend/src/components/viewerRegistry.jsx)) — a hundred-line dispatcher with built-in defaults plus an env-var override. Adding a new file extension is one entry. Adding a new MCP UI component is two: register the extension, write the MCP tool. Adding a new A2UI app is *zero changes to Etienne* — you just drop a `.a2ui` file in a project.

The protocols are open, the catalogs are extensible, and the demos are short enough to read in one sitting:
- [a2ui-app-restaurant-booking/](../a2ui-app-restaurant-booking/) — ~600 lines, no LLM, deterministic state machine, full A2UI v0.9.
- [mcp-app-budget/](../mcp-app-budget/) — MCP server + sandboxed HTML resource.
- [GanttDiagram.jsx](../frontend/src/components/GanttDiagram.jsx) — full read/write to workspace + `onViewerStateChange` for agent feedback.

If you've ever wanted to play with A2UI, MCP UI, or "how do I let an agent and a human collaborate through a structured artifact," there is a working surface here for each, side by side, in one repo.

Pick a door. Open it. The Gantt chart is watching.

---

*A2UI app integration in Etienne shipped via [pull-request placeholder]. The five-door taxonomy is based on patterns observed in [`viewerRegistry.jsx`](../frontend/src/components/viewerRegistry.jsx) and the previewer service at [`backend/src/previewers/previewers.service.ts`](../backend/src/previewers/previewers.service.ts).*
