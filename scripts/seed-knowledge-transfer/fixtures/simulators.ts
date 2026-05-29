/**
 * Pre-rendered application simulators for the knowledge-transfer seed.
 *
 * Shipped so reviewers see the simulator feature on first load without
 * having to ask the agent to author one. The agent can still generate
 * additional simulators via the `simulator-author` skill.
 *
 * Currently: one SAP-MD04 simulator (3 screens). The CRM / ERP variants
 * are left for the agent to generate on demand — keeps the seed bundle
 * compact and demonstrates the on-demand path.
 *
 * Contract: each HTML matches the simulator-author skill template
 * (postMessage out, viewer-command in). See
 * skill-templates/simulator-author/SKILL.md for the contract.
 */

export interface SimulatorAsset {
  filename: string;
  html: string;
}

const HEAD = (title: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://unpkg.com/@mui/material@5/umd/material-ui.production.min.js" crossorigin></script>
<style>
  html, body { margin: 0; padding: 0; min-height: 100vh; background: #eef2f6; font-family: 'Roboto', system-ui, sans-serif; }
  #root { min-height: 100vh; box-sizing: border-box; padding: 16px; }
  .sim-hotspot { cursor: pointer; transition: outline 0.15s, transform 0.1s; }
  .sim-hotspot:hover { outline: 2px solid #1976d2; outline-offset: 2px; }
  .sim-hotspot:active { transform: scale(0.98); }
  .sim-hotspot.sim-highlight { outline: 3px solid #f57c00; outline-offset: 3px; animation: simPulse 1.4s infinite; }
  @keyframes simPulse { 0%,100% { outline-color: #f57c00; } 50% { outline-color: #ffb74d; } }
  .sim-tile { background: #fff; border: 1px solid #cfd8dc; border-radius: 6px; padding: 16px; min-height: 64px; display: flex; flex-direction: column; justify-content: center; }
  .sim-tile-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
</style>
</head>
<body>
<div id="root"></div>
`;

export const SAP_MD04_SIMULATOR = HEAD('Simulator — SAP MD04 (Stock/Requirements List)') +
`<script type="text/babel">
const { useState, useEffect, useCallback } = React;
const { Box, AppBar, Toolbar, Typography, Paper, Stack, Chip, TextField, Button, Table, TableHead, TableBody, TableRow, TableCell, Alert } = MaterialUI;

const APP_META = {
  appId: 'sap-md04',
  appName: 'SAP — MD04 Stock / Requirements List',
  accentColor: '#0070c0',
};

const EXPECTED_STEPS = [
  { stepId: 'open-md04', screenId: 'launchpad', description: 'Open the MD04 tile from the launchpad',
    successHint: 'Good — you found the MD04 tile.',
    errorHint: 'On a real SAP launchpad, MD04 is the production-overview tile. Try the one labelled "MD04 — Production overview".' },
  { stepId: 'enter-material', screenId: 'material-input', description: 'Enter material LMT-MOD-LED-84S and the Lumitec plant code WP02',
    successHint: 'Material entered. Now execute the search.',
    errorHint: 'You need a material number (LMT-MOD-LED-84S) and a plant code (WP02 — Werk Plauen 2). The other fields are optional.' },
  { stepId: 'execute-search', screenId: 'material-input', description: 'Press F8 / Execute to run the query',
    successHint: 'Query executed — you should see the requirements list now.',
    errorHint: 'In MD04 the Execute button (F8 in SAP-GUI) is at the top toolbar. Skipping it goes nowhere.' },
  { stepId: 'inspect-shortage', screenId: 'results', description: 'Click the row dated 2026-06-15 — that\\'s the day a shortage is forecast',
    successHint: 'Right — the 2026-06-15 row is the first day stock goes negative. That\\'s the row a buyer would care about.',
    errorHint: 'Look at the "Available Qty" column — find the first row where it goes negative. That\\'s the shortage date.' },
  { stepId: 'open-order-detail', screenId: 'results', description: 'Double-click the production order PO-2026-417 to inspect it',
    successHint: 'Excellent — that\\'s the production order that was supposed to cover the shortage but is dated too late.',
    errorHint: 'Production orders are the rows starting with "PO-". The relevant one is PO-2026-417 (red row).' },
];

function ScreenLaunchpad({ onHotspot }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="overline" sx={{ color: '#666' }}>SAP S/4HANA · Lumitec Engineering Tenant</Typography>
      <Typography variant="h5" sx={{ mt: 0.5, mb: 2 }}>Launchpad — Production Planning</Typography>
      <Box className="sim-tile-grid">
        <Box className="sim-tile" sx={{ borderColor: '#cfd8dc' }}>
          <Typography variant="caption" color="text.secondary">MD01</Typography>
          <Typography variant="subtitle2">Materials planning — single material</Typography>
        </Box>
        <Box
          id="tile-md04" data-step-id="open-md04" className="sim-hotspot sim-tile"
          onClick={() => onHotspot('open-md04')}
          sx={{ borderColor: '#0070c0', borderWidth: 2, bgcolor: '#f0f7ff' }}
        >
          <Typography variant="caption" sx={{ color: '#0070c0', fontWeight: 700 }}>MD04 ★</Typography>
          <Typography variant="subtitle2">Stock / requirements list (production overview)</Typography>
        </Box>
        <Box className="sim-tile">
          <Typography variant="caption" color="text.secondary">MD05</Typography>
          <Typography variant="subtitle2">MRP list — multi-material</Typography>
        </Box>
        <Box className="sim-tile">
          <Typography variant="caption" color="text.secondary">CO11N</Typography>
          <Typography variant="subtitle2">Order confirmation</Typography>
        </Box>
        <Box className="sim-tile">
          <Typography variant="caption" color="text.secondary">MM03</Typography>
          <Typography variant="subtitle2">Display material master</Typography>
        </Box>
        <Box className="sim-tile">
          <Typography variant="caption" color="text.secondary">COGI</Typography>
          <Typography variant="subtitle2">Postprocessing — failed goods movements</Typography>
        </Box>
      </Box>
      <Alert severity="info" sx={{ mt: 2, fontSize: '0.8rem' }}>
        This is a Lumitec onboarding mock — not the real SAP. The MD04 tile is highlighted because that\'s where the exercise starts.
      </Alert>
    </Paper>
  );
}

function ScreenMaterialInput({ onHotspot }) {
  const [material, setMaterial] = useState('');
  const [plant, setPlant] = useState('');
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Box
          id="btn-execute" data-step-id="execute-search" className="sim-hotspot"
          onClick={() => onHotspot('execute-search')}
        >
          <Button variant="contained" sx={{ bgcolor: '#0070c0' }}>► Execute (F8)</Button>
        </Box>
        <Button variant="outlined" disabled>Back</Button>
        <Button variant="outlined" disabled>Help</Button>
      </Stack>
      <Typography variant="h6" sx={{ mb: 1.5 }}>MD04 — Stock/Requirements List</Typography>
      <Box
        id="form-material" data-step-id="enter-material" className="sim-hotspot"
        onClick={() => { onHotspot('enter-material'); setMaterial('LMT-MOD-LED-84S'); setPlant('WP02'); }}
        sx={{ p: 2, border: '1px dashed #cfd8dc', borderRadius: 1 }}
      >
        <Stack spacing={1.5}>
          <TextField size="small" label="Material" value={material || 'click here to enter LMT-MOD-LED-84S'}
            InputProps={{ readOnly: true }} fullWidth sx={{ bgcolor: '#fff' }} />
          <TextField size="small" label="Plant" value={plant || 'WP02 (Werk Plauen 2)'}
            InputProps={{ readOnly: true }} fullWidth sx={{ bgcolor: '#fff' }} />
          <TextField size="small" label="MRP Element" value="" placeholder="(optional)"
            InputProps={{ readOnly: true }} fullWidth sx={{ bgcolor: '#fafafa' }} />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          (Mock — click anywhere in this card to fill the fields.)
        </Typography>
      </Box>
    </Paper>
  );
}

function ScreenResults({ onHotspot }) {
  const rows = [
    { date: '2026-06-01', mrp: 'Stock',     desc: 'Current available',         qty: '+3,420', cls: '' },
    { date: '2026-06-05', mrp: 'CustReq',   desc: 'OEM-A delivery',            qty: '-1,200', cls: '' },
    { date: '2026-06-10', mrp: 'PrdOrd',    desc: 'PO-2026-415',               qty: '+800',   cls: '' },
    { date: '2026-06-12', mrp: 'CustReq',   desc: 'OEM-A delivery',            qty: '-1,400', cls: '' },
    { date: '2026-06-15', mrp: 'CustReq',   desc: 'OEM-A delivery (shortage)', qty: '-2,200', cls: 'shortage', stepId: 'inspect-shortage' },
    { date: '2026-06-20', mrp: 'PrdOrd',    desc: 'PO-2026-417 (LATE)',        qty: '+1,600', cls: 'late-order', stepId: 'open-order-detail' },
    { date: '2026-06-30', mrp: 'CustReq',   desc: 'OEM-C delivery',            qty: '-900',   cls: '' },
  ];
  let running = 3420;
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h6">Material LMT-MOD-LED-84S · Plant WP02</Typography>
        <Chip size="small" label="MRP type: ND · Procurement: F" />
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#eceff1' }}>
            <TableCell>Date</TableCell>
            <TableCell>MRP element</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Qty</TableCell>
            <TableCell align="right">Available</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => {
            running += parseInt(r.qty.replace(/[,+]/g, ''), 10);
            const negative = running < 0;
            const tone = r.cls === 'shortage' ? { bg: '#ffebee', fg: '#c62828' }
                       : r.cls === 'late-order' ? { bg: '#fff3e0', fg: '#e65100' }
                       : null;
            const onClick = r.stepId ? () => onHotspot(r.stepId) : undefined;
            return (
              <TableRow key={i}
                id={r.stepId ? \`row-\${r.stepId}\` : undefined}
                data-step-id={r.stepId}
                className={r.stepId ? 'sim-hotspot' : undefined}
                onClick={onClick}
                sx={{
                  bgcolor: tone?.bg,
                  '& td': { color: tone?.fg, fontWeight: tone ? 600 : 400 },
                }}
              >
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.mrp}</TableCell>
                <TableCell>{r.desc}</TableCell>
                <TableCell align="right">{r.qty}</TableCell>
                <TableCell align="right" sx={{ color: negative ? '#c62828' : 'inherit', fontWeight: negative ? 700 : 400 }}>
                  {running.toLocaleString()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Alert severity="warning" sx={{ mt: 2 }}>
        The 2026-06-15 row (red) goes negative. PO-2026-417 (orange) would cover it — but it arrives <strong>5 days too late</strong>. Real-world MD04 reading: this is where a buyer or production planner would intervene.
      </Alert>
    </Paper>
  );
}

const SCREENS = {
  'launchpad':      ScreenLaunchpad,
  'material-input': ScreenMaterialInput,
  'results':        ScreenResults,
};

function App() {
  const [screenId, setScreenId] = useState('launchpad');
  const [clicks, setClicks] = useState([]);
  const [highlightStepId, setHighlightStepId] = useState(null);
  const [hint, setHint] = useState(null);

  const post = useCallback((payload) => {
    try { window.parent.postMessage({ type: 'viewer-state-update', state: payload }, '*'); } catch {}
  }, []);

  const transitionFor = (stepId) => {
    if (stepId === 'open-md04')     return 'material-input';
    if (stepId === 'execute-search') return 'results';
    return null;
  };

  const onHotspot = useCallback((stepId) => {
    const expected = EXPECTED_STEPS[clicks.length];
    const correct = expected ? expected.stepId === stepId : false;
    const next = [...clicks, { stepId, screenId, t: Date.now(), correct }];
    setClicks(next);

    const nextScreen = transitionFor(stepId);
    if (nextScreen) setScreenId(nextScreen);

    setHighlightStepId(null);
    post({
      appId: APP_META.appId,
      appName: APP_META.appName,
      clicks: next,
      currentScreen: nextScreen || screenId,
      expectedNext: EXPECTED_STEPS[next.length]?.stepId ?? null,
      lastCorrect: correct,
    });
  }, [clicks, screenId, post]);

  useEffect(() => {
    const handler = (event) => {
      const data = event.data;
      if (!data || data.type !== 'viewer-command') return;
      if (data.action === 'highlight-step') {
        setHighlightStepId(data.payload?.stepId ?? null);
        setHint(data.payload?.hint ?? null);
      } else if (data.action === 'clear-hint') {
        setHint(null); setHighlightStepId(null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    document.querySelectorAll('.sim-hotspot').forEach((el) => el.classList.remove('sim-highlight'));
    if (highlightStepId) {
      document.querySelectorAll(\`[data-step-id="\${highlightStepId}"]\`).forEach((el) => el.classList.add('sim-highlight'));
    }
  }, [highlightStepId, screenId]);

  useEffect(() => {
    post({ appId: APP_META.appId, appName: APP_META.appName, clicks: [], currentScreen: 'launchpad', expectedNext: EXPECTED_STEPS[0].stepId });
  }, []);

  const Screen = SCREENS[screenId] || (() => null);

  return (
    <Box>
      <AppBar position="static" sx={{ bgcolor: APP_META.accentColor }}>
        <Toolbar variant="dense">
          <Typography variant="subtitle1" sx={{ flex: 1 }}>{APP_META.appName}</Typography>
          <Chip
            label={\`Step \${clicks.length} / \${EXPECTED_STEPS.length}\`}
            size="small"
            sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: 'white', mr: 1 }}
          />
          <Chip
            label={screenId}
            size="small"
            sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'white', fontFamily: 'monospace' }}
          />
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
      {clicks.length >= EXPECTED_STEPS.length && clicks.every((c) => c.correct) && (
        <Alert severity="success" sx={{ mt: 2 }}>
          🎉 You finished the MD04 walkthrough cleanly. The agent should now mark this exercise as done in your progress file.
        </Alert>
      )}
    </Box>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>
`;

export const SIMULATORS: SimulatorAsset[] = [
  { filename: 'sap-md04.simulator.html', html: SAP_MD04_SIMULATOR },
];
