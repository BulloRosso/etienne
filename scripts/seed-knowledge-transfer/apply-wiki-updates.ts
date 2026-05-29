/**
 * One-off: re-apply the WIKI_PAGES bodies from the fixture to the live
 * workspace's wiki/topics/*.md files. Keeps the existing YAML frontmatter
 * intact (so the wiki tooling's invariants — created date, provenance,
 * source-list, aliases — don't get re-stamped or lost) and only swaps
 * the markdown body that follows the closing `---`.
 *
 * Useful when you have edited the fixture bodies (e.g. added mermaid
 * diagrams + defect-image references) and don't want to wait for a full
 * re-seed (which would try to re-create the project from scratch).
 *
 * Run:
 *   cd c:\Data\GitHub\claude-multitenant
 *   npx tsx scripts/seed-knowledge-transfer/apply-wiki-updates.ts
 */
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { PROJECT_NAME } from './fixtures/mission';
import { WIKI_PAGES } from './fixtures/wiki-pages';
import { apiFetch, ApiError } from '../seed-requirements-hv/lib/api';
import { login } from '../seed-requirements-hv/lib/auth';

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
const PROJECT_ROOT = join(WORKSPACE_ROOT, PROJECT_NAME);

interface PageOnDisk {
  path: string;
  slug: string;
}

async function listWikiPages(): Promise<PageOnDisk[]> {
  const out: PageOnDisk[] = [];
  for (const bucket of ['topics', 'sources', 'queries'] as const) {
    const dir = join(PROJECT_ROOT, 'wiki', bucket);
    try {
      await stat(dir);
    } catch {
      continue;
    }
    const entries = await readdir(dir);
    for (const name of entries) {
      if (!name.endsWith('.md')) continue;
      out.push({
        path: join(dir, name),
        slug: name.replace(/\.md$/, ''),
      });
    }
  }
  return out;
}

function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { frontmatter: null, body: text };
  }
  // Find the line that is just "---" after the opening
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      const frontmatter = lines.slice(0, i + 1).join('\n');
      const body = lines.slice(i + 1).join('\n');
      return { frontmatter, body };
    }
  }
  return { frontmatter: null, body: text };
}

async function main() {
  const onDisk = await listWikiPages();
  if (onDisk.length === 0) {
    throw new Error(`No wiki pages found under ${PROJECT_ROOT}/wiki/. Did the seed ever run?`);
  }
  const bySlug = new Map(onDisk.map((p) => [p.slug, p]));

  let updated = 0;
  let missingOnDisk: string[] = [];
  for (const draft of WIKI_PAGES) {
    const target = bySlug.get(draft.slug);
    if (!target) {
      missingOnDisk.push(draft.slug);
      continue;
    }
    const current = await readFile(target.path, 'utf8');
    const { frontmatter } = splitFrontmatter(current);
    const newContent = frontmatter
      ? `${frontmatter}\n${draft.body}`
      : draft.body;
    if (current === newContent) continue;
    await writeFile(target.path, newContent, 'utf8');
    updated += 1;
    console.log(`  ✓ ${draft.slug}`);
  }

  console.log(`\nUpdated ${updated} of ${WIKI_PAGES.length} fixture pages.`);
  if (missingOnDisk.length) {
    console.log(
      `\nMissing on disk (not updated): ${missingOnDisk.join(', ')}`,
    );
  }

  // Re-index every updated wiki page into RAG so the new content (mermaid
  // diagrams' alt text + defect-image captions) shows up in citations and
  // search. Login is the standard seed-script login flow.
  if (process.env.SKIP_REINDEX === '1') {
    console.log('\nSKIP_REINDEX=1 — leaving RAG stale.');
    return;
  }
  console.log('\n▸ Re-indexing wiki pages into RAG…');
  const auth = await login();
  const ctx = { accessToken: auth.accessToken };
  let ok = 0;
  let failed = 0;
  for (const draft of WIKI_PAGES) {
    const target = bySlug.get(draft.slug);
    if (!target) continue;
    const bucket = target.path.includes('topics') ? 'topics' :
      target.path.includes('sources') ? 'sources' : 'queries';
    const documentPath = `wiki/${bucket}/${draft.slug}.md`;
    try {
      await apiFetch(ctx, `/api/workspace/${PROJECT_NAME}/rag/index-document`, {
        method: 'POST',
        body: JSON.stringify({ documentPath }),
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof ApiError ? `HTTP ${err.status}` : String(err);
      console.log(`  ✗ ${documentPath} (${msg})`);
    }
  }
  console.log(`\nRe-indexed ${ok}/${ok + failed} pages.`);
}

main().catch((err) => {
  console.error(`\n✗ failed: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
