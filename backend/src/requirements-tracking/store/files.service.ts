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
    /^(uploads|parsed|artifacts|response|exports|catalog|tracker|reports|captures|tmp|analysis)\//;

  /** The only project-root locations this service may write to (deliverables). */
  private static readonly PROJECT_WRITE_ALLOW = /^out\/analysis\//;

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

  // ---------------------------------------------------------------------------
  // Project-root access (tender/, servicecatalog/, analysis-template/, out/analysis/)
  // ---------------------------------------------------------------------------

  /** Resolve a project-relative path, refusing anything that escapes the project. */
  projectAbsolutePath(project: string, projectRelativePath: string): string {
    if (
      !projectRelativePath ||
      projectRelativePath.includes('..') ||
      projectRelativePath.includes('\\') ||
      path.isAbsolute(projectRelativePath)
    ) {
      throw new Error(`Invalid project path: ${projectRelativePath}`);
    }
    const resolved = path.resolve(path.join(this.projectDir(project), ...projectRelativePath.split('/')));
    if (!resolved.startsWith(path.resolve(this.projectDir(project)))) {
      throw new Error(`Path escapes the project: ${projectRelativePath}`);
    }
    return resolved;
  }

  async projectFileExists(project: string, projectRelativePath: string): Promise<boolean> {
    try {
      await fs.access(this.projectAbsolutePath(project, projectRelativePath));
      return true;
    } catch {
      return false;
    }
  }

  async readProjectText(project: string, projectRelativePath: string): Promise<string> {
    return fs.readFile(this.projectAbsolutePath(project, projectRelativePath), 'utf-8');
  }

  async readProjectBuffer(project: string, projectRelativePath: string): Promise<Buffer> {
    return fs.readFile(this.projectAbsolutePath(project, projectRelativePath));
  }

  /** Non-recursive file listing of a project folder (empty when the folder is missing). */
  async listProjectDir(project: string, projectRelativeDir: string): Promise<string[]> {
    try {
      const dir = this.projectAbsolutePath(project, projectRelativeDir.replace(/\/$/, ''));
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    } catch {
      return [];
    }
  }

  /** Atomic write into the project root — restricted to `out/analysis/` deliverables. */
  async writeProjectFile(
    project: string,
    projectRelativePath: string,
    content: Buffer | string,
  ): Promise<{ relativePath: string; sha256: string; byteCount: number }> {
    if (!TtFilesService.PROJECT_WRITE_ALLOW.test(projectRelativePath)) {
      throw new Error(`Refusing to write outside out/analysis/: ${projectRelativePath}`);
    }
    const absolute = this.projectAbsolutePath(project, projectRelativePath);
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
      relativePath: projectRelativePath,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      byteCount: buffer.length,
    };
  }

  /** sha256 of a project file (for idempotent re-runs). */
  async projectFileSha256(project: string, projectRelativePath: string): Promise<string> {
    const buffer = await this.readProjectBuffer(project, projectRelativePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
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
