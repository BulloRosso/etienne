---
name: simulator-author
description: |
  Generate an interactive "application simulator" — a tiny, agent-built
  React mock of an external app (SAP MD04, a CRM, an ERP form) that the
  trainee can click through. The trainee's clicks stream back to you via
  viewerState so you can coach in real time. Each simulator is a single
  self-contained HTML file under `out/simulators/<app>.simulator.html`.
  Use this skill when the expert asks for a simulator (often in the
  context of curriculum topic 4 "Werkzeuge") or when a guest asks "can I
  practice this somewhere?".
version: 1.0
trigger:
  - expert: "build a simulator for X"
  - guest: "can I practice clicking through X?"
  - completion of a tools topic (4.x) that benefits from hands-on
roles:
  - user
  - guest
---

# Application Simulator authoring

You build small mock applications the trainee clicks through, and you
coach them in real time using their click stream. Three core constraints:

1. **We do not reimplement the real application.** A simulator is a
   tiny, lightly-stylised illusion — at most 3 screens, at most ~6
   hot-spots per screen. The trainee learns *the muscle memory*, not
   the actual app.
2. **Every simulator is one self-contained HTML file** under
   `out/simulators/<app-id>.simulator.html` (e.g.
   `sap-md04.simulator.html`). No bundling, no npm. React + MUI via
   CDN.
3. **The trainee's clicks must reach you.** The HTML emits
   `viewer-state-update` postMessage events on every click; the host
   forwards them into the chat session's viewerState. You read them on
   your next turn and respond.

## When to invoke

- Pro-active: when a curriculum topic 4.x (a tool) has a natural
  "click-through" component the trainee can practice — e.g. 4.6
  "JIRA + Polarion" benefits from a 2-screen JIRA mini-flow.
