/**
 * Regression tests for ProjectLockService
 * (backend/src/requirements-tracking/store/project-lock.service.ts).
 *
 * Live-run defect (2026-09-13): the lock was a plain non-reentrant mutex, but
 * `ProposalService.decide()` takes it and its catalog_import effect calls
 * `TtCatalogService.createService()/publish()`, which take it again. The inner
 * acquisition waited for the outer holder, which was waiting for the inner
 * call — the tender-analysis catalog step hung forever (0 of 10 imports
 * decided, run frozen at 56 % for 40+ minutes).
 *
 * Run with:  cd backend && npx tsx test/reqtrack-project-lock.test.ts
 */
import { strict as assert } from 'node:assert';
import { ProjectLockService } from '../src/requirements-tracking/store/project-lock.service';

let passed = 0;
function pass(msg: string) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} deadlocked (> ${ms} ms)`)), ms)),
  ]);
}

async function main() {
  // 1. the exact production chain: decide() -> effect -> createService -> publish
  {
    const locks = new ProjectLockService();
    const order: string[] = [];
    const result = await withTimeout(
      locks.withLock('demo', async () => {
        order.push('decide');
        const serviceId = await locks.withLock('demo', async () => {
          order.push('createService');
          return locks.withLock('demo', async () => {
            order.push('publish');
            return 'SVC-001';
          });
        });
        return serviceId;
      }),
      2000,
      'nested same-project lock',
    );
    assert.equal(result, 'SVC-001');
    assert.deepEqual(order, ['decide', 'createService', 'publish']);
    pass('re-entrant: decide → createService → publish on one project does not deadlock');
  }

  // 2. mutual exclusion between separate operations is preserved
  {
    const locks = new ProjectLockService();
    const events: string[] = [];
    const slow = locks.withLock('demo', async () => {
      events.push('A:start');
      await new Promise((r) => setTimeout(r, 60));
      events.push('A:end');
    });
    const fast = locks.withLock('demo', async () => {
      events.push('B:start');
      events.push('B:end');
    });
    await withTimeout(Promise.all([slow, fast]), 2000, 'serialised operations');
    assert.deepEqual(events, ['A:start', 'A:end', 'B:start', 'B:end'], `serialised: ${events.join(',')}`);
    pass('separate operations on one project still run strictly one after another');
  }

  // 3. different projects are independent (no cross-project blocking)
  {
    const locks = new ProjectLockService();
    let bDone = false;
    const a = locks.withLock('alpha', async () => {
      await new Promise((r) => setTimeout(r, 80));
      return bDone; // beta must have finished while alpha was sleeping
    });
    const b = locks.withLock('beta', async () => {
      bDone = true;
    });
    const [aSawB] = await withTimeout(Promise.all([a, b]), 2000, 'cross-project');
    assert.equal(aSawB, true, 'beta ran while alpha held its own lock');
    pass('locks are per project: a different project is never blocked');
  }

  // 4. a nested call must not leak the held-set to a sibling project
  {
    const locks = new ProjectLockService();
    const events: string[] = [];
    await withTimeout(
      locks.withLock('demo', async () => {
        // nested acquisition of ANOTHER project queues normally
        await locks.withLock('other', async () => {
          events.push('other:inner');
        });
        events.push('demo:done');
      }),
      2000,
      'nested different project',
    );
    assert.deepEqual(events, ['other:inner', 'demo:done']);
    pass('holding one project does not grant re-entry to another');
  }

  // 5. the lock is released when the body throws (no permanent wedge)
  {
    const locks = new ProjectLockService();
    await assert.rejects(() => locks.withLock('demo', async () => { throw new Error('boom'); }), /boom/);
    const after = await withTimeout(locks.withLock('demo', async () => 'recovered'), 2000, 'post-throw acquisition');
    assert.equal(after, 'recovered');
    pass('a throwing critical section releases the lock');
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(`\n  FAIL  ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
