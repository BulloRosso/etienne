/**
 * probe.js — run this FIRST on any Etienne seed project.
 *
 * Reports what the DOM actually contains at each navigation gate, so you never
 * write selectors against a page you have not seen. Read-only: it starts no
 * pipeline and changes no project state.
 *
 *   node probe.js
 *   node probe.js --project=desalination-devices --menu="Anlagen-Cockpit" --marker="Übersicht"
 *
 * Distilled from nine diagnostic probes in a TenderTrace session. The gates it
 * checks, in the order they bite:
 *   1. auth        — a fresh context sees a login form
 *   2. ux mode     — 'verbose' (the default) renders NO sidebar at all
 *   3. welcome     — covers SplitLayout, so preview tabs have nowhere to render
 *   4. previewer   — suffix -> viewer -> mcpui render tool -> app iframe
 */
const { chromium } = require('playwright-core');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const PROJECT = arg('project', 'tendertrace-analysis');
const MENU    = arg('menu', 'Analyse-Cockpit');       // sidebar entry label
const MARKER  = arg('marker', 'Dokumente einlesen');  // text unique to the app iframe
const APP     = arg('app', 'http://localhost:5000/');
const OAUTH   = arg('oauth', 'http://localhost:5950');
const USER    = process.env.SEED_USERNAME || 'admin';
const PASS    = process.env.SEED_PASSWORD || 'admin123';

// Chromium already cached by the Playwright MCP server. chrome.exe is ~4 MB
// because the payload is chrome.dll beside it; that is normal.
const EXE = arg('exe', 'C:/Users/ralph/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const findApp = async (page, marker) => {
  for (const f of page.frames()) {
    try { if (await f.locator(`text=${marker}`).count()) return f; } catch { /* detached */ }
  }
  return null;
};

(async () => {
  console.log(`probing project="${PROJECT}" menu="${MENU}" marker="${MARKER}"\n`);

  // ---- gate 1: auth -------------------------------------------------------
  const auth = await (await fetch(`${OAUTH}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })).json().catch((e) => ({ error: e.message }));
  if (!auth.accessToken) { console.error('LOGIN FAILED:', JSON.stringify(auth).slice(0, 200)); process.exit(1); }
  console.log(`[1] auth ok — ${auth.user?.username} (${auth.user?.role})`);

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(([t, r, p]) => {
    localStorage.setItem('auth_accessToken', t);
    localStorage.setItem('auth_refreshToken', r);
    localStorage.setItem('currentProject', p);
    localStorage.setItem('uxModeOverride', 'minimalistic'); // gate 2
    localStorage.setItem('splitRatio', '30');
  }, [auth.accessToken, auth.refreshToken || '', PROJECT]);

  const page = await ctx.newPage();
  const failed = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 120)}`); });
  page.on('pageerror', (e) => failed.push(`pageerror ${e.message.slice(0, 120)}`));

  let previewers = null;
  page.on('response', async (r) => {
    if (!r.url().includes('/api/previewers/configuration')) return;
    try { previewers = (await r.json()).previewers || []; } catch { /* not json */ }
  });

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);

  // ---- gate 2: sidebar ----------------------------------------------------
  const sidebar = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('li,button,[role=button],span,div')]
      .map((e) => (e.innerText || '').trim())
      .filter((t) => t && t.length < 34))].slice(0, 40));
  console.log(`[2] sidebar entries (${sidebar.length}):`, JSON.stringify(sidebar.slice(0, 20)));
  if (!sidebar.length) console.log('    !! no sidebar — is uxModeOverride set to "minimalistic"?');

  // ---- gate 3: welcome page ----------------------------------------------
  const beforeText = await page.evaluate(() => (document.body.innerText || '').slice(0, 120));
  const dismissed = await page.evaluate(() => {
    const hit = [...document.querySelectorAll('div')].find((e) => {
      const t = (e.innerText || '').trim();
      const r = e.getBoundingClientRect();
      return t.startsWith('Vorherige Gespräche') && r.width > 0 && r.width < 420 && r.y < 80;
    });
    if (!hit) return false;
    hit.click();
    return true;
  });
  await page.waitForTimeout(3000);
  console.log(`[3] welcome page dismissed: ${dismissed}`);
  console.log(`    before: ${JSON.stringify(beforeText.slice(0, 70))}`);

  // ---- gate 4: previewer + app iframe ------------------------------------
  if (previewers) {
    console.log(`[4] previewers registered: ${previewers.length}`);
    const mcpui = previewers.filter((p) => p.type === 'mcpui')
      .map((p) => `${p.viewer}[${(p.extensions || []).join(',')}] -> ${p.mcpGroup}/${p.mcpToolName}`);
    console.log('    mcpui:', JSON.stringify(mcpui, null, 1));
  } else {
    console.log('[4] !! /api/previewers/configuration never answered — viewers cannot resolve');
  }

  const entry = page.locator(`text="${MENU}"`).first();
  const entryCount = await entry.count().catch(() => -1);
  console.log(`    sidebar entry "${MENU}": ${entryCount}`);
  if (entryCount > 0) {
    await entry.click({ timeout: 8000 }).catch((e) => console.log('    click failed:', e.message.split('\n')[0]));
    let frame = null;
    for (let i = 0; i < 40 && !frame; i++) { await page.waitForTimeout(1000); frame = await findApp(page, MARKER); }
    if (frame) {
      console.log(`\nRESULT: APP MOUNTED (marker "${MARKER}" found)`);
      const btns = await frame.evaluate(() =>
        [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean));
      console.log('app buttons :', JSON.stringify(btns));
      console.log('app text    :', JSON.stringify((await frame.evaluate(() => document.body.innerText || '')).slice(0, 500)));
    } else {
      console.log(`\nRESULT: app did NOT mount within 40s.`);
      console.log('iframes on page:', await page.evaluate(() => document.querySelectorAll('iframe').length));
      console.log('page text:', JSON.stringify((await page.evaluate(() => document.body.innerText || '')).slice(0, 300)));
      console.log('\ncheck, in this order: previewer registered for the suffix ->');
      console.log('the sidebar item payload.path exists in the workspace ->');
      console.log('/mcp/<group> answers tools/list through :5000 -> the app bundle is built');
    }
  }

  if (failed.length) {
    console.log('\nfailed requests (often harmless, but read them):');
    [...new Set(failed)].slice(0, 12).forEach((f) => console.log('  ' + f));
  }

  await ctx.close();
  await browser.close();
  console.log('\nPROBE_DONE');
})().catch((e) => { console.error('PROBE_FAIL', e.message); process.exit(1); });
