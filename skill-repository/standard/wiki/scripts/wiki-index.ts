import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readPage, type PageFrontmatter } from "./lib/frontmatter.js";
import { resolveWiki, ensureWikiExists } from "./lib/paths.js";
import { parseArgs } from "./lib/argv.js";
import { emit } from "./lib/log.js";

interface PageSummary {
  path: string;
  bucket: string;
  fm: Partial<PageFrontmatter>;
  outgoing: string[];
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (entry.endsWith(".md")) acc.push(full);
  }
  return acc;
}

function extractLinks(body: string): string[] {
  const re = /\]\(((?:\.\.\/)?(?:topics|sources|queries)\/[a-z0-9-]+\.md)\)/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.add(m[1]);
  return [...out];
}

function primaryTag(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return "uncategorized";
  const plain = tags.find(t => !t.includes(":"));
  return plain ?? tags[0];
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reportOrphans = args["report-orphans"] === true;

  const paths = resolveWiki();
  ensureWikiExists(paths);

  const buckets: Array<["topics" | "sources" | "queries", string]> = [
    ["topics", paths.topics],
    ["sources", paths.sources],
    ["queries", paths.queries],
  ];

  const pages: PageSummary[] = [];
  for (const [bucket, dir] of buckets) {
    for (const file of walk(dir)) {
      try {
        const parsed = readPage(file);
        pages.push({
          path: relative(paths.wikiRoot, file),
          bucket,
          fm: parsed.data,
          outgoing: extractLinks(parsed.content),
        });
      } catch { /* skip unparseable */ }
    }
  }

  const grouped = new Map<string, PageSummary[]>();
  for (const p of pages) {
    const key = primaryTag(p.fm.tags as string[] | undefined);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  const lines: string[] = [];
  lines.push("# Wiki index", "");
  lines.push(`_Auto-generated. ${pages.length} pages. Last build: ${new Date().toISOString()}._`, "");
  for (const [tag, ps] of [...grouped.entries()].sort()) {
    lines.push(`## ${tag}`, "");
    ps.sort((a, b) => {
      const ra = (a.fm.mission_relevance as number | undefined) ?? 0;
      const rb = (b.fm.mission_relevance as number | undefined) ?? 0;
      if (rb !== ra) return rb - ra;
      const la = String(a.fm.last_updated ?? "");
      const lb = String(b.fm.last_updated ?? "");
      return lb.localeCompare(la);
    });
    for (const p of ps) {
      const status = p.fm.status === "stub" ? " · _stub_" : p.fm.status === "draft" ? " · _draft_" : "";
      const conf = p.fm.confidence ? ` · ${p.fm.confidence}` : "";
      const rel = typeof p.fm.mission_relevance === "number" ? ` · rel ${p.fm.mission_relevance.toFixed(2)}` : "";
      const updated = p.fm.last_updated ? ` · ${String(p.fm.last_updated).slice(0, 10)}` : "";
      lines.push(`- [${p.fm.title ?? p.path}](./${p.path})${status}${conf}${rel}${updated}`);
    }
    lines.push("");
  }
  writeFileSync(paths.index, lines.join("\n"), "utf8");

  // graph.md
  const graphLines: string[] = ["# Link graph", "", `_Auto-generated. ${pages.length} nodes._`, ""];
  const inbound = new Map<string, Set<string>>();
  for (const p of pages) inbound.set(p.path, new Set());
  for (const p of pages) {
    for (const link of p.outgoing) {
      const normalized = link.replace(/^\.\.\//, "");
      if (inbound.has(normalized)) inbound.get(normalized)!.add(p.path);
    }
  }
  graphLines.push("## Edges", "");
  for (const p of pages) {
    if (p.outgoing.length === 0) continue;
    graphLines.push(`- ${p.path} → ${p.outgoing.map(o => o.replace(/^\.\.\//, "")).join(", ")}`);
  }
  graphLines.push("", "## Orphans (no inbound links)", "");
  const orphans: string[] = [];
  for (const [path, ins] of inbound.entries()) {
    if (ins.size === 0) {
      graphLines.push(`- ${path}`);
      orphans.push(path);
    }
  }
  writeFileSync(paths.graph, graphLines.join("\n"), "utf8");

  emit({
    ok: true,
    pages: pages.length,
    categories: grouped.size,
    orphans: reportOrphans ? orphans : orphans.length,
    indexPath: relative(paths.cwd, paths.index),
    graphPath: relative(paths.cwd, paths.graph),
  });
}

main();
