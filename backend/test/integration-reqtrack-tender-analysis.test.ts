/**
 * Integration test for the two-phase tender analysis (TenderTrace).
 *
 * Creates a throwaway project with the seed's Lagerlogistik fixtures, starts
 * phase A through the live MCP endpoint, waits for "awaiting review", checks
 * the demo invariants (files parsed, cards proposed, BOTH figure
 * contradictions raised — Mengen!B2 Palettenstellplätze and KPIs!B3
 * Wareneingangsbuchung — catalog published with EARS statements), approves
 * everything, resolves every contradiction, runs phase B and asserts the
 * report files exist.
 *
 * Auto-SKIPS when the backend (:6060) or the OAuth server (:5950) is not
 * reachable. Needs an LLM connection (phase A extracts with the LLM) — when
 * phase A fails with an LLM error the test reports SKIP, not FAIL.
 *
 * Run with:  cd backend && npx tsx test/integration-reqtrack-tender-analysis.test.ts
 * Cleanup:   delete workspace/<project> afterwards (the test names it in the output).
 */
import { strict as assert } from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const BACKEND_BASE = process.env.BACKEND_BASE || 'http://localhost:6060';
const OAUTH_BASE = process.env.OAUTH_BASE || 'http://localhost:5950';
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || join(process.cwd(), '..', 'workspace');
const PROJECT = process.env.TEST_PROJECT || `int-ta-${Math.random().toString(16).slice(2, 10)}`;
const PHASE_TIMEOUT_MS = Number(process.env.TEST_PHASE_TIMEOUT_MS || 20 * 60 * 1000);
const KEEP = process.env.TEST_KEEP === '1';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}
function skip(msg: string): never {
  console.log(`  SKIP  ${msg}`);
  process.exit(0);
}

async function reachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

async function mcpCall<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BACKEND_BASE}/mcp/requirements-tracking`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'test123',
      'x-project-name': PROJECT,
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': name,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: { projectName: PROJECT, ...args },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'integration-reqtrack-tender-analysis', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${name} → HTTP ${response.status}: ${raw.slice(0, 300)}`);
  let message: any = null;
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    for (const chunk of raw.split(/\n\n/)) {
      const data = chunk.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.result !== undefined || parsed.error !== undefined) message = parsed;
      } catch {
        // skip
      }
    }
  } else {
    message = JSON.parse(raw);
  }
  if (message?.error) throw new Error(`${name}: ${message.error.message}`);
  const text = message?.result?.content?.find((c: any) => c.type === 'text')?.text;
  if (!text) return message?.result as T;
  let parsed = JSON.parse(text);
  if (Array.isArray(parsed) && parsed[0]?.type === 'text') parsed = JSON.parse(parsed[0].text);
  return parsed as T;
}

async function waitFor(predicate: (state: any) => 'done' | 'failed' | 'wait', timeoutMs: number): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let lastLine = '';
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const status = await mcpCall('rt_get_analysis_status', {});
    const state = status.state;
    if (state) {
      const line = `${state.percent}% · ${state.stepLabel}${state.currentFile ? ` · ${state.currentFile}` : ''}`;
      if (line !== lastLine) {
        console.log(`        ${line}`);
        lastLine = line;
      }
    }
    const verdict = predicate(status);
    if (verdict === 'done') return status;
    if (verdict === 'failed') throw new Error(`run failed: ${state?.message ?? JSON.stringify(state?.errors ?? [])}`);
  }
  throw new Error('timeout');
}

