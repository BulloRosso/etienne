/**
 * Integration test for AdaptiveMemoryConfigService.
 *
 * Validates:
 *   - isActive() reflects the existence of the per-project file
 *   - get() throws when inactive, returns merged config when active
 *   - save() creates the file (activation gesture)
 *   - deactivate() removes the file
 *   - listActiveProjects() scans correctly
 *   - two-layer merge: baked-in ← workspace defaults ← per-project
 *
 * Run with: tsx test/adaptive-memory-config.test.ts
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'amc-'));
  process.env.WORKSPACE_ROOT = workspace;
  console.log(`# workspace: ${workspace}`);

  try {
    // Lazy import so WORKSPACE_ROOT is picked up.
    const { AdaptiveMemoryConfigService } = await import(
      '../src/adaptive-memory/config/adaptive-memory-config.service'
    );
    const svc = new AdaptiveMemoryConfigService();

    // Two projects: one will be activated, one not.
    const projA = 'proj-active';
    const projB = 'proj-inactive';
    mkdirSync(join(workspace, projA, '.etienne'), { recursive: true });
    mkdirSync(join(workspace, projB, '.etienne'), { recursive: true });

    // 1. Both projects initially inactive.
    assert.equal(svc.isActive(projA), false);
    assert.equal(svc.isActive(projB), false);
    assert.deepEqual(await svc.listActiveProjects(), []);
    console.log('  PASS  fresh projects are inactive');

    // 2. get() on inactive throws with the documented code.
    await assert.rejects(
      () => svc.get(projA),
      /adaptive_memory_inactive/,
      'get() should reject when inactive',
    );
    console.log('  PASS  get() rejects with adaptive_memory_inactive when inactive');

    // 3. peek() returns null on inactive.
    assert.equal(await svc.peek(projA), null);
    console.log('  PASS  peek() returns null on inactive');

    // 4. save() activates the project.
    const saved = await svc.save(projA, {
      ponderer: { qualityThresholdForInduction: 0.85 } as any,
      tokenBudget: 200_000,
    });
    assert.equal(svc.isActive(projA), true);
    assert.equal(svc.isActive(projB), false);
    assert.equal(saved.projectId, projA);
    assert.equal(saved.ponderer.qualityThresholdForInduction, 0.85);
    assert.equal(saved.tokenBudget, 200_000);
    // Untouched fields fall through to baked-in defaults.
    assert.equal(saved.ponderer.schedule, '0 22 * * *');
    assert.equal(saved.classificationPolicy.defaultForAgentWrites, 'private');
    console.log('  PASS  save() creates per-project file and activates');

    // 5. The file actually exists at the documented path.
    const expectedPath = join(workspace, projA, '.etienne', 'adaptive-memory.config.json');
    assert.equal(existsSync(expectedPath), true);
    console.log(`  PASS  per-project file at expected path: ${expectedPath.replace(workspace, '<ws>')}`);

    // 6. get() returns the merged config now.
    const got = await svc.get(projA);
    assert.equal(got.tokenBudget, 200_000);
    assert.equal(got.projectId, projA);
    console.log('  PASS  get() returns merged config when active');

    // 7. Workspace defaults override baked-in but not per-project.
    mkdirSync(join(workspace, '.agent', 'adaptive-memory'), { recursive: true });
    writeFileSync(
      join(workspace, '.agent', 'adaptive-memory', 'config.defaults.json'),
      JSON.stringify({
        tokenBudget: 50_000,  // overridden by per-project 200_000
        classificationPolicy: { secretSorTags: ['customer-data'] },  // wins
        mcpConnectors: ['lims'],  // wins
      }),
      'utf8',
    );
    const merged = await svc.get(projA);
    assert.equal(merged.tokenBudget, 200_000, 'per-project wins over workspace defaults');
    assert.deepEqual(merged.classificationPolicy.secretSorTags, ['customer-data']);
    assert.deepEqual(merged.mcpConnectors, ['lims']);
    console.log('  PASS  two-layer merge: baked-in ← workspace defaults ← per-project');

    // 8. listActiveProjects sees only projA.
    assert.deepEqual(await svc.listActiveProjects(), [projA]);
    console.log('  PASS  listActiveProjects scans workspace correctly');

    // 9. Activate B too.
    await svc.save(projB, { tokenBudget: 75_000 });
    const active = await svc.listActiveProjects();
    assert.deepEqual(active.sort(), [projA, projB].sort());
    console.log('  PASS  multiple active projects listed in stable order');

    // 10. deactivate removes the file.
    const dr = await svc.deactivate(projA);
    assert.equal(dr.deactivated, true);
    assert.equal(svc.isActive(projA), false);
    assert.equal(existsSync(expectedPath), false);
    await assert.rejects(() => svc.get(projA), /adaptive_memory_inactive/);
    console.log('  PASS  deactivate() removes file and disables activation');

    // 11. Idempotent deactivate.
    const dr2 = await svc.deactivate(projA);
    assert.equal(dr2.deactivated, false);
    console.log('  PASS  deactivate() is idempotent');

    // 12. saveDefaults / getDefaults round-trip.
    const defs = await svc.saveDefaults({ tokenBudget: 33_333 });
    assert.equal(defs.tokenBudget, 33_333);
    const got2 = await svc.getDefaults();
    assert.equal(got2.tokenBudget, 33_333);
    console.log('  PASS  saveDefaults/getDefaults round-trip');

    console.log('\nAll AdaptiveMemoryConfigService tests passed.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
