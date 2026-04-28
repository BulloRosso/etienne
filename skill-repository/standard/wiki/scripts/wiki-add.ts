import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { readPage, writePage, nowIso, type PageFrontmatter, type SourceEntry } from "./lib/frontmatter.js";
import { resolveWiki, ensureWikiExists } from "./lib/paths.js";
import { parseArgs } from "./lib/argv.js";
import { slugify } from "./lib/slug.js";
import { emit, fail } from "./lib/log.js";

interface AddInput {
  title: string;
  slug?: string;
  bucket?: "topics" | "sources" | "queries";
  status?: PageFrontmatter["status"];
  confidence?: PageFrontmatter["confidence"];
  tags?: string[];
  mission_relevance?: number;
  sources: SourceEntry[];
  body: string;
  mode: "create" | "update";
  appendHistory?: boolean;
  supersedes?: string[];
  aliases?: string[];
}

function readInput(args: Record<string, string | boolean>): AddInput {
  const inputPath = typeof args.input === "string" ? args.input : "";
  if (!inputPath) fail("--input <file.json> is required");
  const raw = readFileSync(inputPath as string, "utf8");
  const parsed = JSON.parse(raw) as AddInput;
  if (!parsed.title || !parsed.body || !parsed.sources?.length) {
    fail("input must include title, body, and at least one sources entry");
  }
  return parsed;
}

function pagePath(bucket: string, slug: string, p: ReturnType<typeof resolveWiki>): string {
  if (bucket === "topics") return join(p.topics, slug + ".md");
  if (bucket === "sources") return join(p.sources, slug + ".md");
  if (bucket === "queries") return join(p.queries, slug + ".md");
  throw new Error(`unknown bucket ${bucket}`);
}

function ensureDir(d: string): void { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function extractInternalLinks(body: string): string[] {
  const re = /\]\(((?:\.\.\/)?(?:topics|sources|queries)\/[a-z0-9-]+\.md)\)/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.add(m[1]);
  return [...out];
}

