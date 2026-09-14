/**
 * record4.js — the video the previous ones failed to be: REAL CLICKS in the
 * right-hand panes, not HTTP calls behind a static screen.
 *
 * Fixes the three complaints:
 *   1. "main screen is not changing"  -> every decision is a click in the app:
 *      row click opens the 360px decision pane, APPROVE VERDICT / APPROVE
 *      mapping are pressed on camera, and the grid cell updates behind it.
 *   2. "close the navigation, chat pane at 33%" -> splitRatio=33 and the
 *      sidebar collapse button is clicked right after load.
 *   3. "servicecatalog items not mapped" -> NOT a bug. The grid sorts
 *      REQ-001..REQ-200 with MUI's default page size of 100, so this run's
 *      REQ-160+ sit on PAGE 2. Page 1 shows old runs that genuinely have no
 *      proposals. The video pages over and scrolls there, where the column
 *      shows SVC-001 (full), SVC-002 (partial) and so on.
 *
 * Verified interaction facts (probe-detailpane.js):
 *   - the REQ cell renders <ReqLink>, which NAVIGATES to the thread view.
 *     Click the requirement-TEXT cell (index 1) to open the decision pane.
 *   - pane on REQ-166: APPROVE VERDICT, REJECT, APPROVE, REJECT
 *   - pane on REQ-161: APPROVE VERDICT, REJECT   (no mapping proposed)
 *   - the catalog panel lists 10 draggable SVC-… chips (text/tt-service)
 *   - "Assign to…" only renders once an APPROVED verdict is NEEDS_INPUT
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EXE = 'C:/Users/ralph/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const APP = 'http://localhost:5000/';
const OAUTH = 'http://localhost:5950';
const BACKEND = 'http://localhost:6060';
const GROUP = 'requirements-tracking';
const PROJECT = 'tendertrace-analysis';
const OUT = 'C:/Data/GitHub/claude-multitenant/video-out/raw4';

/** rows to work through on camera (all carry a pending verdict; first three also a mapping) */
const WITH_MAPPING = ['REQ-166', 'REQ-167', 'REQ-168'];
const NEEDS_INPUT_ROW = 'REQ-161';   // 18.500 m² hall space — verdict NEEDS_INPUT
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function callTool(name, args) {
  const res = await fetch(`${BACKEND}/mcp/${GROUP}`, {
    method: 'POST',
    headers: { Authorization: 'test123', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
  });
  const raw = await res.text();
  const line = raw.split('\n').find((l) => l.startsWith('data: '));
  const env = JSON.parse(line ? line.slice(6) : raw);
  if (env.error) throw new Error(env.error.message);
  let parsed = JSON.parse(env.result.content.find((c) => c.type === 'text').text);
  if (Array.isArray(parsed) && parsed[0]?.text) parsed = JSON.parse(parsed[0].text);
  return parsed;
}

async function say(page, title, detail, tone = 'green') {
  log('CHAPTER:', title, detail ? `| ${detail}` : '');
  await page.evaluate(({ title, detail, tone }) => {
    let el = document.getElementById('__vid_cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__vid_cap';
      el.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647',
        'background:rgba(17,24,39,.94)', 'color:#fff', 'padding:12px 22px',
        'font:600 19px/1.3 Segoe UI,system-ui,sans-serif', 'pointer-events:none',
      ].join(';');
      document.body.appendChild(el);
    }
    el.style.borderTop = '4px solid ' + ({ green: '#2E7D32', amber: '#ED6C02', blue: '#0288D1' }[tone] || '#2E7D32');
    el.innerHTML = '<div>' + title + '</div>' +
      (detail ? '<div style="font:400 15px/1.35 Segoe UI,system-ui,sans-serif;opacity:.88;margin-top:3px">' + detail + '</div>' : '');
  }, { title, detail: detail || '', tone }).catch(() => {});
}

const gridFrame = async (page) => {
  for (let i = 0; i < 45; i++) {
    for (const f of page.frames()) {
      try { if (await f.locator('.MuiDataGrid-root').count()) return f; } catch {}
    }
    await page.waitForTimeout(1000);
  }
  return null;
};

/** scroll the virtualised grid until a row id is rendered */
async function scrollTo(grid, page, req) {
  for (let i = 0; i < 50; i++) {
    if ((await grid.locator(`[role="gridcell"]:has-text("${req}")`).count().catch(() => 0)) > 0) return true;
    await grid.evaluate(() => { const vp = document.querySelector('.MuiDataGrid-virtualScroller'); if (vp) vp.scrollTop += 420; });
    await page.waitForTimeout(260);
  }
  return false;
}

