/**
 * Regression tests for two crash-recovery defects found in the live run of
 * 2026-09-13 (backend/src/requirements-tracking/pipelines/tender-analysis.pipeline.ts):
 *
 *  1. getStatus() used to MUTATE state: a run whose heartbeat had gone stale
 *     was flipped to "failed". Because importCatalog writes no state across
 *     its LLM call, the status poller killed its own live run at 56 %.
 *     getStatus must be a pure read that only annotates `message`.
 *  2. importCatalog only decided the proposals of its own import, so a
 *     crashed run left undecided catalog_import cards behind and the next run
 *     stacked a second import on top (observed: 20 open cards, 0 services).
 *     rejectOrphanedImports() must clear them first.
 *
 * Pure unit tests: the pipeline is constructed with stubs, no services needed.
 *
 * Run with:  cd backend && npx tsx test/reqtrack-analysis-run-recovery.test.ts
 */
import { strict as assert } from 'node:assert';
import { TenderAnalysisPipeline, isRunLive } from '../src/requirements-tracking/pipelines/tender-analysis.pipeline';
import type { AnalysisRunState } from '../src/requirements-tracking/analysis/analysis-types';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

const PROJECT = 'demo';

function baseState(overrides: Partial<AnalysisRunState> = {}): AnalysisRunState {
  const now = new Date().toISOString();
  return {
    schema: 'tendertrace.analysis.v1',
    runId: 'AN-001',
    tenderKey: 'T-TEST',
    status: 'running',
    phase: 'A',
    percent: 56,
    step: 'catalog',
    stepLabel: 'Leistungskatalog importieren',
    startedAt: now,
    updatedAt: now,
    heartbeatAt: now,
    options: { force: false, minMappingConfidence: 0.75, language: 'de', autoPublishCatalog: true, extractWorkbooks: false },
    inputs: { tenderDir: 'tender', catalogFiles: [] },
    files: [],
    extraction: { proposalIds: [], failedChunks: 0, mergeCandidates: 0, documents: 0 },
    figures: { count: 0 },
    glossary: { terms: 0 },
    consistency: { checked: 0, matched: 0, alerts: [] },
    catalog: { serviceIds: [], published: 0, capabilities: 0, skipped: false },
    review: { open: 0, approved: 0, rejected: 0, total: 0 },
    agentRunIds: [],
    errors: [],
    ...overrides,
  } as AnalysisRunState;
}

/** Pipeline with just enough stubbed collaborators for getStatus/rejectOrphanedImports. */
function makePipeline(opts: {
  state: AnalysisRunState;
  proposals?: any[];
  onWrite?: (path: string, value: any) => void;
  onDecide?: (id: string, input: any) => void;
}) {
  const writes: Array<{ path: string; value: any }> = [];
  const decisions: Array<{ id: string; input: any }> = [];
  const files = {
    readJson: async (_p: string, path: string) => {
      if (path.endsWith('current.json')) return { runId: opts.state.runId };
      if (path.endsWith('state.json')) return JSON.parse(JSON.stringify(opts.state));
      throw new Error('not found');
    },
    writeJson: async (_p: string, path: string, value: any) => {
      writes.push({ path, value });
      opts.onWrite?.(path, value);
    },
    listDir: async () => [],
  };
  const repository = {
    listProposals: async (_p: string, filter: any) =>
      (opts.proposals ?? []).filter(
        (x) => (!filter?.kind || x.kind === filter.kind) && (!filter?.status || x.status === filter.status),
      ),
    getProposal: async (_p: string, id: string) => (opts.proposals ?? []).find((x) => x.id === id) ?? null,
    listRequirements: async () => [],
    listCompliance: async () => [],
    getVersions: async () => [],
  };
  const proposals = {
    decide: async (_p: string, id: string, input: any) => {
      decisions.push({ id, input });
      opts.onDecide?.(id, input);
      const target = (opts.proposals ?? []).find((x) => x.id === id);
      if (target) target.status = input.decision === 'rejected' ? 'rejected' : 'approved';
      return { success: true };
    },
  };
  const pipeline = new TenderAnalysisPipeline(
    {} as any, {} as any, {} as any, {} as any, {} as any,
    proposals as any,
    {} as any,
    repository as any,
    { invalidate() {} } as any,
    files as any,
    { emit: async () => ({}), stream: () => ({ subscribe: () => ({ unsubscribe() {} }) }) } as any,
    {} as any, {} as any, {} as any, {} as any, {} as any,
  );
  return { pipeline, writes, decisions };
}

