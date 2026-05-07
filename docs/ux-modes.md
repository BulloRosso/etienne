[← back to README](../README.md)

# User Experience Modes in the Frontend

The frontend supports two UX modes, controlled by the Vite environment variable `VITE_UX_TYPE`:

| Mode | Value | Description |
|------|-------|-------------|
| **Verbose** | `verbose` (default) | Full AppBar with title, budget indicator, scheduling, theme toggle, project selector, and hamburger menu. The ChatPane includes a 48px header with new-chat, plan/work mode toggle, notification bell, resume session, and settings buttons. |
| **Minimalistic** | `minimalistic` | The AppBar and ChatPane header are hidden. A resizable left sidebar (default 300px, range 200–600px) provides quick access to: new chat, settings (as a modal), the 3 most recently used projects, the 5 most recent chat sessions, and the latest notifications. |

## Configuration

Set the default mode via environment variable before starting the Vite dev server:

```bash
# .env or .env.development
VITE_UX_TYPE=minimalistic
```

If not set, the mode defaults to `verbose`.

## Keyboard Shortcut

Press **Ctrl+U** to toggle between verbose and minimalistic mode at runtime. The choice is persisted in `localStorage` (key: `uxModeOverride`) and survives page reloads. A toast notification confirms the switch.

Other keyboard shortcuts:
- **Ctrl+L** — Cycle UI language (English, German, Italian, Chinese)

## Sidebar (Minimalistic Mode)

The sidebar starts at 300px wide and can be horizontally resized by dragging its right edge (range: 200–600px). The width is persisted in `localStorage` (key: `sidebarWidth`).

## Recent Items (Minimalistic Mode)

In minimalistic mode, the sidebar displays recently accessed items. These are tracked in a workspace-level file at `<workspace>/.etienne/recent-items.json`:

- **Projects** — last 10 projects opened (top 3 shown in sidebar)
- **Chats** — last 10 chat sessions accessed (top 5 shown, titled by the first 5 words of the last user message)
- **Notifications** — last 10 notifications sent (top 5 shown, only if any exist)

See [Experimental Features](../experimental-features.md).
