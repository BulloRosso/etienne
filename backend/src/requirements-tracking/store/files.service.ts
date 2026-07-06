import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';

/**
 * Content store on the workspace filesystem (spec §11.2 mapped onto the project dir):
 *
 *   workspace/<project>/requirements-tracking/
 *     uploads/    parsed/    artifacts/    response/    exports/    catalog/    tracker/
 *     reports/    captures/  tmp/
 *
 * Rules: POSIX-style relative paths validated against an allowlist, no '..';
 * files immutable once referenced from the graph (new content → new path);
 * write-temp-then-rename with fsync so the graph is only written after the
 * file is durable (spec §11.6 consistency order).
 */
@Injectable()
export class TtFilesService {
  private readonly logger = new Logger(TtFilesService.name);
  private readonly workspaceDir = path.join(process.cwd(), '..', 'workspace');

  private static readonly PATH_ALLOW =
    /^(uploads|parsed|artifacts|response|exports|catalog|tracker|reports|captures|tmp)\//;

  rootDir(project: string): string {
    return path.join(this.workspaceDir, project, 'requirements-tracking');
  }

  projectDir(project: string): string {
    return path.join(this.workspaceDir, project);
  }

  validateRelativePath(relativePath: string): void {
    if (
      !TtFilesService.PATH_ALLOW.test(relativePath) ||
      relativePath.includes('..') ||
      relativePath.includes('\\') ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error(`Invalid requirements-tracking path: ${relativePath}`);
    }
  }

  absolutePath(project: string, relativePath: string): string {
    this.validateRelativePath(relativePath);
    return path.join(this.rootDir(project), ...relativePath.split('/'));
  }

  async exists(project: string, relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.absolutePath(project, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atomic durable write: temp file in the same directory → fsync → rename.
   * Returns sha256 and size for the graph's file metadata.
   */
  async writeFile(
    project: string,
    relativePath: string,
    content: Buffer | string,
  ): Promise<{ relativePath: string; sha256: string; byteCount: number }> {
    const absolute = this.absolutePath(project, relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });

    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const tempPath = `${absolute}.tmp-${crypto.randomBytes(4).toString('hex')}`;

    const handle = await fs.open(tempPath, 'w');
    try {
      await handle.writeFile(buffer);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, absolute);

    return {
      relativePath,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      byteCount: buffer.length,
    };
  }

  async readText(project: string, relativePath: string): Promise<string> {
    return fs.readFile(this.absolutePath(project, relativePath), 'utf-8');
  }

  async readBuffer(project: string, relativePath: string): Promise<Buffer> {
    return fs.readFile(this.absolutePath(project, relativePath));
  }

  async readJson<T>(project: string, relativePath: string): Promise<T> {
    return JSON.parse(await this.readText(project, relativePath)) as T;
  }

  async writeJson(
    project: string,
    relativePath: string,
    value: any,
  ): Promise<{ relativePath: string; sha256: string; byteCount: number }> {
    return this.writeFile(project, relativePath, JSON.stringify(value, null, 2));
  }

  async appendLine(project: string, relativePath: string, line: string): Promise<void> {
    const absolute = this.absolutePath(project, relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.appendFile(absolute, line.endsWith('\n') ? line : `${line}\n`, 'utf-8');
  }

  async readLines(project: string, relativePath: string): Promise<string[]> {
    try {
      const content = await this.readText(project, relativePath);
      return content.split('\n').filter((line) => line.trim().length > 0);
    } catch {
      return [];
    }
  }

  async listDir(project: string, relativeDir: string): Promise<string[]> {
    try {
      return await fs.readdir(this.absolutePath(project, `${relativeDir.replace(/\/$/, '')}/`));
    } catch {
      return [];
    }
  }

  /** Copy a file from anywhere inside the project dir into the requirements-tracking store. */
  async importProjectFile(
    project: string,
    projectRelativeSource: string,
    targetRelativePath: string,
  ): Promise<{ relativePath: string; sha256: string; byteCount: number }> {
    const source = path.join(this.projectDir(project), ...projectRelativeSource.split('/'));
    const resolved = path.resolve(source);
    if (!resolved.startsWith(path.resolve(this.projectDir(project)))) {
      throw new Error(`Source path escapes the project: ${projectRelativeSource}`);
    }
    const buffer = await fs.readFile(resolved);
    return this.writeFile(project, targetRelativePath, buffer);
  }

  /** Remove tmp/ staging files older than the grace period (default 24 h). */
  async sweepTmp(project: string, maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
    const tmpDir = path.join(this.rootDir(project), 'tmp');
    if (!fsSync.existsSync(tmpDir)) return 0;
    let removed = 0;
    const now = Date.now();
    for (const entry of await fs.readdir(tmpDir)) {
      const filePath = path.join(tmpDir, entry);
      try {
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.rm(filePath, { recursive: true, force: true });
          removed++;
        }
      } catch {
        // ignore races
      }
    }
    if (removed > 0) this.logger.log(`Swept ${removed} stale tmp entries in ${project}`);
    return removed;
  }
}
