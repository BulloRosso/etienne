import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
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
  if (!existsSync(dir)) return acc;
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

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function relevance(p: PageSummary): number {
  return typeof p.fm.mission_relevance === "number" ? p.fm.mission_relevance : 0;
}

function lastUpdated(p: PageSummary): string {
  return String(p.fm.last_updated ?? "");
}

function readMissionExcerpt(missionPath: string): { title: string; excerpt: string } | null {
  if (!existsSync(missionPath)) return null;
  const raw = readFileSync(missionPath, "utf8").trim();
  if (!raw) return null;

  // Strip optional YAML frontmatter.
  let body = raw;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) body = body.slice(end + 4).trimStart();
  }

  const lines = body.split(/\r?\n/);
  let title = "";
  const paragraph: string[] = [];
  let inParagraph = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!title) {
      const m = /^#\s+(.+)$/.exec(trimmed);
      if (m) { title = m[1].trim(); continue; }
    }
    if (!inParagraph) {
      if (!trimmed) continue;
      if (trimmed.startsWith("#")) continue;
      inParagraph = true;
      paragraph.push(trimmed);
    } else {
      if (!trimmed) break;
      if (trimmed.startsWith("#")) break;
      paragraph.push(trimmed);
    }
  }
  const excerpt = paragraph.join(" ").trim();
  if (!title && !excerpt) return null;
  return { title, excerpt };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reportOrphans = args["report-orphans"] === true;
  const recentLimit = typeof args["recent-limit"] === "number" ? (args["recent-limit"] as number) : 5;
  const topLimit = typeof args["top-limit"] === "number" ? (args["top-limit"] as number) : 5;

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
        // Tombstones written by wiki-delete.ts are excluded from index + graph.
        if ((parsed.data as Partial<PageFrontmatter>).status === "deleted") continue;
        pages.push({
          path: toPosix(relative(paths.wikiRoot, file)),
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

  // Stub count for header stats.
  const stubCount = pages.filter(p => p.fm.status === "stub").length;
  const draftCount = pages.filter(p => p.fm.status === "draft").length;

  const mission = readMissionExcerpt(paths.mission);
  // Mission H1 conventions vary ("Mission", "Mission — Foo", "Foo Mission"). Strip
  // the leading "Mission" prefix so the wiki title reads as the project name, not
  // "Mission — Wiki".
  const rawTitle = mission?.title?.trim() ?? "";
  const stripped = rawTitle.replace(/^mission(\s*[—\-:–]\s*)?/i, "").trim();
  const wikiTitle = stripped ? `${stripped} — Wiki` : "Wiki";

  const formatEntry = (p: PageSummary): string => {
    const status = p.fm.status === "stub" ? " · _stub_" : p.fm.status === "draft" ? " · _draft_" : "";
    const conf = p.fm.confidence ? ` · ${p.fm.confidence}` : "";
    const rel = typeof p.fm.mission_relevance === "number" ? ` · rel ${p.fm.mission_relevance.toFixed(2)}` : "";
    const updated = p.fm.last_updated ? ` · ${String(p.fm.last_updated).slice(0, 10)}` : "";
    return `- [${p.fm.title ?? p.path}](./${p.path})${status}${conf}${rel}${updated}`;
  };

  const lines: string[] = [];
  lines.push(`# ${wikiTitle}`, "");
  lines.push(`_Auto-generated by \`wiki-index\`. Do not edit by hand — your changes will be overwritten on the next rebuild._`, "");

  if (mission?.excerpt) {
    lines.push("## Mission", "");
    lines.push(`> ${mission.excerpt}`, "");
    lines.push(`See [_meta/mission.md](./_meta/mission.md) for the full mission.`, "");
  } else {
    lines.push("## Mission", "");
    lines.push("_No mission file found at_ `_meta/mission.md`. _The wiki needs a mission before it can be useful — populate that file first._", "");
  }

  const buildTs = new Date().toISOString();
  lines.push("## At a glance", "");
  lines.push(`- **${pages.length}** pages across **${grouped.size}** categories`);
  lines.push(`- **${stubCount}** stub${stubCount === 1 ? "" : "s"} · **${draftCount}** draft${draftCount === 1 ? "" : "s"}`);
  const counts = buckets.map(([b]) => `**${pages.filter(p => p.bucket === b).length}** ${b}`).join(" · ");
  lines.push(`- ${counts}`);
  lines.push(`- Last build: \`${buildTs}\``);
  lines.push("");

  // Recently updated, across all buckets.
  const recent = [...pages]
    .filter(p => lastUpdated(p))
    .sort((a, b) => lastUpdated(b).localeCompare(lastUpdated(a)))
    .slice(0, recentLimit);
  if (recent.length > 0) {
    lines.push("## Recently updated", "");
    for (const p of recent) lines.push(formatEntry(p));
    lines.push("");
  }

  // Top by mission relevance (exclude stubs so we don't surface empty pages).
  const top = [...pages]
    .filter(p => p.fm.status !== "stub" && relevance(p) > 0)
    .sort((a, b) => {
      const dr = relevance(b) - relevance(a);
      if (dr !== 0) return dr;
      return lastUpdated(b).localeCompare(lastUpdated(a));
    })
    .slice(0, topLimit);
  if (top.length > 0) {
    lines.push("## Top topics by mission relevance", "");
    for (const p of top) lines.push(formatEntry(p));
    lines.push("");
  }

  // Meta navigation.
  lines.push("## Meta", "");
  lines.push("- [Mission](./_meta/mission.md)");
  lines.push("- [Taxonomy](./_meta/taxonomy.md)");
  lines.push("- [Changelog](./_meta/changelog.md)");
  lines.push("- [Link graph](./_meta/graph.md)");
  lines.push("- [Redirects](./_meta/redirects.md)");
  lines.push("");

  // Full category listing — the historical heart of the index.
  lines.push("## All pages by category", "");
  if (pages.length === 0) {
    lines.push("_No pages yet._", "");
  } else {
    for (const [tag, ps] of [...grouped.entries()].sort()) {
      lines.push(`### ${tag}`, "");
      ps.sort((a, b) => {
        const ra = relevance(a);
        const rb = relevance(b);
        if (rb !== ra) return rb - ra;
        return lastUpdated(b).localeCompare(lastUpdated(a));
      });
      for (const p of ps) lines.push(formatEntry(p));
      lines.push("");
    }
  }

  writeFileSync(paths.index, lines.join("\n"), "utf8");

  // graph.md
  const graphLines: string[] = ["# Link graph", "", `_Auto-generated. ${pages.length} nodes._`, ""];
  const inbound = new Map<string, Set<string>>();
  for (const p of pages) inbound.set(p.path, new Set());
  for (const p of pages) {
    for (const link of p.outgoing) {
      const normalized = toPosix(link.replace(/^\.\.\//, ""));
      if (inbound.has(normalized)) inbound.get(normalized)!.add(p.path);
    }
  }
  graphLines.push("## Edges", "");
  for (const p of pages) {
    if (p.outgoing.length === 0) continue;
    graphLines.push(`- ${p.path} → ${p.outgoing.map(o => toPosix(o.replace(/^\.\.\//, ""))).join(", ")}`);
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
    stubs: stubCount,
    drafts: draftCount,
    orphans: reportOrphans ? orphans : orphans.length,
    indexPath: toPosix(relative(paths.cwd, paths.index)),
    graphPath: toPosix(relative(paths.cwd, paths.graph)),
  });
}

main();
