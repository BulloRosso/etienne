# Application Types

An **application type** layers a domain-specific UI on top of an existing Etienne project. It adds a custom sidebar section above the regular **Projects** section — with a coloured background, a heading, and menu items that open documents, modal dialogs, external URLs, or trigger subagent reports. Application types are localized, repository-defined, and version-controlled.

A project's chat, skills, MCP tools and workspace stay unchanged when an application type is attached. The application type is a *projection layer*, not a replacement.

## Concept

A project (e.g. `desalination-devices`) is a Claude Code container. An application type (e.g. `research-project`) is a reusable bundle that gives that container a custom UI affordance.

```
workspace/desalination-devices/
├── .etienne/application-type.json    ← {"id": "research-project"}  ▲
├── .claude/                                                         │ written when
│   ├── agents/                                                      │ the type is
│   │   ├── executive-briefing.md      ← copied from app-type ───────┤ attached
│   │   ├── engineering-faq.md                                       │
│   │   └── …                                                        ▼
│   └── …
└── …

application-types-repository/
└── research-project/
    ├── config.json              ← sidebar bg colour, heading, menu items (i18n)
    ├── resources/
    │   └── workflows-list.html  ← MCP UI resource (sandboxed iframe)
    └── subagents/
        ├── executive-briefing.md
        ├── engineering-faq.md
        ├── onboarding-study-guide.md
        └── decision-register.md
```

## Menu item types

A `config.json` declares a list of menu items, each with one of four types:

