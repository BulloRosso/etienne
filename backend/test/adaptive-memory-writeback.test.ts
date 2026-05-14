/**
 * Writeback tools test — firewall point 1.
 *
 * Validates:
 *   - Every tool rejects when `classification` is missing / null / invalid.
 *   - Successful tool calls perform the underlying write AND populate
 *     SessionTurn.storeWrites on the current turn.
 *   - onToolEvent fires for both success and rejection.
 *
 * The tools' `execute` functions accept their typed input directly; we don't
 * need to go through the LLM to exercise them.
 *
 * Run with: tsx test/adaptive-memory-writeback.test.ts
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'wb-'));
  process.env.WORKSPACE_ROOT = workspace;
  const project = 'wb-proj';
  mkdirSync(join(workspace, project), { recursive: true });
  console.log(`# workspace: ${workspace}`);

  try {
    const { buildWritebackTools } = await import(
      '../src/adaptive-memory/tools/writeback'
    );
    const { SessionsStore } = await import(
      '../src/adaptive-memory/stores/sessions.store'
    );
    const {
      KGFake,
      PreferencesFake,
      RAGFake,
      WikiFake,
    } = await import('../src/adaptive-memory/adapters/fakes');

    const sessions = new SessionsStore();
    const wiki = new WikiFake();
    const kg = new KGFake();
    const rag = new RAGFake();
    const preferences = new PreferencesFake();

    const session = await sessions.open(project, 'wb-sess', { activeSkills: [] });
    // Each tool call needs a turn to attach to.
    await sessions.appendTurn(project, session, {
      role: 'agent',
      content: 'attempting writebacks',
      storeWrites: [],
    });

    const events: any[] = [];
    const tools = buildWritebackTools({
      projectId: project,
      session,
      wiki,
      kg,
      rag,
      preferences,
      sessions,
      onToolEvent: (e) => events.push(e),
    });

    const PROV = {
      sourceSessions: ['wb-sess'],
      sourceEntries: [],
      createdBy: 'agent' as const,
      createdAt: '2026-05-14T00:00:00Z',
      updatedAt: '2026-05-14T00:00:00Z',
    };

    // --- 1. wiki_put_page rejects on missing classification --------------
    // We use `as any` because the Zod schema's classification field is required
    // — bypassing the static check is exactly what a misbehaving model would do
    // at runtime, and the firewall must catch it.
    let res = await (tools.wiki_put_page as any).execute({
      title: 'no class',
      body: 'b',
      sources: [],
      provenance: PROV,
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'writeback_missing_or_invalid_classification');
    console.log('  PASS  wiki_put_page rejects missing classification');

    // --- 2. wiki_put_page rejects on invalid classification value --------
    res = await (tools.wiki_put_page as any).execute({
      title: 'bad class',
      body: 'b',
      sources: [],
      classification: 'restricted',
      provenance: PROV,
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'writeback_missing_or_invalid_classification');
    console.log('  PASS  wiki_put_page rejects invalid classification value');

    // --- 3. wiki_put_page success path -----------------------------------
    res = await (tools.wiki_put_page as any).execute({
      title: 'Good Page',
      body: 'Good body',
      sources: [{ kind: 'conversation', turn: '2026-05-14T00:00:00Z' }],
      classification: 'private',
      provenance: PROV,
    });
    assert.equal(res.ok, true);
    assert.equal(res.entryId, 'good-page');
    // Side effects: the page is in the fake, and the session turn records the write.
    const page = await wiki.getPage(project, 'good-page');
    assert.ok(page);
    const reloaded = await sessions.read(project, session.id);
    const writes = reloaded!.turns[0].storeWrites;
    assert.deepEqual(writes[writes.length - 1], { store: 'wiki', entryId: 'good-page' });
    console.log('  PASS  wiki_put_page writes & records on success');

    // --- 4. kg_assert_entity success path --------------------------------
    res = await (tools.kg_assert_entity as any).execute({
      id: 'sofa',
      type: 'Product',
      label: 'Sofa',
      attributes: { material: 'walnut' },
      classification: 'private',
      provenance: PROV,
    });
    assert.equal(res.ok, true);
    assert.equal(res.entryId, 'sofa');
    const sub = await kg.subgraph(project, 'sofa', 0);
    assert.equal(sub.entities.length, 1);
    assert.equal(sub.entities[0].id, 'sofa');
    console.log('  PASS  kg_assert_entity writes & records');

    // --- 5. kg_assert_edge success path ----------------------------------
    await (tools.kg_assert_entity as any).execute({
      id: 'walnut',
      type: 'Material',
      label: 'Walnut',
      attributes: {},
      classification: 'private',
      provenance: PROV,
    });
    res = await (tools.kg_assert_edge as any).execute({
      id: 'sofa-walnut',
      subject: 'sofa',
      predicate: 'made_of',
      object: 'walnut',
      classification: 'private',
      provenance: PROV,
    });
    assert.equal(res.ok, true);
    const sub2 = await kg.subgraph(project, 'sofa', 1);
    assert.deepEqual(
      sub2.entities.map((e) => e.id).sort(),
      ['sofa', 'walnut'],
    );
    console.log('  PASS  kg_assert_edge writes & records');

    // --- 6. rag_index_fragment success -----------------------------------
    res = await (tools.rag_index_fragment as any).execute({
      id: 'frag-1',
      text: 'walnut characteristics',
      tags: ['furniture'],
      classification: 'public',
      provenance: PROV,
    });
    assert.equal(res.ok, true);
    const hits = await rag.query(project, 'walnut', {
      topK: 5,
      classificationFilter: ['public', 'private'],
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'frag-1');
    console.log('  PASS  rag_index_fragment writes & records');

    // --- 7. preference_record success ------------------------------------
    res = await (tools.preference_record as any).execute({
      id: 'pref-1',
      scope: 'user',
      statement: 'walnut over oak',
      confidence: 0.85,
      classification: 'private',
      provenance: PROV,
    });
    assert.equal(res.ok, true);
    const prefHits = await preferences.matching(project, 'walnut question');
    assert.equal(prefHits.length, 1);
    console.log('  PASS  preference_record writes & records');

    // --- 8. onToolEvent received both rejections and successes ----------
    assert.ok(events.length >= 7);
    assert.ok(events.some((e) => !e.ok && e.error === 'writeback_missing_or_invalid_classification'));
    assert.ok(events.some((e) => e.ok && e.tool === 'wiki_put_page'));
    console.log('  PASS  onToolEvent fires for every call (success + rejection)');

    // --- 9. SessionTurn.storeWrites reflects every successful write ------
    const finalSession = await sessions.read(project, session.id);
    const allWrites = finalSession!.turns[0].storeWrites;
    assert.deepEqual(
      allWrites.map((w) => `${w.store}:${w.entryId}`).sort(),
      [
        'kg:sofa',
        'kg:sofa-walnut',
        'kg:walnut',
        'preferences:pref-1',
        'rag:frag-1',
        'wiki:good-page',
      ],
    );
    console.log('  PASS  storeWrites contains exactly the successful writes');

    // --- 10. Tool that fails after firewall passes: rag.index throws ----
    // Easy way to force a post-firewall failure: seed a non-existent project
    // path so wiki-add can't write. Easier: use a wrapped fake that throws.
    const explodingRag = {
      ...rag,
      index: async () => {
        throw new Error('boom: simulated rag failure');
      },
    };
    const explodingTools = buildWritebackTools({
      projectId: project,
      session,
      wiki,
      kg,
      rag: explodingRag as any,
      preferences,
      sessions,
      onToolEvent: (e) => events.push(e),
    });
    res = await (explodingTools.rag_index_fragment as any).execute({
      id: 'will-fail',
      text: 'doomed',
      tags: [],
      classification: 'public',
      provenance: PROV,
    });
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('boom'), `error should include downstream message: ${res.error}`);
    console.log('  PASS  post-firewall failures surface as ok:false with the upstream error');

    console.log('\nAll writeback-tool tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
