import { Injectable } from '@nestjs/common';

/**
 * Per-project async mutex. All state-changing TenderTrace operations (proposal
 * decisions, freeze, accept, publish, counter increments) run under this lock,
 * which makes first-writer-wins guards sound in the single-writer topology the
 * spec accepts (§12.10). Pattern from backend/src/issues/issues.service.ts.
 */
@Injectable()
export class ProjectLockService {
  private locks = new Map<string, Promise<void>>();

  async withLock<T>(project: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(project) ?? Promise.resolve();

    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(project, next);

    try {
      await previous;
      return await fn();
    } finally {
      release();
      if (this.locks.get(project) === next) {
        this.locks.delete(project);
      }
    }
  }
}
