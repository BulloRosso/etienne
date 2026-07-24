import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeJoin } from '../common/path.util';
import { RagService } from '../rag/rag.service';
import { parseFrontmatter } from './frontmatter.util';
import { OkfImportOptions, OkfImportResult } from './okf.types';

/** Reserved OKF navigation files — imported, but never RAG-indexed. */
const NAVIGATION_FILES = new Set(['index.md', 'log.md']);

@Injectable()
export class OkfImportService {
  private readonly logger = new Logger(OkfImportService.name);
  private readonly config = new ClaudeConfig();

  /** Test seams — overridable in specs to avoid Nest wiring and ChromaDB. */
  workspaceRoot: string = this.config.hostRoot;
  indexFn: (project: string, projectRelPath: string) => Promise<void> = async (project, rel) => {
    await this.ragService.indexDocument(`project_${project}`, rel);
  };

  constructor(private readonly ragService: RagService) {}

  async import(
    project: string,
    zipBuffer: Buffer,
    opts: OkfImportOptions,
  ): Promise<OkfImportResult> {
    const failure = (errors: string[]): OkfImportResult => ({
      success: false,
      targetPath: '',
      conceptCount: 0,
      filesWritten: 0,
      indexed: 0,
      indexFailures: [],
      warnings: [],
      errors,
    });

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      return failure(['Not a valid zip archive.']);
    }

    // Explicit zip-slip guard: adm-zip 0.5.x has internal protections, but an
    // upfront reject is cheap and does not depend on library behavior.
    for (const entry of zip.getEntries()) {
      const name = entry.entryName;
      if (
        name.includes('\0') ||
        path.isAbsolute(name) ||
        /^[a-zA-Z]:/.test(name) ||
        name.split(/[\\/]/).includes('..')
      ) {
        return failure([`Unsafe path in archive: ${name}`]);
      }
    }

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'okf-import-'));
    try {
      zip.extractAllTo(tmpRoot, /* overwrite */ true);

      // Bundle root: a single wrapped top-level directory, or the flat tmp root.
      const topEntries = await fs.readdir(tmpRoot, { withFileTypes: true });
      const topDirs = topEntries.filter((e) => e.isDirectory());
      const wrapped = topDirs.length === 1 && topEntries.length === 1;
      const bundleRoot = wrapped ? path.join(tmpRoot, topDirs[0].name) : tmpRoot;
      const bundleName = wrapped ? topDirs[0].name : 'import';

      const warnings: string[] = [];
      const allFiles = await listFilesRecursive(bundleRoot);
      const mdFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.md'));

      if (mdFiles.length === 0) {
        return failure(['Not an OKF bundle: no markdown concept files found in the archive.']);
      }

      // Lenient validation — warn, never reject, on spec violations.
      for (const rel of mdFiles) {
        const parsed = parseFrontmatter(await fs.readFile(path.join(bundleRoot, rel), 'utf-8'));
        if (!parsed.hadFrontmatter) {
          warnings.push(`${rel}: no YAML frontmatter — imported as-is`);
        } else if (typeof parsed.frontmatter.type !== 'string' || !parsed.frontmatter.type) {
          warnings.push(`${rel}: missing required 'type' field in frontmatter`);
        }
      }
      const extraFiles = allFiles.length - mdFiles.length;
      if (extraFiles > 0) {
        warnings.push(`Bundle contains ${extraFiles} non-markdown file(s) — copied through unchanged`);
      }

      // Target folder: default okf/<bundle-name>, auto-suffixed on collision.
      const requested = (opts.targetPath ?? `okf/${bundleName}`)
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
      const { targetPath, targetAbs } = await this.resolveTarget(project, requested);

      try {
        await fs.copy(bundleRoot, targetAbs);
      } catch (err: any) {
        try {
          await fs.remove(targetAbs);
        } catch {
          // ignore rollback error
        }
        throw err;
      }

      // RAG indexing — per-file tolerance; the import itself already succeeded.
      let indexed = 0;
      const indexFailures: { path: string; message: string }[] = [];
      if (opts.indexRag) {
        const indexable = mdFiles.filter(
          (rel) => !NAVIGATION_FILES.has(path.posix.basename(rel.replace(/\\/g, '/'))),
        );
        for (const rel of indexable) {
          const projectRel = `${targetPath}/${rel.replace(/\\/g, '/')}`;
          try {
            await this.indexFn(project, projectRel);
            indexed++;
          } catch (err: any) {
            indexFailures.push({ path: projectRel, message: err.message });
          }
        }
        if (indexable.length > 0 && indexed === 0) {
          warnings.push(`RAG indexing unavailable: ${indexFailures[0]?.message ?? 'unknown error'}`);
        }
      }

      return {
        success: true,
        targetPath,
        conceptCount: mdFiles.length,
        filesWritten: allFiles.length,
        indexed,
        indexFailures,
        warnings,
      };
    } catch (err: any) {
      this.logger.error('Failed to import OKF bundle:', err);
      return failure([err.message]);
    } finally {
      try {
        await fs.remove(tmpRoot);
      } catch (err: any) {
        this.logger.warn(`Failed to clean up import tmp dir ${tmpRoot}: ${err.message}`);
      }
    }
  }

  /** Resolve the project-relative target folder, suffixing -2, -3, … if taken. */
  private async resolveTarget(
    project: string,
    requested: string,
  ): Promise<{ targetPath: string; targetAbs: string }> {
    let candidate = requested;
    for (let i = 2; ; i++) {
      const { target } = safeJoin(this.workspaceRoot, project, candidate);
      if (!(await fs.pathExists(target))) {
        return { targetPath: candidate, targetAbs: target };
      }
      candidate = `${requested}-${i}`;
    }
  }
}

async function listFilesRecursive(root: string, relDir = ''): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(path.join(root, relDir), { withFileTypes: true });
  for (const entry of entries) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(root, rel)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}
