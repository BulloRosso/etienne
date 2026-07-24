import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeJoin } from '../common/path.util';
import { RagService, BINARY_EXTENSIONS } from '../rag/rag.service';
import { TagsService } from '../tags/tags.service';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.util';
import { OkfExportOptions, OkfExportResult, OkfFrontmatter } from './okf.types';

/** Directories never included in a bundle (dot-prefixed names are also pruned). */
const EXCLUDED_DIRS = new Set([
  'node_modules', '__pycache__', 'dist', 'build', 'venv', '.venv',
]);

const TYPE_BY_EXTENSION: Record<string, string> = {
  '.md': 'Document', '.txt': 'Document', '.pdf': 'Document', '.doc': 'Document',
  '.docx': 'Document', '.docm': 'Document', '.odt': 'Document', '.rtf': 'Document',
  '.csv': 'Dataset', '.tsv': 'Dataset', '.xls': 'Dataset', '.xlsx': 'Dataset',
  '.xlsm': 'Dataset', '.ods': 'Dataset', '.json': 'Dataset', '.jsonl': 'Dataset',
  '.parquet': 'Dataset', '.yaml': 'Dataset', '.yml': 'Dataset', '.xml': 'Dataset',
  '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image', '.gif': 'Image',
  '.svg': 'Image', '.webp': 'Image', '.bmp': 'Image', '.tiff': 'Image',
  '.ppt': 'Presentation', '.pptx': 'Presentation', '.pptm': 'Presentation', '.odp': 'Presentation',
  '.ts': 'Code', '.tsx': 'Code', '.js': 'Code', '.jsx': 'Code', '.py': 'Code',
  '.java': 'Code', '.cs': 'Code', '.go': 'Code', '.rs': 'Code', '.rb': 'Code',
  '.php': 'Code', '.c': 'Code', '.cpp': 'Code', '.h': 'Code', '.hpp': 'Code',
  '.sh': 'Code', '.ps1': 'Code', '.sql': 'Code', '.html': 'Code', '.css': 'Code',
};