- Explicit: the trainee or expert asks for a simulator. The expert may
  describe the screens in prose ("show them how to open MD04, filter
  for a material, and read the production order list"); you transcribe
  that into the HTML.
- After the simulator session is over: write a brief Q/A entry under
  the relevant ToC node, capturing *what they actually clicked* (from
  viewerState) and how it compared to the expected sequence.

## How to build the simulator

### 1. Plan the screens

- Max 3 screens. If the expert describes more, pick the 3 most
  load-bearing and tell them the others were dropped.
- Each screen has: a chrome bar (app name + a few fake menu items), a
  body (the form / list / dashboard you mock), and at most ~6
  hot-spots.
- Hot-spots are clickable elements with an `id` and a `data-step-id`
  attribute. The simulator picks them up generically.

### 2. Plan the expected sequence

- Define `EXPECTED_STEPS` — an ordered array of `{stepId, screenId,
  description, successHint, errorHint}`. This is your script.
- A step's `successHint` is what you'd say if the trainee clicks the
  right thing. The `errorHint` is your fallback if they click
  elsewhere.

### 3. Use the boilerplate

The HTML file MUST follow this contract. Copy this skeleton verbatim
into every simulator you author, then fill in the marked sections.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulator — <APP NAME></title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://unpkg.com/@mui/material@5/umd/material-ui.production.min.js" crossorigin></script>
<style>
  html, body { margin: 0; padding: 0; min-height: 100vh; background: #eef2f6; font-family: 'Roboto', system-ui, sans-serif; }
  #root { min-height: 100vh; box-sizing: border-box; padding: 16px; }
  .sim-hotspot { cursor: pointer; transition: outline 0.15s; }
  .sim-hotspot:hover { outline: 2px solid #1976d2; outline-offset: 2px; }
  .sim-hotspot.sim-highlight { outline: 3px solid #f57c00; outline-offset: 3px; animation: simPulse 1.4s infinite; }
  @keyframes simPulse { 0%,100% { outline-color: #f57c00; } 50% { outline-color: #ffb74d; } }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useCallback } = React;
const { Box, AppBar, Toolbar, Typography, Button, Paper, Stack, Chip, IconButton } = MaterialUI;

const APP_META = {
  appId: 'sap-md04',                 // ← match the filename slug
  appName: 'SAP — Production Overview (MD04)',
  accentColor: '#0070c0',            // ← per-app brand-ish tint
};

const EXPECTED_STEPS = [
  // ← fill in 3-8 steps. Example:
  // { stepId: 'open-md04', screenId: 'launchpad', description: 'Open MD04 from the launchpad', successHint: 'Good — you found the tile.', errorHint: 'MD04 is the production-overview tile; try the lower-left one.' },
];

// Each screen is a React component. Keep them small and visually
// distinct so the trainee can tell where they are.
function ScreenLaunchpad({ onHotspot }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6">SAP Launchpad</Typography>
      {/* ← render hot-spots. Each gets className "sim-hotspot" and a
          data-step-id matching one of EXPECTED_STEPS. */}
      <Box id="tile-md04" data-step-id="open-md04" className="sim-hotspot"
           onClick={() => onHotspot('open-md04')} sx={{ /* ... */ }}>
        MD04 — Production overview
      </Box>
    </Paper>
  );
}

// ← add ScreenMaterialInput, ScreenResults etc. for each screen.

const SCREENS = {
  launchpad: ScreenLaunchpad,
  // 'material-input': ScreenMaterialInput,
  // 'results':       ScreenResults,
};

function App() {
  const [screenId, setScreenId] = useState('launchpad');
  const [clicks, setClicks] = useState([]);            // full log
  const [highlightStepId, setHighlightStepId] = useState(null);
  const [hint, setHint] = useState(null);

  const post = useCallback((state) => {
    try { window.parent.postMessage({ type: 'viewer-state-update', state }, '*'); } catch {}
  }, []);

  const onHotspot = useCallback((stepId) => {
    const expected = EXPECTED_STEPS[clicks.length];
    const correct = expected ? expected.stepId === stepId : false;
    const next = [...clicks, { stepId, screenId, t: Date.now(), correct }];
    setClicks(next);
    // Optional: drive screen transitions per stepId
    // if (stepId === 'open-md04') setScreenId('material-input');
    post({ appId: APP_META.appId, appName: APP_META.appName, clicks: next, currentScreen: screenId, expectedNext: EXPECTED_STEPS[next.length]?.stepId ?? null });
  }, [clicks, screenId, post]);

  // Receive viewer-command from the agent (highlight_simulator_step)
  useEffect(() => {
    const handler = (event) => {
      const data = event.data;
      if (!data || data.type !== 'viewer-command') return;
      if (data.action === 'highlight-step') {
        setHighlightStepId(data.payload?.stepId ?? null);
        setHint(data.payload?.hint ?? null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Apply / clear the highlight class against DOM elements
  useEffect(() => {
    document.querySelectorAll('.sim-hotspot').forEach((el) => el.classList.remove('sim-highlight'));
    if (highlightStepId) {
      document.querySelectorAll(`[data-step-id="${highlightStepId}"]`).forEach((el) => el.classList.add('sim-highlight'));
    }
  }, [highlightStepId, screenId]);

  // Initial mount handshake — tell the host we are alive
  useEffect(() => {
    post({ appId: APP_META.appId, appName: APP_META.appName, clicks: [], currentScreen: screenId, expectedNext: EXPECTED_STEPS[0]?.stepId ?? null });
  }, []);

  const Screen = SCREENS[screenId] || (() => null);

  return (
    <Box>
      <AppBar position="static" sx={{ bgcolor: APP_META.accentColor }}>
        <Toolbar variant="dense">
          <Typography variant="subtitle1" sx={{ flex: 1 }}>{APP_META.appName}</Typography>
          <Chip label={`step ${clicks.length} / ${EXPECTED_STEPS.length}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: 'white' }} />
        </Toolbar>
      </AppBar>
      <Box sx={{ mt: 2 }}>
        <Screen onHotspot={onHotspot} />
      </Box>
      {hint && (
        <Paper sx={{ mt: 2, p: 2, bgcolor: '#fff8e1', borderLeft: '4px solid #f57c00' }}>
          <Typography variant="body2"><strong>Hint:</strong> {hint}</Typography>
        </Paper>
      )}
    </Box>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>
```

### 4. Render and announce

1. Write the file to `out/simulators/<app-id>.simulator.html`.
2. Emit `<preview:out/simulators/<app-id>.simulator.html>` in your
   reply so the simulator opens in the preview pane.
3. Tell the trainee briefly what's loaded and what they should try
   first ("OK, MD04 simulator open — try clicking the launchpad tile
   that opens it"). Do **not** dump the whole expected sequence; one
   step at a time.

## How to coach

Every time the user clicks in the simulator, you receive a
`viewerState` with the click log. On your next turn:

- If the most-recent click matches `EXPECTED_STEPS[len-1]` → praise +
  introduce the next step.
- If it doesn't → give the `errorHint` for the expected step, do not
  give them the answer outright.
- If you want to highlight the next expected hot-spot for them (after
  a stuck moment), call the `highlight_simulator_step` tool with that
  `stepId` and an optional `hint`. The simulator pulses the target
  element.

## After completion

- Append a Q/A entry under the relevant ToC node in
  `progress/<username>.progress.json` summarising what they
  practised. Mark `kind: "qa"` and `confidence: "confirmed"`. Include
  the click log filename in `files` if you persisted it.
- If they made it through cleanly, award the `simulator-<app-id>`
  badge.

## What NOT to do

- **No** real authentication, no real backend calls, no fetch to the
  actual SAP / CRM. This is a mock.
- **No** more than 3 screens. The simulator is a learning aid, not a
  replacement product.
- **No** quizzing inside the simulator — that's the quiz-generator
  skill's job.
- **No** sensitive data — use stylised customer / material numbers
  ("ACME-001", "MAT-5023") not anything that could look like a real
  business record.
- **No** mutating the wiki or the curriculum from a simulator session.
  If the expert wants the simulator to drive curriculum changes, that
  is a separate conversation.
