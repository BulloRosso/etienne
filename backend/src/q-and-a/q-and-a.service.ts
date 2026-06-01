import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeRoot } from '../claude/utils/path.utils';

export interface QAEntry {
  id: string;
  askedAt: string;
  context: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  acknowledged: boolean;
}

export interface QAFile {
  entries: QAEntry[];
}

export interface UserSummary {
  username: string;
  openCount: number;
  totalCount: number;
}

const QA_DIR = 'questions-and-answers';

@Injectable()
export class QAndAService {
  private readonly logger = new Logger(QAndAService.name);
  private readonly config = new ClaudeConfig();

  private static SAFE_USERNAME = /^[A-Za-z0-9_.@-]+$/;
  private static SAFE_ID = /^qa-[A-Za-z0-9-]+$/;

  private readonly writeLocks = new Map<string, Promise<unknown>>();

  private relPathFor(username: string): string {
    if (!QAndAService.SAFE_USERNAME.test(username)) {
      throw new Error('Invalid username');
    }
    return `${QA_DIR}/${username}.q-and-a.json`;
  }

  private absPathFor(project: string, username: string): string {
    const root = safeRoot(this.config.hostRoot, project);
    return join(root, this.relPathFor(username));
  }

  private absDirFor(project: string): string {
    const root = safeRoot(this.config.hostRoot, project);
    return join(root, QA_DIR);
  }

  private normalize(raw: any): QAFile {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) {
      return { entries: [] };
    }
    return {
      entries: raw.entries
        .filter((e: any) => e && typeof e === 'object')
        .map((e: any) => ({
          id: typeof e.id === 'string' ? e.id : '',
          askedAt: typeof e.askedAt === 'string' ? e.askedAt : '',
          context: typeof e.context === 'string' ? e.context : '',
          question: typeof e.question === 'string' ? e.question : '',
          answer: typeof e.answer === 'string' ? e.answer : null,
          answeredAt: typeof e.answeredAt === 'string' ? e.answeredAt : null,
          acknowledged: e.acknowledged === true,
        })),
    };
  }

  private async readRaw(absPath: string): Promise<QAFile> {
    try {
      const text = await fs.readFile(absPath, 'utf-8');
      try {
        return this.normalize(JSON.parse(text));
      } catch {
        return { entries: [] };
      }
    } catch (err: any) {
      if (err?.code === 'ENOENT') return { entries: [] };
      throw err;
    }
  }

  private async writeRaw(absPath: string, file: QAFile): Promise<void> {
    await fs.mkdir(dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, JSON.stringify(file, null, 2), 'utf-8');
  }

  // Serialise read-modify-write on the same file so concurrent appends never lose data.
  private async withLock<T>(absPath: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLocks.get(absPath) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.writeLocks.set(
      absPath,
      next.catch(() => undefined),
    );
    try {
      return await next;
    } finally {
      // Best-effort cleanup once the lock chain is idle.
      if (this.writeLocks.get(absPath) === next.catch(() => undefined)) {
        // Intentionally not deleting to avoid a race on rapid re-entry.
      }
    }
  }

  async readForUser(
    project: string,
    username: string,
  ): Promise<{ exists: boolean; entries: QAEntry[]; path: string }> {
    const relPath = this.relPathFor(username);
    const absPath = this.absPathFor(project, username);
    try {
      await fs.access(absPath);
    } catch {
      return { exists: false, entries: [], path: relPath };
    }
    const file = await this.readRaw(absPath);
    return { exists: true, entries: file.entries, path: relPath };
  }

  async appendQuestion(
    project: string,
    username: string,
    input: { context: string; question: string },
  ): Promise<{ success: true; entry: QAEntry }> {
    const absPath = this.absPathFor(project, username);
    return this.withLock(absPath, async () => {
      const current = await this.readRaw(absPath);
      const entry: QAEntry = {
        id: this.makeId(),
        askedAt: new Date().toISOString(),
        context: (input.context || '').toString(),
        question: (input.question || '').toString(),
        answer: null,
        answeredAt: null,
        acknowledged: false,
      };
      current.entries.push(entry);
      await this.writeRaw(absPath, current);
      return { success: true as const, entry };
    });
  }

  async acknowledge(
    project: string,
    username: string,
    entryId: string,
  ): Promise<{ success: true }> {
    if (!QAndAService.SAFE_ID.test(entryId)) {
      throw new Error('Invalid entry id');
    }
    const absPath = this.absPathFor(project, username);
    return this.withLock(absPath, async () => {
      const current = await this.readRaw(absPath);
      const idx = current.entries.findIndex((e) => e.id === entryId);
      if (idx === -1) {
        throw new NotFoundException(`Entry ${entryId} not found`);
      }
      current.entries[idx] = { ...current.entries[idx], acknowledged: true };
      await this.writeRaw(absPath, current);
      return { success: true as const };
    });
  }

  async unacknowledgedCount(project: string, username: string): Promise<number> {
    const { entries } = await this.readForUser(project, username);
    return entries.filter((e) => e.answer != null && !e.acknowledged).length;
  }

  async listAllUsers(project: string): Promise<UserSummary[]> {
    const dir = this.absDirFor(project);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
    const out: UserSummary[] = [];
    for (const file of files) {
      const m = file.match(/^(.+)\.q-and-a\.json$/);
      if (!m) continue;
      const username = m[1];
      if (!QAndAService.SAFE_USERNAME.test(username)) continue;
      const absPath = join(dir, file);
      try {
        const data = await this.readRaw(absPath);
        const openCount = data.entries.filter((e) => e.answer == null).length;
        out.push({ username, openCount, totalCount: data.entries.length });
      } catch (err) {
        this.logger.warn(`Failed to read ${absPath}: ${(err as Error).message}`);
      }
    }
    return out.sort((a, b) => b.openCount - a.openCount);
  }

  async readForTarget(
    project: string,
    targetUsername: string,
  ): Promise<{ exists: boolean; entries: QAEntry[]; path: string; targetUsername: string }> {
    const result = await this.readForUser(project, targetUsername);
    return { ...result, targetUsername };
  }

  async writeAnswer(
    project: string,
    targetUsername: string,
    entryId: string,
    answer: string,
  ): Promise<{ success: true; entry: QAEntry }> {
    if (!QAndAService.SAFE_ID.test(entryId)) {
      throw new Error('Invalid entry id');
    }
    const absPath = this.absPathFor(project, targetUsername);
    return this.withLock(absPath, async () => {
      const current = await this.readRaw(absPath);
      const idx = current.entries.findIndex((e) => e.id === entryId);
      if (idx === -1) {
        throw new NotFoundException(`Entry ${entryId} not found`);
      }
      const next: QAEntry = {
        ...current.entries[idx],
        answer: (answer || '').toString(),
        answeredAt: new Date().toISOString(),
      };
      current.entries[idx] = next;
      await this.writeRaw(absPath, current);
      return { success: true as const, entry: next };
    });
  }

  private makeId(): string {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return `qa-${t}-${r}`;
  }
}