/** Non-markdown text formats whose content is embedded in a fenced block. */
const TEXT_EXTENSIONS = new Set(
  Object.keys(TYPE_BY_EXTENSION).filter(
    (ext) => TYPE_BY_EXTENSION[ext] === 'Code' || ['.txt', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.xml'].includes(ext),
  ),
);

const TEXT_EMBED_MAX_BYTES = 1024 * 1024;

interface StagedConcept {
  /** Bundle-relative posix path of the concept file. */
  relPath: string;
  title: string;
  type: string;
  fromWorkspaceIndex: boolean;
}

@Injectable()
export class OkfExportService {
  private readonly logger = new Logger(OkfExportService.name);
  private readonly config = new ClaudeConfig();

  /** Test seams — overridable in specs to avoid Nest wiring and liteparse. */
  workspaceRoot: string = this.config.hostRoot;
  extractor: (absolutePath: string) => Promise<string> = (p) =>
    this.ragService.extractContent(p);

  constructor(
    private readonly ragService: RagService,
    @Optional() private readonly tagsService?: TagsService,
  ) {}

  private get extractMaxBytes(): number {
    return Number(process.env.OKF_EXTRACT_MAX_MB ?? 20) * 1024 * 1024;
  }

  async export(project: string, opts: OkfExportOptions): Promise<OkfExportResult> {
    const scopePath = (opts.path ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const { target: scopeDir } = safeJoin(this.workspaceRoot, project, scopePath || '.');
    if (!(await fs.pathExists(scopeDir)) || !(await fs.stat(scopeDir)).isDirectory()) {
      throw new NotFoundException(`Folder '${scopePath || '/'}' not found in project '${project}'`);
    }

    const warnings: string[] = [];
    const extractText = opts.extractText !== false;
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'okf-export-'));
    const scopeLeaf = scopePath ? scopePath.split('/').pop() : '';
    const bundleName = scopeLeaf ? `${project}-${scopeLeaf}-okf` : `${project}-okf`;
    const stagingTop = path.join(tmpRoot, bundleName);

    try {
      await fs.ensureDir(stagingTop);

      const concepts: StagedConcept[] = [];
      const stagedNames = new Set<string>();
      const dirs = new Set<string>(['']);

      await this.walk(project, scopeDir, scopePath, '', stagingTop, extractText, concepts, stagedNames, dirs, warnings);

      this.generateIndexFiles(project, scopePath, stagingTop, concepts, dirs, warnings);

      const zip = new AdmZip();
      zip.addLocalFolder(stagingTop, bundleName);
      const buffer = zip.toBuffer();

      return {
        filename: `${bundleName}.zip`,
        buffer,
        warnings,
        conceptCount: concepts.length,
      };
    } finally {
      try {
        await fs.remove(tmpRoot);
      } catch (err: any) {
        this.logger.warn(`Failed to clean up tmp dir ${tmpRoot}: ${err.message}`);
      }
    }
  }

  // ── directory walk + concept staging ──────────────────────────────────

  private async walk(
    project: string,
    dirAbs: string,
    scopePath: string,
    relDir: string,
    stagingTop: string,
    extractText: boolean,
    concepts: StagedConcept[],
    stagedNames: Set<string>,
    dirs: Set<string>,
    warnings: string[],
  ): Promise<void> {
    const entries = (await fs.readdir(dirAbs, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(dirAbs, entry.name);

      if (entry.isSymbolicLink()) {
        warnings.push(`Skipped symlink: ${rel}`);
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;
        dirs.add(rel);
        await fs.ensureDir(path.join(stagingTop, rel));
        await this.walk(project, abs, scopePath, rel, stagingTop, extractText, concepts, stagedNames, dirs, warnings);
        continue;
      }
      if (!entry.isFile() || entry.name.startsWith('.')) continue;

      await this.stageConcept(project, abs, rel, scopePath, stagingTop, extractText, concepts, stagedNames, warnings);
    }
  }

  private async stageConcept(
    project: string,
    abs: string,
    rel: string,
    scopePath: string,
    stagingTop: string,
    extractText: boolean,
    concepts: StagedConcept[],
    stagedNames: Set<string>,
    warnings: string[],
  ): Promise<void> {
    const ext = path.extname(rel).toLowerCase();
    const isMarkdown = ext === '.md';
    const stat = await fs.stat(abs);
    const projectRelSource = scopePath ? `${scopePath}/${rel}` : rel;
    const tags = await this.lookupTags(project, projectRelSource);

    let conceptRel = isMarkdown ? rel : `${rel}.md`;
    if (stagedNames.has(conceptRel)) {
      const suffixed = conceptRel.replace(/\.md$/, '-1.md');
      warnings.push(`Concept name collision: ${conceptRel} → ${suffixed}`);
      conceptRel = suffixed;
    }
    stagedNames.add(conceptRel);

    const baseName = path.basename(rel, path.extname(rel));
    const derived: OkfFrontmatter = {
      type: TYPE_BY_EXTENSION[ext] ?? 'Document',
      title: baseName.replace(/[-_]+/g, ' '),
      timestamp: stat.mtime.toISOString(),
    };
    if (!isMarkdown) derived.resource = projectRelSource;
    if (tags.length > 0) derived.tags = tags;

    let frontmatter: Record<string, unknown>;
    let body: string;

    if (isMarkdown) {
      const parsed = parseFrontmatter(await fs.readFile(abs, 'utf-8'));
      // Existing keys always win; only fill in the missing OKF fields.
      frontmatter = { ...derived, ...parsed.frontmatter };
      body = parsed.body;
    } else if (BINARY_EXTENSIONS.has(ext) && extractText && stat.size <= this.extractMaxBytes) {
      frontmatter = derived;
      try {
        const text = await this.extractor(abs);
        body = `Extracted from \`${projectRelSource}\` (${formatSize(stat.size)}).\n\n## Extracted content\n\n${text}\n`;
      } catch (err: any) {
        warnings.push(`Text extraction failed for ${projectRelSource}: ${err.message}`);
        body = metadataOnlyBody(projectRelSource, stat.size);
      }
    } else if (BINARY_EXTENSIONS.has(ext) && extractText) {
      warnings.push(`Skipped text extraction for ${projectRelSource} (larger than ${formatSize(this.extractMaxBytes)})`);
      frontmatter = derived;
      body = metadataOnlyBody(projectRelSource, stat.size);
    } else if (TEXT_EXTENSIONS.has(ext) && stat.size <= TEXT_EMBED_MAX_BYTES) {
      frontmatter = derived;
      const raw = await fs.readFile(abs);
      const text = raw.toString('utf-8');
      if (text.includes('�')) {
        warnings.push(`Skipped content embedding for ${projectRelSource} (not valid UTF-8)`);
        body = metadataOnlyBody(projectRelSource, stat.size);
      } else {
        body = `Content of \`${projectRelSource}\` (${formatSize(stat.size)}):\n\n${fencedBlock(text, ext.slice(1))}\n`;
      }
    } else {
      if (TEXT_EXTENSIONS.has(ext)) {
        warnings.push(`Skipped content embedding for ${projectRelSource} (larger than ${formatSize(TEXT_EMBED_MAX_BYTES)})`);
      }
      frontmatter = derived;
      body = metadataOnlyBody(projectRelSource, stat.size);
    }

    await fs.writeFile(
      path.join(stagingTop, ...conceptRel.split('/')),
      serializeFrontmatter(frontmatter, body),
      'utf-8',
    );

    concepts.push({
      relPath: conceptRel,
      title: String(frontmatter.title ?? derived.title),
      type: String(frontmatter.type ?? derived.type),
      fromWorkspaceIndex: isMarkdown && path.basename(rel) === 'index.md',
    });
  }

  private async lookupTags(project: string, projectRelPath: string): Promise<string[]> {
    if (!this.tagsService) return [];
    try {
      return await this.tagsService.getFileTags(project, projectRelPath);
    } catch {
      return [];
    }
  }

  // ── index.md generation ───────────────────────────────────────────────

  private generateIndexFiles(
    project: string,
    scopePath: string,
    stagingTop: string,
    concepts: StagedConcept[],
    dirs: Set<string>,
    warnings: string[],
  ): void {
    const byDir = new Map<string, StagedConcept[]>();
    for (const c of concepts) {
      const dir = c.relPath.includes('/') ? c.relPath.slice(0, c.relPath.lastIndexOf('/')) : '';
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(c);
    }

    const now = new Date().toISOString();

    for (const dir of dirs) {
      const children = byDir.get(dir) ?? [];
      const existing = children.find((c) => path.posix.basename(c.relPath) === 'index.md');
      if (existing) {
        warnings.push(`Kept workspace index.md for '${dir || '/'}' — skipped generated navigation`);
        continue;
      }

      const subdirs = [...dirs]
        .filter((d) => d !== dir && path.posix.dirname(d) === (dir || '.'))
        .sort();
      const lines: string[] = [];

      if (dir === '') {
        lines.push(
          `OKF v0.1 bundle exported from claude-multitenant.`,
          '',
          `- **Project:** ${project}`,
          `- **Scope:** ${scopePath || 'whole project'}`,
          `- **Exported:** ${now}`,
          `- **Concepts:** ${concepts.length}`,
          '',
        );
      }
      lines.push('## Contents', '');
      for (const sub of subdirs) {
        const name = path.posix.basename(sub);
        lines.push(`- [${name}/](./${name}/index.md)`);
      }
      for (const child of children.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
        const name = path.posix.basename(child.relPath);
        lines.push(`- [${child.title}](./${name}) — ${child.type}`);
      }
      if (subdirs.length === 0 && children.length === 0) {
        lines.push('_(empty)_');
      }

      const frontmatter: OkfFrontmatter = {
        type: 'Document',
        title: dir === '' ? (scopePath ? `${project}/${scopePath}` : project) : path.posix.basename(dir),
        timestamp: now,
      };
      const target = path.join(stagingTop, ...(dir ? dir.split('/') : []), 'index.md');
      fs.writeFileSync(target, serializeFrontmatter(frontmatter, lines.join('\n') + '\n'), 'utf-8');
    }
  }
}

function metadataOnlyBody(projectRelSource: string, size: number): string {
  return `Binary resource \`${projectRelSource}\` (${formatSize(size)}). Content not embedded in this bundle.\n`;
}

function fencedBlock(text: string, lang: string): string {
  // Fence must be longer than any backtick run inside the content.
  const longestRun = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${lang}\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