function splitHistory(body: string): { main: string; history: string; backlinks: string } {
  const parts = body.split(/\n## History\n/);
  const head = parts[0] ?? "";
  const rest = parts.slice(1).join("\n## History\n");
  const blParts = head.split(/\n## Backlinks\n/);
  const main = blParts[0] ?? "";
  const backlinks = blParts.slice(1).join("\n## Backlinks\n");
  return { main: main.trimEnd(), history: rest.trim(), backlinks: backlinks.trim() };
}

function compose(main: string, history: string, backlinks: string): string {
  const segments = [main.trim()];
  if (history.trim()) segments.push("## History\n\n" + history.trim());
  segments.push("## Backlinks\n\n" + (backlinks.trim() || "_none yet_"));
  return segments.join("\n\n") + "\n";
}

function addBacklinkLine(existing: string, newEntry: string): string {
  const lines = existing.split("\n").filter(l => l.trim() && l.trim() !== "_none yet_");
  if (!lines.includes(newEntry)) lines.push(newEntry);
  lines.sort();
  return lines.join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const input = readInput(args);
  const paths = resolveWiki();
  ensureWikiExists(paths);

  const bucket = input.bucket ?? "topics";
  const slug = input.slug ?? slugify(input.title);
  const target = pagePath(bucket, slug, paths);
  ensureDir(dirname(target));
  const now = nowIso();

  let fm: PageFrontmatter;
  let main_ = input.body.trim();
  let history = "";
  let backlinks = "";
  const exists = existsSync(target);

  if (exists && input.mode === "create") {
    fail(`page already exists: ${relative(paths.cwd, target)}`, { hint: "use mode=update" });
  }
  if (!exists && input.mode === "update") {
    fail(`page does not exist: ${relative(paths.cwd, target)}`, { hint: "use mode=create" });
  }

  if (exists) {
    const prev = readPage(target);
    const split = splitHistory(prev.content);
    const prevFm = prev.data as Partial<PageFrontmatter>;

    fm = {
      title: input.title,
      slug,
      status: input.status ?? prevFm.status ?? "draft",
      confidence: input.confidence ?? prevFm.confidence ?? "medium",
      tags: Array.from(new Set([...(prevFm.tags ?? []), ...(input.tags ?? [])])),
      mission_relevance: input.mission_relevance ?? prevFm.mission_relevance ?? 0.5,
      sources: [...(prevFm.sources ?? []), ...input.sources],
      created: prevFm.created ?? now,
      last_updated: now,
      supersedes: Array.from(new Set([...(prevFm.supersedes ?? []), ...(input.supersedes ?? [])])),
      aliases: Array.from(new Set([
        ...(prevFm.aliases ?? []),
        ...(input.aliases ?? []),
        ...(prevFm.title && prevFm.title !== input.title ? [String(prevFm.title)] : []),
      ])),
    };

    if (input.appendHistory && split.main.trim() && split.main.trim() !== input.body.trim()) {
      const stamp = `### ${now} (superseded)\n\n${split.main.trim()}`;
      history = (split.history ? split.history + "\n\n" : "") + stamp;
    } else {
      history = split.history;
    }
    backlinks = split.backlinks;
    main_ = input.body.trim();
  } else {
    fm = {
      title: input.title,
      slug,
      status: input.status ?? "draft",
      confidence: input.confidence ?? "medium",
      tags: input.tags ?? [],
      mission_relevance: input.mission_relevance ?? 0.5,
      sources: input.sources,
      created: now,
      last_updated: now,
      supersedes: input.supersedes ?? [],
      aliases: input.aliases ?? [],
    };
  }

  writePage(target, fm, compose(main_, history, backlinks));

  // Auto-create stubs for outbound internal links that don't exist yet.
  const stubsCreated: string[] = [];
  const links = extractInternalLinks(input.body);
  for (const link of links) {
    const linkAbs = join(dirname(target), link);
    if (existsSync(linkAbs)) continue;
    ensureDir(dirname(linkAbs));
    const stubSlug = basename(linkAbs, ".md");
    const stubFm: PageFrontmatter = {
      title: stubSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      slug: stubSlug,
      status: "stub",
      confidence: "low",
      tags: ["stub"],
      mission_relevance: fm.mission_relevance,
      sources: [{ kind: "conversation", turn: now, note: `auto-created from ${slug}` }],
      created: now,
      last_updated: now,
      supersedes: [],
      aliases: [],
    };
    const stubBody = `# ${stubFm.title}\n\n> **Stub** — referenced by [${fm.title}](../${bucket}/${slug}.md) but not yet researched.\n> TODO: gather information about ${stubFm.title}.\n`;
    writePage(linkAbs, stubFm, compose(stubBody, "", ""));
    stubsCreated.push(relative(paths.cwd, linkAbs));
  }

  // Update backlinks on every page we link to.
  const backlinksUpdated: string[] = [];
  const allLinks = [...links, ...stubsCreated.map(s => "../" + s.replace(/^wiki\//, ""))];
  for (const link of new Set(allLinks)) {
    const linkAbs = join(dirname(target), link);
    if (!existsSync(linkAbs)) continue;
    const target2 = readPage(linkAbs);
    const split2 = splitHistory(target2.content);
    const entry = `- [${fm.title}](../${bucket}/${slug}.md)`;
    const newBacklinks = addBacklinkLine(split2.backlinks, entry);
    writePage(
      linkAbs,
      { ...(target2.data as Partial<PageFrontmatter>), last_updated: now },
      compose(split2.main, split2.history, newBacklinks),
    );
    backlinksUpdated.push(relative(paths.cwd, linkAbs));
  }

  emit({
    ok: true,
    mode: input.mode,
    path: relative(paths.cwd, target),
    slug,
    bucket,
    stubsCreated,
    backlinksUpdated,
  });
}

main();
