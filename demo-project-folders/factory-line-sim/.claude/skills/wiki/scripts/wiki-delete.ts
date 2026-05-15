import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { readPage, writePage, nowIso, type PageFrontmatter } from "./lib/frontmatter.js";
import { resolveWiki, ensureWikiExists } from "./lib/paths.js";
import { parseArgs } from "./lib/argv.js";
import { emit, fail } from "./lib/log.js";

/**
 * Soft-delete a wiki page.
 *
 * Honours the skill's history-append-only and slug-immutability principles:
 * the page file is preserved on disk, its `status` is flipped to `deleted`, and
 * an entry is appended to `wiki/_meta/redirects.md` recording the tombstone.
 * Downstream consumers (Adaptive-Memory WikiService, wiki-index, wiki-search)
 * filter pages by `status !== 'deleted'` to exclude them from listings.
 *
 * Usage:
 *   tsx wiki-delete.ts --slug <slug> [--bucket topics|sources|queries] [--reason "..."]
 *
 * Output: JSON object with { ok, path, slug, bucket, redirectsEntry }.
 */

interface DeleteOptions {
  slug: string;
  bucket: "topics" | "sources" | "queries";
  reason?: string;
}

function readOptions(args: Record<string, string | boolean>): DeleteOptions {
  const slug = typeof args.slug === "string" ? args.slug : "";
  if (!slug) fail("--slug <slug> is required");

  const bucketRaw = typeof args.bucket === "string" ? args.bucket : "topics";
  if (bucketRaw !== "topics" && bucketRaw !== "sources" && bucketRaw !== "queries") {
    fail(`--bucket must be topics|sources|queries, got: ${bucketRaw}`);
  }
  const bucket = bucketRaw as "topics" | "sources" | "queries";

  const reason = typeof args.reason === "string" ? args.reason : undefined;
  return { slug, bucket, reason };
}

function pagePath(opts: DeleteOptions, p: ReturnType<typeof resolveWiki>): string {
  switch (opts.bucket) {
    case "topics": return join(p.topics, opts.slug + ".md");
    case "sources": return join(p.sources, opts.slug + ".md");
    case "queries": return join(p.queries, opts.slug + ".md");
  }
}

function appendRedirectEntry(redirectsPath: string, entry: string): void {
  const dir = dirname(redirectsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(redirectsPath)) {
    writeFileSync(
      redirectsPath,
      "# Redirects\n\nTombstones and slug migrations. Lines are append-only.\n\n",
      "utf8",
    );
  }
  appendFileSync(redirectsPath, entry + "\n", "utf8");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const opts = readOptions(args);
  const paths = resolveWiki();
  ensureWikiExists(paths);

  const target = pagePath(opts, paths);
  if (!existsSync(target)) {
    fail(`page not found: ${relative(paths.cwd, target)}`);
  }

  const prev = readPage(target);
  const prevFm = prev.data as Partial<PageFrontmatter>;

  if (prevFm.status === "deleted") {
    emit({
      ok: true,
      noop: true,
      reason: "already deleted",
      path: relative(paths.cwd, target),
      slug: opts.slug,
      bucket: opts.bucket,
    });
    return;
  }

  const now = nowIso();
  const newFm: Partial<PageFrontmatter> = {
    ...prevFm,
    status: "deleted",
    last_updated: now,
  };
  if (prevFm.provenance) {
    newFm.provenance = { ...prevFm.provenance, updatedAt: now };
  }
  writePage(target, newFm, prev.content);

  const entry = `- \`${opts.bucket}/${opts.slug}\` deleted at ${now}${opts.reason ? ` — ${opts.reason}` : ""}`;
  appendRedirectEntry(paths.redirects, entry);

  emit({
    ok: true,
    path: relative(paths.cwd, target),
    slug: opts.slug,
    bucket: opts.bucket,
    redirectsEntry: entry,
  });
}

main();