| `type`     | Click behaviour                                                                                          |
|------------|----------------------------------------------------------------------------------------------------------|
| `url`      | Opens an external URL in a new browser tab (`window.open(url, '_blank', 'noopener')`).                   |
| `document` | Opens a file from the project as a preview tab in the right-hand artifacts pane (uses the host's tab store). |
| `modal`    | Opens a Dialog hosting a sandboxed MCP UI resource — see *UI resources* below.                            |
| `subagent` | Starts a **fresh chat session** in the project, auto-submits a configured prompt, and the main agent delegates to a registered subagent via the Task tool. |

Every label (the menu item text + the section heading + the type's display name) is a localized object — `{ "en": "…", "de": "…", "it": "…", "zh": "…" }` — resolved by the backend before the frontend ever sees it.

## UI resources (modal dialogs without React coupling)

Modal dialogs are **not** React components compiled into the host bundle. They are MCP UI resources rendered in a sandboxed iframe via `@mcp-ui/client`'s `<AppRenderer>`. The iframe runs with `sandbox="allow-scripts"` (no same-origin, no network for relative URLs) and communicates with the host via the MCP Apps SDK over `postMessage`.

What this buys:

- **Framework-agnostic** — write the UI in plain HTML, Svelte, Vue, vanilla JS; the host doesn't care.
- **Version-decoupled** — no constraints from the host's React or MUI versions.
- **Securely isolated** — the iframe has no access to host cookies, localStorage, or the parent DOM.
- **Tool-driven data** — the iframe calls **MCP tools** through the bridge (`App.callServerTool(...)`); the backend handles auth and data fetch. No JWT minting, no cookie-in-sandbox problem.

How it's wired:

1. Place an HTML file under `application-types-repository/<type>/resources/<name>.html`.
2. The backend's `app-types` MCP group auto-discovers it at boot and registers it as a resource at `ui://app-types/<type>/<name>.html` — adding a new app type is a zero-code-change operation.
3. The HTML uses the inlined MCP Apps SDK (the backend rewrites a `__EXT_APPS_BUNDLE__` placeholder into `window.__mcpApps = { App, PostMessageTransport, ... }`).
4. A menu item with `type: 'modal'` references the resource and the MCP tools it may call:
   ```json
   {
     "type": "modal",
     "payload": {
       "mcpGroup": "app-types",
       "resourceUri": "ui://app-types/research-project/workflows-list.html",
       "toolName": "render_workflows_list",
       "dialog": { "maxWidth": "lg", "fullWidth": true }
     }
   }
   ```

## Subagent menu items

A `subagent` menu item triggers a fresh chat session. The `payload.prompt` is auto-submitted; the prompt instructs the main agent to delegate to a named subagent via the Task tool. The subagent definition is a standard Claude Code `.md` file (YAML frontmatter + system prompt) shipped under the application type's `subagents/` directory.

When the type is attached to a project, the backend copies every `.md` from `subagents/` into the project's `.claude/agents/`. Existing files are **never overwritten** — user customizations are safe.

```json
{
  "type": "subagent",
  "payload": {
    "subagent": "engineering-faq",
    "prompt": "Generate the Engineering FAQ report. Use the Task tool to delegate to the engineering-faq subagent…"
  }
}
```

## The `config.json` schema

```json
{
  "id": "research-project",
  "version": "1.0",
  "labels": { "en": "Research project", "de": "Forschungsprojekt", "it": "Progetto di ricerca", "zh": "研究项目" },
  "sidebar": {
    "bgColor": "#E3F2FD",
    "headingLabels": { "en": "Research project", "de": "Forschungsprojekt", … }
  },
  "menuItems": [
    {
      "id": "<unique-within-config>",
      "type": "modal | document | url | subagent",
      "icon": "<MUI icon name, e.g. AccountTree>",
      "labels": { "en": "…", … },
      "payload": { … }
    }
  ]
}
```

`payload` shapes per type:

| Type      | Required fields                                                            |
|-----------|----------------------------------------------------------------------------|
| `url`     | `url`                                                                      |
| `document`| `path` (relative to the project root)                                      |
| `modal`   | `mcpGroup`, `resourceUri`, `toolName`, optional `dialog: {maxWidth, fullWidth}` |
| `subagent`| `subagent` (name matching a `.md` file), `prompt`                          |

## Attaching an application type

Two paths:

1. **At project creation** — the wizard's first step shows an "Application type" dropdown populated from `GET /api/application-types`.
2. **For an existing project** — Open the project list (sidebar → *More projects*), click the row's `⋮` menu, choose *Change application type…*, pick one, save.

Both paths write `<workspace>/<project>/.etienne/application-type.json` and provision the subagent files.

## Localization

App types are self-contained drop-in folders. All labels are inlined in `config.json` as `{en, de, it, zh}` objects. The backend resolves the active language via `?lng=` on `GET /api/application-types/effective/:project` and returns ready-to-render strings — the frontend never sees the locale map.

The only host-side i18n keys are `wizard:applicationTypeLabel` and `wizard:applicationTypeNoneOption` (the wizard dropdown's chrome).

## API surface

| Method | Path                                            | Description                                           |
|--------|-------------------------------------------------|-------------------------------------------------------|
| GET    | `/api/application-types?lng=<lng>`              | List available types with resolved labels.            |
| GET    | `/api/application-types/:id`                    | Full config (labels still localized maps).            |
| GET    | `/api/application-types/effective/:project?lng=<lng>` | Project's effective config with labels resolved.   |
| PUT    | `/api/application-types/project/:project`       | Body: `{ id: string \| null }`. Sets / clears.        |
| GET    | `/api/application-types/:id/thumbnail`          | PNG thumbnail (public).                               |

Repository path is resolved from `APPLICATION_TYPES_REPOSITORY` (env var) with fallback to `../application-types-repository` relative to `cwd`.

## Authoring a new application type

1. Create `application-types-repository/<your-type-id>/`.
2. Add `config.json` (see schema above).
3. (Optional) Add `resources/*.html` for any modal UI. Use the `__EXT_APPS_BUNDLE__` placeholder so the MCP Apps SDK is inlined automatically.
4. (Optional) Add `subagents/*.md` for any subagent menu items.
5. Restart the backend so the synthetic `app-types` MCP group picks up the new resources.
6. Attach to a project via the wizard or the project-list affordance.

## Worked example: `research-project`

Ships with one modal and four subagent links:

- **Running workflows** — modal listing every XState workflow instance in the project (id, name, current state, last updated). Each row exposes the current state's allowed transitions as buttons; clicking one calls the `workflow_send_event` MCP tool and refreshes.
- **Executive briefing** — one-page status report with top 3 risks, decisions this week, blocking questions. Subagent reads the wiki + knowledge graph.
- **Engineering FAQ** — questions from `OpenQuestion` nodes, answered from connected `Decision`/`Evidence` nodes.
- **Onboarding study guide** — graph traversed in dependency order from the mission root.
- **Decision register** — every `Decision` node as a table row with supporting evidence and contradicting risks.

These four projections are inspired by NotebookLM's Studio outputs (mind maps, flashcards, briefing docs, FAQs): one graph, many audience-tuned views.
