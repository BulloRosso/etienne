# Fleet Alignment — MCP UI Previewer

Renders `.alignment.json` nightly fleet-alignment reports (produced by the
`tanker-long-horizon` curator cron) as an interactive dashboard inside
Etienne's preview pane.

## How it works

```
User opens out/nightly-alignment/<date>.alignment.json
  -> FilesPanel detects type: 'mcpui' via previewer-metadata.json
  -> McpUIPreview connects to /mcp/alignment
  -> Calls render_alignment tool with { filename, content }
  -> Backend returns the parsed report as a CallToolResult
  -> AppRenderer loads the built MCP App HTML in a sandboxed iframe
  -> React dashboard renders: fleet summary, per-vessel cards,
     axis drill-down (rationale + provenance), hard-rule grid, agent notes
```

## Features

- **Fleet summary** — vessel counts, weighted alignment, acceptance criterion,
  drift flags.
- **Vessel cards** — colour-coded by status (`Aligned` / `Watch` / `Off-strategy`),
  with weighted score per axis and expandable rationale + provenance.
- **Drill-down per axis** — `compliance_envelope`, `charter_ability`,
  `residual_value_glide`, `hull_maintenance_state`: click an axis to see the
  scoring rationale and the source documents it cites.
- **Assumptions / hypotheses / gates / open questions** — surfaced as chips
  and blocks under each vessel.
- **Vessel selection** — click the `○` mark on a vessel card to flag it for
  discussion. Selected vessel names are posted upstream via
  `viewer-state-update`, so the chat model sees what the user is focused on.
- **Hard-rule compliance grid** and **agent notes** footer.

## Build

```bash
npm install
npm run build
```

Produces `dist/mcp-app.html` — a single self-contained HTML file that the
backend serves as an MCP resource.

## Project structure

```
mcp-app-alignment/
  mcp-app.html          Entry HTML (dev, sources /src/mcp-app.tsx)
  vite.config.ts        Vite + viteSingleFile plugin
  src/
    mcp-app.tsx         React root + components (FleetSummary, VesselCard, AxisRow, …)
    mcp-app.module.css  Component styles
    global.css          CSS resets, design tokens
  dist/
    mcp-app.html        Built output (loaded by backend at runtime)
```

## Backend integration

- Tool service: `backend/src/mcpserver/alignment-tools.ts` — exposes
  `render_alignment({ filename, content }) -> parsed report`.
- Registered as the `'alignment'` group in
  `backend/src/mcpserver/mcp-server-factory.service.ts`.
- Previewer registered in `backend/src/previewers/previewer-metadata.json`:

  ```json
  {
    "viewer": "alignment",
    "type": "mcpui",
    "extensions": [".alignment.json"],
    "mcpGroup": "alignment",
    "mcpToolName": "render_alignment"
  }
  ```

## Sample data

The `tanker-long-horizon` seed (see `scripts/seed-long-horizon-commitments/`)
writes a sample `out/nightly-alignment/<runDate>.alignment.json` so the
previewer auto-opens with realistic data right after seeding.