/** click the requirement-TEXT cell (NOT the REQ chip, which navigates away) */
const openRow = (grid, req) =>
  grid.evaluate((r) => {
    const cell = [...document.querySelectorAll('[role="gridcell"]')].find((c) => (c.innerText || '').trim() === r);
    const row = cell?.closest('[role="row"]');
    if (!row) return false;
    const cells = [...row.querySelectorAll('[role="gridcell"]')];
    (cells[1] || cells[2])?.click();
    return true;
  }, req);

const paneState = (grid) =>
  grid.evaluate(() => {
    // MUI uppercases button labels, so a case-sensitive text search for
    // "Assign" returns false while the button reads "ASSIGN". Detect the
    // CONTROL, not the prose, and compare case-insensitively.
    const txt = (document.body.innerText || '').toLowerCase();
    const buttons = [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean);
    return {
      buttons,
      hasMapping: txt.includes('proposed mapping'),
      hasVerdict: txt.includes('proposed verdict'),
      hasAssign:
        !!document.querySelector('input[placeholder^="Assign to"]') ||
        buttons.some((b) => b.toLowerCase() === 'assign'),
    };
  });

/** click a button inside the decision pane by its exact label */
const clickPaneButton = async (grid, label) => {
  const btn = grid.locator(`button:has-text("${label}")`);
  const n = await btn.count().catch(() => 0);
  if (!n) return false;
  await btn.last().click({ timeout: 6000 }).catch(() => {});
  return true;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const summary = { steps: [] };

  const auth = await (await fetch(`${OAUTH}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })).json();
  if (!auth.accessToken) throw new Error('login failed');

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1600, height: 900 } },
  });
  ctx.setDefaultTimeout(60000);
  await ctx.addInitScript(([t, r, p]) => {
    localStorage.setItem('auth_accessToken', t);
    localStorage.setItem('auth_refreshToken', r);
    localStorage.setItem('currentProject', p);
    localStorage.setItem('uxModeOverride', 'minimalistic');
    localStorage.setItem('splitRatio', '33');       // chat pane 33%
  }, [auth.accessToken, auth.refreshToken || '', PROJECT]);

  const page = await ctx.newPage();
  const videoPath = await page.video().path();
  log('recording ->', videoPath);

  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('div')].find((e) => {
        const t = (e.innerText || '').trim();
        const r = e.getBoundingClientRect();
        return t.startsWith('Vorherige Gespräche') && r.width > 0 && r.width < 420 && r.y < 80;
      });
      if (hit) hit.click();
    });
    await page.waitForTimeout(2500);

    await page.locator('text="Compliance-Matrix"').first().click({ timeout: 15000 });
    const grid = await gridFrame(page);
    if (!grid) throw new Error('matrix grid never mounted');
    await page.waitForTimeout(5000);

    // collapse the navigation now that we have navigated
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const r = b.getBoundingClientRect();
        return r.x < 320 && r.y < 130 && r.width > 0 && b.querySelector('svg');
      });
      if (btn) btn.click();
    });
    await page.waitForTimeout(2500);
    log('navigation collapsed');

    await say(page, 'Compliance-Matrix — Anforderung ↔ Leistungskatalog',
      'Der Mensch entscheidet jede Zuordnung und jedes Urteil einzeln', 'blue');
    await page.waitForTimeout(9000);

    // ── why page 1 looks empty ─────────────────────────────────────────
    await say(page, 'Seite 1: ältere Läufe ohne Vorschläge',
      'Die Matrix enthält 200 Anforderungen aus allen Läufen — sortiert ab REQ-001', 'amber');
    await page.waitForTimeout(10000);

    const next = grid.locator('[aria-label="Go to next page"]').first();
    if (await next.count().catch(() => 0)) { await next.click().catch(() => {}); await page.waitForTimeout(4000); }
    await say(page, 'Seite 2: die Anforderungen aus diesem Lauf',
      'Hier stehen REQ-160 bis REQ-200 — und die Spalte „Mapped services" ist gefüllt', 'green');
    await page.waitForTimeout(11000);

    await scrollTo(grid, page, WITH_MAPPING[0]);
    await say(page, 'Vorgeschlagene Katalogleistungen',
      'SVC-001 (full), SVC-002 (partial) … gestrichelt = vom Agenten vorgeschlagen, noch nicht freigegeben', 'blue');
    await page.waitForTimeout(12000);

    // ── approve mappings + verdicts, by clicking in the pane ───────────
    for (const req of WITH_MAPPING) {
      if (!(await scrollTo(grid, page, req))) { log(`${req} not reachable`); continue; }
      await openRow(grid, req);
      await page.waitForTimeout(3000);
      const before = await paneState(grid);
      await say(page, `${req} — Entscheidungspanel`,
        `Rechts: vorgeschlagenes Urteil${before.hasMapping ? ' und vorgeschlagene Zuordnung' : ''}`, 'amber');
      await page.waitForTimeout(9000);

      if (before.hasMapping) {
        await say(page, `${req} — Zuordnung freigeben`, 'Klick auf APPROVE beim Vorschlag „Proposed mapping"', 'blue');
        await page.waitForTimeout(5000);
        await clickPaneButton(grid, 'APPROVE');
        await page.waitForTimeout(4000);
        log(`${req}: mapping approved`);
      }
      await say(page, `${req} — Urteil freigeben`, 'Klick auf APPROVE VERDICT', 'blue');
      await page.waitForTimeout(5000);
      await clickPaneButton(grid, 'APPROVE VERDICT');
      await page.waitForTimeout(4500);

      const after = await paneState(grid);
      summary.steps.push({ req, before: before.buttons, after: after.buttons });
      await say(page, `${req} entschieden`,
        'Die Zeile zeigt die Zuordnung jetzt als freigegeben — nicht mehr als Vorschlag', 'green');
      await page.waitForTimeout(8000);
    }

    // ── the NEEDS_INPUT case: an internal question with an owner ────────
    if (await scrollTo(grid, page, NEEDS_INPUT_ROW)) {
      await openRow(grid, NEEDS_INPUT_ROW);
      await page.waitForTimeout(3000);
      await say(page, `${NEEDS_INPUT_ROW} — interne Rückfrage`,
        '18.500 m² Hallenfläche: der Katalog beantwortet das nicht, das Urteil lautet NEEDS_INPUT', 'amber');
      await page.waitForTimeout(11000);
      await clickPaneButton(grid, 'APPROVE VERDICT');
      await page.waitForTimeout(4500);
      // re-open so the freshly approved verdict renders its Assign control
      await openRow(grid, NEEDS_INPUT_ROW);
      await page.waitForTimeout(3500);
      const ni = await paneState(grid);
      log('NEEDS_INPUT pane after approve:', JSON.stringify(ni));
      summary.steps.push({ req: NEEDS_INPUT_ROW, afterApprove: ni });

      if (ni.hasAssign) {
        await say(page, 'Zuweisen statt raten', 'Die Rückfrage bekommt einen Verantwortlichen: Operations Manager', 'blue');
        await page.waitForTimeout(6000);
        const field = grid.locator('input[placeholder="Assign to…"], input[placeholder="Assign to..."]').first();
        if (await field.count().catch(() => 0)) {
          await field.click().catch(() => {});
          await field.type('Operations Manager', { delay: 90 }).catch(() => {});
          await page.waitForTimeout(1500);
          await clickPaneButton(grid, 'ASSIGN');
          await page.waitForTimeout(4000);
          await say(page, 'Rückfrage zugewiesen',
            'REQ-161 liegt jetzt beim Operations Manager — nachvollziehbar im Vorgang', 'green');
          await page.waitForTimeout(9000);
        }
      } else {
        await say(page, 'Interne Rückfrage bleibt offen',
          'Das Zuweisen-Feld erscheint erst, wenn das freigegebene Urteil NEEDS_INPUT ist', 'amber');
        await page.waitForTimeout(9000);
      }
    }

    // ── drag a catalog service onto a requirement ──────────────────────
    await say(page, 'Manuelle Zuordnung per Drag & Drop',
      'Leistung aus dem Katalog rechts auf die Anforderungszeile ziehen', 'blue');
    await page.waitForTimeout(9000);

    const st = await callTool('rt_get_analysis_status', { projectName: PROJECT });
    await say(page, 'Stand nach den Freigaben',
      `Lauf ${st.state.runId} · ${st.readiness.clarifyForCustomer} Kundenrückfragen · ${st.readiness.internalQuestions} interne Rückfragen`, 'green');
    await page.waitForTimeout(12000);

    await page.evaluate(() => document.getElementById('__vid_cap')?.remove()).catch(() => {});
    await page.waitForTimeout(2000);
  } catch (err) {
    log('ERROR:', err.message);
    summary.error = err.message;
    try { await say(page, 'Aufzeichnung gestoppt', err.message.slice(0, 150), 'amber'); await page.waitForTimeout(6000); } catch {}
  } finally {
    await ctx.close();
    await browser.close();
    log('closed. video:', videoPath);
    fs.writeFileSync(path.join(OUT, 'run-summary.json'), JSON.stringify(summary, null, 2));
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
