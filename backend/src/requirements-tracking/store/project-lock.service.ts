import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-project async mutex. All state-changing TenderTrace operations (proposal
 * decisions, freeze, accept, publish, counter increments) run under this lock,
 * which makes first-writer-wins guards sound in the single-writer topology the
 * spec accepts (§12.10). Pattern from backend/src/issues/issues.service.ts.
 *
 * RE-ENTRANT per project: a decision effect legitimately calls services that
 * lock again (catalog_import → createService → saveDraftVersion → publish).
 * With a plain mutex the inner acquisition waits for the outer holder, which
 * is waiting for the inner call — a deadlock that froze the tender-analysis
 * catalog step indefinitely (observed 2026-09-13, 0 of 10 imports decided).
 * AsyncLocalStorage tracks which project the current async context already
 * holds, so a nested call on the SAME project runs inline; a different project
 * still queues normally.
 */
@Injectable()
export class ProjectLockService {
  private locks = new Map<string, Promise<void>>();
  private readonly held = new AsyncLocalStorage<Set<string>>();

  async withLock<T>(project: string, fn: () => Promise<T>): Promise<T> {
    const current = this.held.getStore();
    // already holding this project's lock in this async context → run inline
    if (current?.has(project)) {
      return fn();
    }

    const previous = this.locks.get(project) ?? Promise.resolve();

    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(project, next);

    try {
      await previous;
      const owned = new Set(current ?? []);
      owned.add(project);
      return await this.held.run(owned, fn);
    } finally {
      release();
      if (this.locks.get(project) === next) {
        this.locks.delete(project);
      }
    }
  }
}