async function main() {
// 1. getStatus never writes, even when the heartbeat is stale
{
  const stale = baseState({
    heartbeatAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    status: 'running',
  });
  const { pipeline, writes } = makePipeline({ state: stale });
  const payload = await pipeline.getStatus(PROJECT);
  assert.equal(writes.length, 0, `getStatus must not write state (wrote ${writes.length}×)`);
  assert.equal(payload.state?.status, 'running', 'a stale live run stays "running" — the owner decides, not a reader');
  assert.ok(/Kein Lebenszeichen/.test(payload.state?.message ?? ''), `staleness is only annotated: ${payload.state?.message}`);
  pass('getStatus is a pure read: stale heartbeat annotates message, never flips the run to failed');
}

// 2. a fresh heartbeat produces no staleness annotation at all
{
  const fresh = baseState({ message: 'Leistungskatalog importieren' });
  const { pipeline, writes } = makePipeline({ state: fresh });
  const payload = await pipeline.getStatus(PROJECT);
  assert.equal(writes.length, 0);
  assert.ok(!/Kein Lebenszeichen/.test(payload.state?.message ?? ''), 'no false staleness warning on a healthy run');
  pass('getStatus leaves a healthy run untouched');
}

// 3. orphaned catalog_import cards of an earlier import are rejected
{
  const state = baseState({ runId: 'AN-002' });
  const proposals = [
    { id: 'P-0001', kind: 'catalog_import', status: 'proposed', payload: { importId: 'IMP-001', title: 'Inbound-Handling' } },
    { id: 'P-0002', kind: 'catalog_import', status: 'proposed', payload: { importId: 'IMP-001', title: 'Order Fulfillment' } },
    { id: 'P-0003', kind: 'extraction', status: 'proposed', payload: {} },
  ];
  const { pipeline, decisions } = makePipeline({ state, proposals });
  await (pipeline as any).rejectOrphanedImports(PROJECT, state);
  assert.equal(decisions.length, 2, 'both undecided catalog_import cards decided');
  assert.ok(decisions.every((d) => d.input.decision === 'rejected'), 'they are rejected, never published');
  assert.ok(decisions.every((d) => /AN-002/.test(d.input.resolutionNote)), 'the note names the cleaning run');
  assert.ok(!decisions.some((d) => d.id === 'P-0003'), 'extraction cards are untouched');
  assert.equal(state.errors.length, 1, 'the cleanup is recorded in the run state');
  assert.ok(/verworfen/i.test(state.errors[0].error), state.errors[0].error);
  pass('rejectOrphanedImports clears undecided imports of a crashed run and records it');
}

// 4. nothing to clean → no decisions, no noise
{
  const state = baseState({ runId: 'AN-003' });
  const { pipeline, decisions } = makePipeline({ state, proposals: [] });
  await (pipeline as any).rejectOrphanedImports(PROJECT, state);
  assert.equal(decisions.length, 0);
  assert.equal(state.errors.length, 0, 'no error entry when there was nothing to clean');
  pass('rejectOrphanedImports is a no-op on a clean project');
}

// 5. isRunLive: the single staleness rule every guard must share.
//    Regression: the MCP tool and REST controller checked only
//    status === 'running'. Since getStatus is a pure read, an abandoned run
//    kept that status forever and blocked every new run ("Analyse AN-003
//    läuft bereits (56 %)") even though its heartbeat was 44 minutes old.
{
  const fresh = baseState({ status: 'running', heartbeatAt: new Date().toISOString() });
  const stale = baseState({ status: 'running', heartbeatAt: new Date(Date.now() - 44 * 60 * 1000).toISOString() });
  const finished = baseState({ status: 'finished', heartbeatAt: new Date().toISOString() });

  assert.equal(isRunLive(fresh), true, 'a running run with a fresh heartbeat is live');
  assert.equal(isRunLive(stale), false, 'a running run abandoned 44 min ago is NOT live');
  assert.equal(isRunLive(finished), false, 'a finished run is never live');
  assert.equal(isRunLive(null), false, 'no run at all is not live');
  assert.equal(isRunLive({ status: 'running' }), false, 'a run without a heartbeat is not live');
  // the exact boundary the guards rely on
  assert.equal(isRunLive(baseState({ heartbeatAt: new Date(Date.now() - 9 * 60 * 1000).toISOString() })), true, '9 min old still live');
  assert.equal(isRunLive(baseState({ heartbeatAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() })), false, '11 min old is stale');
  pass('isRunLive: status alone never counts as live — the heartbeat must be fresh');
}

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(`\n  FAIL  ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
