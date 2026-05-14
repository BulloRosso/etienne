/**
 * Picker integration test.
 *
 * Two load-bearing properties:
 *   - PRD §13 / firewall point 4: Picker MUST NOT depend on PersonalityStore.
 *     Verified by introspecting the constructor parameter metadata recorded
 *     by `reflect-metadata` (emitted because tsconfig has emitDecoratorMetadata).
 *   - Whole-page rule (PRD §5.2 step 4): Wiki pages flow through whole.
 *
 * Run with: tsx test/adaptive-memory-picker.test.ts
 */

import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'pk-'));
  process.env.WORKSPACE_ROOT = workspace;
  console.log(`# workspace: ${workspace}`);

  try {
    // Provision a minimal project with a dreaming skill.
    const project = 'pk-proj';
    const skillName = 'dreaming';
    const skillDir = join(workspace, project, '.claude', 'skills', skillName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
description: Reflection skill
classificationContext: private
invocationTriggers:
  - dream
  - reflect
sourcePriorities:
  - store: wiki
    priority: 1
  - store: kg
    priority: 2
  - store: rag
    priority: 5
---
# Dreaming
Body.
`,
      'utf8',
    );

    const { Picker } = await import('../src/adaptive-memory/subagents/picker.service');
    const { SkillsStore } = await import('../src/adaptive-memory/stores/skills.store');
    const {
      KGFake,
      PreferencesFake,
      RAGFake,
      SORFake,
      WikiFake,
    } = await import('../src/adaptive-memory/adapters/fakes');
    const { strictestCeiling } = await import('../src/memory/classification');

    // 1. STRUCTURAL FIREWALL — Picker constructor's design-paramtypes don't
    //    include anything personality-related. tsc with emitDecoratorMetadata
    //    records the constructor parameter types on the class.
    const paramtypes: any[] = Reflect.getMetadata('design:paramtypes', Picker) ?? [];
    const names = paramtypes.map((t) => (t?.name ?? String(t)).toLowerCase());
    const hasPersonality = names.some((n) => n.includes('personality'));
    assert.equal(
      hasPersonality,
      false,
      `Picker constructor must not include any PersonalityStore dependency. Got types: ${names.join(', ')}`,
    );
    // Also: no field on a constructed instance carries "personality".
    const wikiFake = new WikiFake();
    const kgFake = new KGFake();
    const ragFake = new RAGFake();
    const sorFake = new SORFake();
    const prefsFake = new PreferencesFake();
    const skills = new SkillsStore();
    const picker = new Picker(wikiFake, kgFake, ragFake, sorFake, prefsFake, skills);
    const fieldNames = Object.keys(picker as any).map((k) => k.toLowerCase());
    assert.equal(
      fieldNames.some((f) => f.includes('personality')),
      false,
      `Picker instance must not carry a personality field. Got: ${fieldNames.join(', ')}`,
    );
    console.log('  PASS  Picker has no PersonalityStore dependency (firewall point 4)');

    // 2. Seed all adapters with PRD-classified entries.
    wikiFake.seed(project, {
      id: 'mid-century-sofa',
      classification: 'private',
      provenance: minimalProv(),
      title: 'Mid-century Sofa',
      slug: 'mid-century-sofa',
      body: 'A walnut-frame sofa. References [related](../topics/related.md).',
      links: ['related'],
    });
    wikiFake.seed(project, {
      id: 'related',
      classification: 'public',
      provenance: minimalProv(),
      title: 'Related',
      slug: 'related',
      body: 'Related material.',
      links: [],
    });

    kgFake.seedEntity(project, {
      id: 'sofa',
      classification: 'private',
      provenance: minimalProv(),
      type: 'Product',
      label: 'Sofa',
      attributes: {},
    });
    kgFake.seedEntity(project, {
      id: 'walnut',
      classification: 'private',
      provenance: minimalProv(),
      type: 'Material',
      label: 'Walnut',
      attributes: {},
    });
    kgFake.seedEdge(project, {
      id: 'e1',
      classification: 'private',
      provenance: minimalProv(),
      subject: 'sofa',
      predicate: 'made_of',
      object: 'walnut',
    });

    ragFake.seed(project, {
      id: 'r-public',
      classification: 'public',
      provenance: minimalProv(),
      text: 'walnut durability guide',
      embeddingId: 'v1',
      tags: ['furniture'],
    });
    ragFake.seed(project, {
      id: 'r-secret',
      classification: 'secret',
      provenance: minimalProv(),
      text: 'walnut pricing',
      embeddingId: 'v2',
      tags: ['pricing'],
    });

    prefsFake.seed(project, {
      id: 'pref1',
      classification: 'private',
      provenance: minimalProv(),
      scope: 'user',
      statement: 'walnut preferred over oak',
      confidence: 0.9,
    });

    // 3. Assemble with the dreaming skill active.
    const framing = {
      intent: 'tell me about walnut',
      keywords: ['walnut', 'sofa'],
      activeSkillIds: [skillName],
    };
    const candidate = await picker.assemble(framing, project);

    // 4. Wiki pages come through whole, not split.
    assert.equal(candidate.wikiPages.length, 1);
    assert.equal(candidate.wikiPages[0].slug, 'mid-century-sofa');
    assert.ok(
      candidate.wikiPages[0].body.includes('walnut-frame sofa'),
      'wiki page body should arrive whole',
    );
    console.log('  PASS  Picker fetches whole Wiki pages (whole-page rule)');

    // 5. KG subgraph contains the rooted entity + its neighbour.
    assert.deepEqual(
      candidate.kgSubgraph.entities.map((e) => e.id).sort(),
      ['sofa', 'walnut'],
    );
    assert.equal(candidate.kgSubgraph.edges.length, 1);
    console.log('  PASS  Picker pulls a depth-1 KG subgraph');

    // 6. RAG fragments filtered by ceiling: ceiling=private so secret is dropped.
    const ragIds = candidate.ragFragments.map((f) => f.id).sort();
    assert.deepEqual(
      ragIds,
      ['r-public'],
      'secret-class RAG fragment must be filtered out at the source by ceiling=private',
    );
    console.log('  PASS  Picker filters RAG by skill ceiling (secret excluded at source)');

    // 7. Preferences come through.
    assert.equal(candidate.preferences.length, 1);
    assert.equal(candidate.preferences[0].id, 'pref1');
    console.log('  PASS  Picker pulls matching preferences');

    // 8. Active skills are loaded.
    assert.equal(candidate.activeSkills.length, 1);
    assert.equal(candidate.activeSkills[0].name, skillName);
    const ceiling = strictestCeiling(candidate.activeSkills);
    assert.equal(ceiling, 'private');
    console.log('  PASS  Picker loads active skills and ceiling=private');

    // 9. Empty active skills → loosest ceiling (PRD §5.2: with no skill the
    //    firewall has no opinion, so even secret-class entries pass the ceiling
    //    test at the source). The RAG fake's substring matcher needs query
    //    overlap, so we query for "walnut" which appears in both fragments.
    const emptyCandidate = await picker.assemble(
      { intent: 'walnut', keywords: ['walnut'], activeSkillIds: [] },
      project,
    );
    assert.equal(emptyCandidate.activeSkills.length, 0);
    const noSkillCeil = strictestCeiling(emptyCandidate.activeSkills);
    assert.equal(noSkillCeil, 'secret');
    assert.equal(
      emptyCandidate.ragFragments.length,
      2,
      'with ceiling=secret and overlapping intent both fragments pass through',
    );
    console.log('  PASS  empty active-skills ⇒ loosest ceiling (secret-class passes when no skill is active)');

    console.log('\nAll Picker tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function minimalProv() {
  return {
    sourceSessions: [],
    sourceEntries: [],
    createdBy: 'agent' as const,
    createdAt: '2026-05-14T00:00:00Z',
    updatedAt: '2026-05-14T00:00:00Z',
  };
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
