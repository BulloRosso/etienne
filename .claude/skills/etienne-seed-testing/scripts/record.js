/**
 * record.js — drive an Etienne seed flow in a real browser and record it.
 *
 * Produces a webm (Playwright writes it when the context CLOSES — it reads
 * 0 bytes the whole time it records, which is not a fault). Convert with
 * convert.ps1; Playwright's bundled ffmpeg cannot write mp4.
 *
 *   node record.js
 *   node record.js --project=desalination-devices --menu="Anlagen-Cockpit" --marker="Übersicht"
 *
 * Run probe.js FIRST on a new seed: it reports the real sidebar labels, the
 * app's marker text and its button labels, which are what you configure below.
 *
 * The navigation chain (see SKILL.md §3) is the load-bearing part: verbose UX
 * mode renders no sidebar at all, and the welcome page covers the pane your app
 * would render into. Both are handled in openApp().
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

// ── configuration ─────────────────────────────────────────────────────────
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const PROJECT = arg('project', 'tendertrace-analysis');
const MENU    = arg('menu', 'Analyse-Cockpit');        // sidebar entry to open
const MARKER  = arg('marker', 'Dokumente einlesen');   // text unique to the app iframe
const MCP_GROUP = arg('group', 'requirements-tracking');
const OUT     = arg('out', 'C:/Data/GitHub/claude-multitenant/video-out/raw');

const APP   = 'http://localhost:5000/';
const OAUTH = 'http://localhost:5950';
const BACKEND = 'http://localhost:6060';
const EXE = arg('exe', 'C:/Users/ralph/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe');

/**
 * The flow to film. Each step is either a pause with a caption, a sidebar
 * click, or a long-running tool call whose progress is narrated live.
 * Replace this array for a different seed — everything above stays the same.
 */
const RUN_TOOL    = 'rt_run_tender_analysis';   // null to skip the pipeline run
const STATUS_TOOL = 'rt_get_analysis_status';
const RUN_ARGS    = { force: true };            // UI buttons often omit flags you need
const TERMINAL    = ['awaiting_review', 'finished', 'partial', 'failed'];

const TIMEOUT_MS = Number(arg('timeout', 55 * 60 * 1000));
const POLL_MS = 4000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── MCP plumbing ──────────────────────────────────────────────────────────
async function callTool(name, args) {
  const res = await fetch(`${BACKEND}/mcp/${MCP_GROUP}`, {
    method: 'POST',
    headers: {
      Authorization: 'test123',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
  });
  const raw = await res.text();
  const line = raw.split('\n').find((l) => l.startsWith('data: '));   // SSE envelope
  const env = JSON.parse(line ? line.slice(6) : raw);
  if (env.error) throw new Error(env.error.message);
  let parsed = JSON.parse(env.result.content.find((c) => c.type === 'text').text);
  if (Array.isArray(parsed) && parsed[0]?.text) parsed = JSON.parse(parsed[0].text);  // sometimes double-wrapped
  return parsed;
}

// ── narration strip burned into the frame ─────────────────────────────────
async function say(page, title, detail) {
  log('CHAPTER:', title, detail ? `| ${detail}` : '');
  await page.evaluate(({ title, detail }) => {
    let el = document.getElementById('__vid_cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__vid_cap';
      el.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647',
        'background:rgba(17,24,39,.94)', 'color:#fff', 'padding:13px 22px',
        'font:600 19px/1.35 Segoe UI,system-ui,sans-serif', 'pointer-events:none',
        'border-top:3px solid #2E7D32',
      ].join(';');
      document.body.appendChild(el);
    }
    el.innerHTML = '<div>' + title + '</div>' +
      (detail ? '<div style="font:400 15px/1.4 Segoe UI,system-ui,sans-serif;opacity:.85;margin-top:3px">' + detail + '</div>' : '');
  }, { title, detail: detail || '' }).catch(() => {});
}

const findApp = async (page, marker) => {
  for (const f of page.frames()) {
    try { if (await f.locator(`text=${marker}`).count()) return f; } catch { /* detached */ }
  }
  return null;
};