async function main() {
  if (!(await reachable(`${BACKEND_BASE}/api/health`)) && !(await reachable(BACKEND_BASE))) skip(`backend not reachable at ${BACKEND_BASE}`);
  if (!(await reachable(OAUTH_BASE))) skip(`oauth server not reachable at ${OAUTH_BASE}`);

  // fixtures come straight from the seed so the demo invariants stay in one place
  const { TENDER_DOCS } = await import('../../scripts/seed-requirements-tracking/fixtures/tender-files');
  const { WORKBOOK_FILE_NAME, WORKBOOK_SHEETS, EXPECTED_CONTRADICTIONS } = await import('../../scripts/seed-requirements-tracking/fixtures/tender-xlsx');
  const { CATALOG_FILE_NAME, CATALOG_MD, GLOSSARY_FILE_NAME, GLOSSARY_MD } = await import('../../scripts/seed-requirements-tracking/fixtures/servicecatalog');
  const { TEMPLATE_FILE_NAME, TEMPLATE_MD } = await import('../../scripts/seed-requirements-tracking/fixtures/analysis-template');
  const { renderDocx } = await import('../../scripts/seed-requirements-tracking/lib/docx-writer');
  const { renderWorkbook } = await import('../../scripts/seed-requirements-tracking/lib/xlsx-writer');

  const root = join(WORKSPACE_ROOT, PROJECT);
  console.log(`project: ${root}`);
  for (const dir of ['tender', 'servicecatalog', 'analysis-template', 'out/analysis', '.claude']) {
    await mkdir(join(root, dir), { recursive: true });
  }
  for (const doc of TENDER_DOCS) await writeFile(join(root, 'tender', doc.fileName), await renderDocx(doc.title, doc.body));
  await writeFile(join(root, 'tender', WORKBOOK_FILE_NAME), await renderWorkbook(WORKBOOK_SHEETS));
  await writeFile(join(root, 'servicecatalog', CATALOG_FILE_NAME), CATALOG_MD, 'utf8');
  await writeFile(join(root, 'servicecatalog', GLOSSARY_FILE_NAME), GLOSSARY_MD, 'utf8');
  await writeFile(join(root, 'analysis-template', TEMPLATE_FILE_NAME), TEMPLATE_MD, 'utf8');
  pass('fixtures written');

  await mcpCall('rt_init_tender', { key: 'T-TEST', title: 'Integration', phase: 'bid', language: 'de' });

  // ── phase A ────────────────────────────────────────────────────────────
  const started = await mcpCall('rt_run_tender_analysis', {});
  assert.ok(started.started, `phase A did not start: ${JSON.stringify(started)}`);
  pass(`phase A started (${started.runId})`);

  let status: any;
  try {
    status = await waitFor(
      (s) => (s.state?.status === 'awaiting_review' ? 'done' : s.state?.status === 'failed' ? 'failed' : 'wait'),
      PHASE_TIMEOUT_MS,
    );
  } catch (error: any) {
    if (/LLM|model|api key|401|429|provider/i.test(String(error.message))) skip(`phase A needs an LLM: ${error.message}`);
    throw error;
  }
  const state = status.state;
  const tenderFiles = state.files.filter((f: any) => f.kind === 'tender');
  assert.equal(tenderFiles.length, 3, 'three tender files discovered');
  assert.ok(tenderFiles.every((f: any) => ['parsed', 'extracted'].includes(f.status)), `all tender files parsed: ${JSON.stringify(tenderFiles.map((f: any) => [f.name, f.status, f.error]))}`);
  assert.ok(state.extraction.proposalIds.length >= 10, `≥ 10 requirement cards (got ${state.extraction.proposalIds.length})`);
  assert.ok(state.figures.count >= 15, `figure index built (${state.figures.count})`);
  assert.ok(state.glossary.terms > 0, 'glossary built');
  pass(`phase A: ${tenderFiles.length} files, ${state.extraction.proposalIds.length} cards, ${state.figures.count} figures, ${state.glossary.terms} glossary terms`);

  assert.equal(
    status.alerts.length,
    EXPECTED_CONTRADICTIONS.length,
    `exactly ${EXPECTED_CONTRADICTIONS.length} contradictions (got ${status.alerts.length}: ${JSON.stringify(status.alerts.map((a: any) => a.figureId))})`,
  );
  for (const expected of EXPECTED_CONTRADICTIONS) {
    const id = `${expected.sheet}!${expected.cell}`;
    const hit = status.alerts.find((a: any) => a.figureId === id);
    assert.ok(hit, `contradiction ${id} (${expected.label}) was raised`);
    assert.equal(hit.excelValue, expected.excelValue, `${id} excel value`);
    assert.equal(hit.tenderValue, expected.tenderValue, `${id} tender value`);
  }
  pass(`${EXPECTED_CONTRADICTIONS.length} contradictions raised, each matching its workbook cell`);

  assert.ok(state.catalog.serviceIds.length >= 6, `catalog published (${state.catalog.serviceIds.length} services)`);
  assert.ok(state.catalog.capabilities > 0, 'EARS capability statements generated');
  pass(`catalog: ${state.catalog.serviceIds.length} services, ${state.catalog.capabilities} EARS statements`);

  assert.equal(status.readiness.phaseB, false, 'phase B locked while cards are open');
  const blocked = await mcpCall('rt_continue_tender_analysis', {});
  assert.equal(blocked.success, false, 'continue refused while review is open');
  pass('phase B is blocked until review + contradictions are clear');

  // ── human gate (simulated) ────────────────────────────────────────────
  const proposals = await mcpCall('rt_list_proposals', { kind: 'extraction', status: 'proposed' });
  const bulk = await mcpCall('rt_bulk_decide', { kind: 'extraction', decision: 'approved', minConfidence: 0 });
  const bulkApproved = bulk.results.filter((r: any) => r.success).map((r: any) => r.proposalId);
  for (const alert of status.alerts) {
    assert.ok(!bulkApproved.includes(alert.proposalId), `bulk approve skips the card carrying ${alert.figureId}`);
  }
  for (const alert of status.alerts) {
    const resolved = await mcpCall('rt_resolve_consistency_alert', {
      proposalId: alert.proposalId,
      alertIndex: alert.alertIndex,
      resolution: 'clarify',
    });
    assert.ok(resolved.success, `alert ${alert.figureId} resolved`);
  }
  const remaining = (await mcpCall('rt_list_proposals', { kind: 'extraction', status: 'proposed' })).proposals;
  for (const proposal of remaining) {
    await mcpCall('rt_decide_proposal', { proposalId: proposal.id, decision: 'approved' });
  }
  pass(`review simulated: ${proposals.proposals.length} cards approved (${bulkApproved.length} via bulk), contradiction → "beim Kunden klären"`);

  status = await mcpCall('rt_get_analysis_status', {});
  assert.equal(status.readiness.openReviews, 0);
  assert.equal(status.readiness.unresolvedAlerts, 0);
  assert.equal(status.readiness.phaseB, true, 'phase B unlocked');
  pass('readiness: phase B unlocked');

  // ── phase B ────────────────────────────────────────────────────────────
  const continued = await mcpCall('rt_continue_tender_analysis', {});
  assert.ok(continued.started, `phase B did not start: ${JSON.stringify(continued)}`);
  status = await waitFor(
    (s) => (['finished', 'partial'].includes(s.state?.status) ? 'done' : s.state?.status === 'failed' ? 'failed' : 'wait'),
    PHASE_TIMEOUT_MS,
  );
  const final = status.state;
  assert.ok(final.mapping, 'mapping ran');
  const mappingProposals = (await mcpCall('rt_list_proposals', { kind: 'mapping' })).proposals.filter((p: any) => p.payload?.analysis_run_id === final.runId);
  assert.ok(mappingProposals.every((p: any) => p.confidence >= 0.75 && p.payload.coverage !== 'related'), 'only clear matches proposed');
  assert.ok(final.compliance && final.compliance.proposalIds.length > 0, 'verdicts proposed');
  const verdicts = final.compliance.verdicts;
  assert.ok((verdicts.PARTIAL ?? 0) + (verdicts.NON_COMPLIANT ?? 0) >= 1, `Gefahrgut requirement is not FULL (${JSON.stringify(verdicts)})`);
  pass(`phase B: ${mappingProposals.length} mappings, verdicts ${JSON.stringify(verdicts)}`);

  assert.ok(final.report?.markdownPath?.startsWith('out/analysis/'), 'report markdown written');
  const { readFile } = await import('node:fs/promises');
  const markdown = await readFile(join(root, final.report.markdownPath), 'utf8');
  assert.ok(markdown.includes('| Anforderungen gesamt |'), 'KPI table present');
  assert.ok(markdown.includes('Palettenstellplätze'), 'contradiction question in the report');
  assert.equal(status.readiness.reliable, false, 'analysis carries reservations (clarify)');
  pass(`report: ${final.report.markdownPath}${final.report.docxPath ? ` + ${final.report.docxPath}` : ' (no DOCX)'}`);

  // ── idempotent re-run ────────────────────────────────────────────────
  const rerun = await mcpCall('rt_run_tender_analysis', {});
  assert.ok(rerun.started, 're-run starts');
  status = await waitFor(
    (s) => (s.state?.runId === rerun.runId && s.state?.status === 'awaiting_review' ? 'done' : s.state?.status === 'failed' ? 'failed' : 'wait'),
    PHASE_TIMEOUT_MS,
  );
  const rerunFiles = status.state.files.filter((f: any) => f.kind === 'tender' && f.ext !== '.xlsx');
  assert.ok(rerunFiles.every((f: any) => /bereits extrahiert/.test(f.reason ?? '')), `unchanged files skipped: ${JSON.stringify(rerunFiles.map((f: any) => f.reason))}`);
  assert.ok(status.state.catalog.skipped, 'unchanged catalog skipped');
  pass('re-run without force skips unchanged documents and catalog');

  console.log(`\n${passed} checks passed`);
  if (!KEEP) {
    await rm(root, { recursive: true, force: true });
    console.log(`cleaned up ${root} (graph/vector entries for ${PROJECT} remain — TEST_KEEP=1 keeps the folder)`);
  }
}

main().catch((error) => {
  console.error(`\n  FAIL  ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
