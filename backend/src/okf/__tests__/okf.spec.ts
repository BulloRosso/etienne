/**
 * Standalone spec for the OKF import/export slice. No test framework
 * dependency — uses Node's built-in `node:test` + `node:assert/strict`.
 *
 * Run with:
 *   cd backend
 *   npx tsx src/okf/__tests__/okf.spec.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import * as fs from 'fs-extra';

import { parseFrontmatter, serializeFrontmatter } from '../frontmatter.util';
import { OkfExportService } from '../okf-export.service';
import { OkfImportService } from '../okf-import.service';

// ── frontmatter.util ─────────────────────────────────────────────────────

test('frontmatter: parse/serialize round-trip preserves body byte-identically', () => {
  const body = '# Hello\n\nSome **content** with `code`.\n';
  const raw = serializeFrontmatter({ type: 'Document', title: 'Hello' }, body);
  const parsed = parseFrontmatter(raw);
  assert.equal(parsed.hadFrontmatter, true);
  assert.equal(parsed.frontmatter.type, 'Document');
  assert.equal(parsed.frontmatter.title, 'Hello');
  assert.equal(parsed.body, body);
});

test('frontmatter: missing envelope yields whole doc as body', () => {
  const parsed = parseFrontmatter('just some text');
  assert.equal(parsed.hadFrontmatter, false);
  assert.deepEqual(parsed.frontmatter, {});
  assert.equal(parsed.body, 'just some text');
});

test('frontmatter: malformed YAML is tolerated, content never lost', () => {
  const raw = '---\n{: not yaml [\n---\nbody text';
  const parsed = parseFrontmatter(raw);
  assert.equal(parsed.hadFrontmatter, false);
  assert.equal(parsed.body, raw);
});

// ── export ───────────────────────────────────────────────────────────────

async function makeWorkspace(): Promise<string> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'okf-spec-ws-'));
  const proj = path.join(ws, 'proj');
  await fs.ensureDir(path.join(proj, 'sub'));
  await fs.ensureDir(path.join(proj, '.claude'));
  await fs.ensureDir(path.join(proj, 'node_modules', 'pkg'));

  await fs.writeFile(path.join(proj, 'readme.md'), '# Readme\n\nHello.\n');
  await fs.writeFile(
    path.join(proj, 'notes.md'),
    '---\ntype: Note\ntitle: Custom Title\n---\nNote body.\n',
  );
  await fs.writeFile(path.join(proj, 'data.csv'), 'a,b\n1,2\n');
  await fs.writeFile(path.join(proj, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(path.join(proj, 'a.pdf'), Buffer.from('%PDF-fake'));
  await fs.writeFile(path.join(proj, 'a.pdf.md'), 'Pre-existing concept about a.pdf\n');
  await fs.writeFile(path.join(proj, 'sub', 'inner.txt'), 'inner content\n');
  await fs.writeFile(path.join(proj, 'sub', 'index.md'), '# Curated index\n');
  await fs.writeFile(path.join(proj, '.hidden.md'), 'should not appear\n');
  await fs.writeFile(path.join(proj, '.claude', 'CLAUDE.md'), 'internal\n');
  await fs.writeFile(path.join(proj, 'node_modules', 'pkg', 'x.js'), 'js\n');
  return ws;
}

function exporterFor(ws: string): OkfExportService {
  const svc = new OkfExportService(null as any, undefined);
  svc.workspaceRoot = ws;
  svc.extractor = async () => 'EXTRACTED PDF TEXT';
  return svc;
}

function unzipToMap(buffer: Buffer): Map<string, string> {
  const zip = new AdmZip(buffer);
  const map = new Map<string, string>();
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory) {
      map.set(entry.entryName.replace(/\\/g, '/'), entry.getData().toString('utf-8'));
    }
  }
  return map;
}

test('export: bundle structure, frontmatter, extraction, exclusions', async () => {
  const ws = await makeWorkspace();
  try {
    const result = await exporterFor(ws).export('proj', {});
    assert.equal(result.filename, 'proj-okf.zip');
    const files = unzipToMap(result.buffer);
    const names = [...files.keys()];

    // markdown kept, others suffixed with .md
    assert.ok(names.includes('proj-okf/readme.md'));
    assert.ok(names.includes('proj-okf/data.csv.md'));
    assert.ok(names.includes('proj-okf/image.png.md'));
    assert.ok(names.includes('proj-okf/sub/inner.txt.md'));

    // exclusions
    assert.ok(!names.some((n) => n.includes('.claude') || n.includes('node_modules') || n.includes('.hidden')));

    // plain md gets derived frontmatter, body preserved
    const readme = parseFrontmatter(files.get('proj-okf/readme.md')!);
    assert.equal(readme.frontmatter.type, 'Document');
    assert.equal(readme.frontmatter.title, 'readme');
    assert.equal(readme.body, '# Readme\n\nHello.\n');

    // existing frontmatter wins over derived values
    const notes = parseFrontmatter(files.get('proj-okf/notes.md')!);
    assert.equal(notes.frontmatter.type, 'Note');
    assert.equal(notes.frontmatter.title, 'Custom Title');

    // pdf extracted via seam
    const pdf = parseFrontmatter(files.get('proj-okf/a.pdf.md')!);
    assert.ok(pdf.body.includes('EXTRACTED PDF TEXT'));
    assert.equal(pdf.frontmatter.resource, 'a.pdf');

    // workspace file literally named a.pdf.md collided → suffixed
    assert.ok(names.includes('proj-okf/a.pdf-1.md'));
    assert.ok(result.warnings.some((w) => w.includes('collision')));

    // csv embedded as fenced dataset
    const csv = parseFrontmatter(files.get('proj-okf/data.csv.md')!);
    assert.equal(csv.frontmatter.type, 'Dataset');
    assert.ok(csv.body.includes('a,b'));

    // image is metadata-only
    const img = parseFrontmatter(files.get('proj-okf/image.png.md')!);
    assert.equal(img.frontmatter.type, 'Image');
    assert.ok(img.body.includes('not embedded'));

    // generated root index lists children; workspace sub/index.md wins verbatim
    const rootIndex = parseFrontmatter(files.get('proj-okf/index.md')!);
    assert.ok(rootIndex.body.includes('## Contents'));
    assert.ok(rootIndex.body.includes('(./sub/index.md)'));
    const subIndex = parseFrontmatter(files.get('proj-okf/sub/index.md')!);
    assert.equal(subIndex.body, '# Curated index\n');
    assert.ok(result.warnings.some((w) => w.includes("Kept workspace index.md")));

    assert.equal(result.conceptCount, 8);
  } finally {
    await fs.remove(ws);
  }
});

test('export: subfolder scope names bundle and resources correctly', async () => {
  const ws = await makeWorkspace();
  try {
    const result = await exporterFor(ws).export('proj', { path: 'sub' });
    assert.equal(result.filename, 'proj-sub-okf.zip');
    const files = unzipToMap(result.buffer);
    const inner = parseFrontmatter(files.get('proj-sub-okf/inner.txt.md')!);
    assert.equal(inner.frontmatter.resource, 'sub/inner.txt');
    assert.ok(!files.has('proj-sub-okf/readme.md'));
  } finally {
    await fs.remove(ws);
  }
});

test('export: extractText=false skips extraction', async () => {
  const ws = await makeWorkspace();
  try {
    const svc = exporterFor(ws);
    svc.extractor = async () => {
      throw new Error('extractor must not be called');
    };
    const result = await svc.export('proj', { extractText: false });
    const files = unzipToMap(result.buffer);
    const pdf = parseFrontmatter(files.get('proj-okf/a.pdf.md')!);
    assert.ok(pdf.body.includes('not embedded'));
  } finally {
    await fs.remove(ws);
  }
});

// ── import ───────────────────────────────────────────────────────────────

interface ImportEnv {
  ws: string;
  svc: OkfImportService;
  indexedPaths: string[];
}

async function makeImportEnv(): Promise<ImportEnv> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'okf-spec-imp-'));
  await fs.ensureDir(path.join(ws, 'proj2'));
  const svc = new OkfImportService(null as any);
  svc.workspaceRoot = ws;
  const indexedPaths: string[] = [];
  svc.indexFn = async (_project, rel) => {
    indexedPaths.push(rel);
  };
  return { ws, svc, indexedPaths };
}

function makeBundleZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile('bundle/x.md', Buffer.from('---\ntype: Document\ntitle: X\n---\nX body\n'));
  zip.addFile('bundle/index.md', Buffer.from('---\ntype: Document\n---\n- [X](./x.md)\n'));
  zip.addFile('bundle/asset.bin', Buffer.from([1, 2, 3]));
  return zip.toBuffer();
}

test('import: wrapped bundle lands in okf/<name>, navigation not indexed', async () => {
  const { ws, svc, indexedPaths } = await makeImportEnv();
  try {
    const result = await svc.import('proj2', makeBundleZip(), { indexRag: true });
    assert.equal(result.success, true);
    assert.equal(result.targetPath, 'okf/bundle');
    assert.equal(result.conceptCount, 2);
    assert.equal(result.filesWritten, 3);
    assert.equal(result.indexed, 1);
    assert.deepEqual(indexedPaths, ['okf/bundle/x.md']);
    assert.ok(await fs.pathExists(path.join(ws, 'proj2', 'okf', 'bundle', 'x.md')));
    assert.ok(result.warnings.some((w) => w.includes('non-markdown')));
  } finally {
    await fs.remove(ws);
  }
});

test('import: collision auto-suffixes -2', async () => {
  const { ws, svc } = await makeImportEnv();
  try {
    const first = await svc.import('proj2', makeBundleZip(), { indexRag: false });
    assert.equal(first.targetPath, 'okf/bundle');
    assert.equal(first.indexed, 0);
    const second = await svc.import('proj2', makeBundleZip(), { indexRag: false });
    assert.equal(second.targetPath, 'okf/bundle-2');
  } finally {
    await fs.remove(ws);
  }
});

test('import: flat bundle (no wrapper dir) is accepted', async () => {
  const { ws, svc } = await makeImportEnv();
  try {
    const zip = new AdmZip();
    zip.addFile('x.md', Buffer.from('---\ntype: Document\n---\nflat\n'));
    const result = await svc.import('proj2', zip.toBuffer(), { indexRag: false });
    assert.equal(result.success, true);
    assert.equal(result.targetPath, 'okf/import');
  } finally {
    await fs.remove(ws);
  }
});

test('import: missing type is a warning, not an error', async () => {
  const { ws, svc } = await makeImportEnv();
  try {
    const zip = new AdmZip();
    zip.addFile('y.md', Buffer.from('---\ntitle: No Type\n---\nbody\n'));
    const result = await svc.import('proj2', zip.toBuffer(), { indexRag: false });
    assert.equal(result.success, true);
    assert.ok(result.warnings.some((w) => w.includes("missing required 'type'")));
  } finally {
    await fs.remove(ws);
  }
});

test('import: zip with no markdown is rejected', async () => {
  const { ws, svc } = await makeImportEnv();
  try {
    const zip = new AdmZip();
    zip.addFile('a.txt', Buffer.from('text'));
    const result = await svc.import('proj2', zip.toBuffer(), { indexRag: false });
    assert.equal(result.success, false);
    assert.ok(result.errors![0].includes('no markdown'));
  } finally {
    await fs.remove(ws);
  }
});

test('import: zip-slip entry is rejected', async () => {
  const { ws, svc } = await makeImportEnv();
  try {
    const zip = new AdmZip();
    zip.addFile('evil.md', Buffer.from('---\ntype: Document\n---\nevil\n'));
    // adm-zip normalizes traversal on addFile, so forge the name post-hoc the
    // way a hostile producer would.
    zip.getEntries()[0].entryName = '../evil.md';
    const result = await svc.import('proj2', zip.toBuffer(), { indexRag: false });
    assert.equal(result.success, false);
    assert.ok(result.errors![0].includes('Unsafe path'));
  } finally {
    await fs.remove(ws);
  }
});

test('import: garbage buffer is rejected cleanly', async () => {
  const { ws, svc } = await makeImportEnv();
  try {
    const result = await svc.import('proj2', Buffer.from('not a zip'), { indexRag: false });
    assert.equal(result.success, false);
  } finally {
    await fs.remove(ws);
  }
});

// ── round trip ───────────────────────────────────────────────────────────

test('round trip: export → import preserves concept content', async () => {
  const ws = await makeWorkspace();
  try {
    const exported = await exporterFor(ws).export('proj', {});
    const { svc } = await (async () => {
      const svc = new OkfImportService(null as any);
      svc.workspaceRoot = ws;
      svc.indexFn = async () => {};
      return { svc };
    })();
    await fs.ensureDir(path.join(ws, 'proj2'));
    const result = await svc.import('proj2', exported.buffer, { indexRag: false });
    assert.equal(result.success, true);
    assert.equal(result.targetPath, 'okf/proj-okf');

    const original = parseFrontmatter(
      await fs.readFile(path.join(ws, 'proj2', 'okf', 'proj-okf', 'readme.md'), 'utf-8'),
    );
    assert.equal(original.body, '# Readme\n\nHello.\n');
    assert.equal(original.frontmatter.type, 'Document');
  } finally {
    await fs.remove(ws);
  }
});