/** The three gates from SKILL.md §3. */
async function openApp(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // gate 3 — leave the welcome page, or the preview pane never renders
  await page.evaluate(() => {
    const hit = [...document.querySelectorAll('div')].find((e) => {
      const t = (e.innerText || '').trim();
      const r = e.getBoundingClientRect();
      return t.startsWith('Vorherige Gespräche') && r.width > 0 && r.width < 420 && r.y < 80;
    });
    if (hit) hit.click();
  });
  await page.waitForTimeout(2500);

  // gate 4 — open the app from the application-type sidebar section
  await page.locator(`text="${MENU}"`).first().click({ timeout: 15000 });
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const f = await findApp(page, MARKER);
    if (f) return f;
  }
  throw new Error(`app did not mount (marker "${MARKER}" never appeared) — run probe.js`);
}

// ── main ──────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // gate 1 — seed the token rather than typing into the login form
  const auth = await (await fetch(`${OAUTH}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.SEED_USERNAME || 'admin',
      password: process.env.SEED_PASSWORD || 'admin123',
    }),
  })).json();
  if (!auth.accessToken) throw new Error('login failed');
  log('logged in as', auth.user.username);

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1600, height: 900 } },   // must be set HERE
  });
  ctx.setDefaultTimeout(60000);
  await ctx.addInitScript(([t, r, p]) => {
    localStorage.setItem('auth_accessToken', t);
    localStorage.setItem('auth_refreshToken', r);
    localStorage.setItem('currentProject', p);
    localStorage.setItem('uxModeOverride', 'minimalistic');  // gate 2: else NO sidebar
    localStorage.setItem('splitRatio', '30');
  }, [auth.accessToken, auth.refreshToken || '', PROJECT]);

  const page = await ctx.newPage();
  const videoPath = await page.video().path();
  log('recording ->', videoPath);

  let summary = null;
  try {
    await openApp(page);
    log('app mounted');

    await say(page, `${PROJECT} — End-to-End-Durchlauf`, MENU);
    await page.waitForTimeout(6000);

    if (RUN_TOOL) {
      await say(page, 'Start', `${RUN_TOOL} (${JSON.stringify(RUN_ARGS)})`);
      const started = await callTool(RUN_TOOL, { projectName: PROJECT, ...RUN_ARGS });
      if (started.started === false || started.success === false) {
        throw new Error('run did not start: ' + JSON.stringify(started));
      }
      const runId = started.runId;
      log('run started:', runId);

      // narrate real progress: the app's own poller drives the UI, we caption it
      const deadline = Date.now() + TIMEOUT_MS;
      let last = '';
      let st = null;
      while (Date.now() < deadline) {
        st = await callTool(STATUS_TOOL, { projectName: PROJECT, runId });
        const s = st.state || {};
        const key = `${s.percent}|${s.stepLabel}|${s.currentFile || ''}`;
        if (key !== last) {
          last = key;
          await say(page, `${s.stepLabel || 'Verarbeitung'} · ${s.percent ?? 0} %`,
            s.currentFile ? `Datei: ${s.currentFile}` : (s.message || `Lauf ${runId}`));
          log(`  ${s.percent}% ${s.stepLabel || ''} ${s.currentFile || ''}`);
        }
        if (TERMINAL.includes(s.status)) break;
        await page.waitForTimeout(POLL_MS);
      }
      const s = st?.state || {};
      log('run ended:', s.status, s.percent + '%');
      await say(page, `Abgeschlossen — ${s.percent} %`, `Status ${s.status} · Lauf ${runId}`);
      await page.waitForTimeout(9000);
      summary = { runId, status: s.status, percent: s.percent, readiness: st?.readiness ?? null };
    }

    // tour the other sidebar pages so the video shows the result, not just progress
    for (const label of (arg('tour', '') ? arg('tour', '').split(',') : [])) {
      try {
        await page.locator(`text="${label.trim()}"`).first().click({ timeout: 8000 });
        await say(page, label.trim(), '');
        await page.waitForTimeout(10000);
      } catch (e) { log(`tour "${label}" skipped:`, e.message.split('\n')[0]); }
    }

    await page.evaluate(() => document.getElementById('__vid_cap')?.remove()).catch(() => {});
    await page.waitForTimeout(1500);
  } catch (err) {
    log('ERROR:', err.message);
    try { await say(page, 'Aufzeichnung unterbrochen', err.message.slice(0, 160)); await page.waitForTimeout(5000); } catch {}
  } finally {
    await ctx.close();     // REQUIRED: this is when the webm is written
    await browser.close();
    log('closed. video:', videoPath);
    fs.writeFileSync(path.join(OUT, 'video-path.txt'), videoPath || '');
    if (summary) fs.writeFileSync(path.join(OUT, 'run-summary.json'), JSON.stringify(summary, null, 2));
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
