import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readPage } from "./lib/frontmatter.js";
import { resolveWiki, ensureWikiExists } from "./lib/paths.js";
import { parseArgs } from "./lib/argv.js";
import { emit, fail } from "./lib/log.js";

interface SearchHit {
  path: string;
  title: string;
  slug: string;
  status: string;
  confidence: string;
  tags: string[];
  score: number;
  reasons: string[];
  snippet: string;
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

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function snippet(body: string, terms: string[]): string {
  const lower = body.toLowerCase();
  let best = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (best === -1 || i < best)) best = i;
  }
  const start = Math.max(0, best === -1 ? 0 : best - 60);
  return body.slice(start, start + 220).replace(/\s+/g, " ").trim();
}

function score(text: string, terms: string[]): { score: number; hits: number } {
  const lower = text.toLowerCase();
  let total = 0, hits = 0;
  for (const t of terms) {
    const matches = lower.split(t).length - 1;
    if (matches > 0) { hits++; total += matches; }
  }
  return { score: total + hits * 2, hits };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const query = typeof args.query === "string" ? args.query : "";
  const limit = parseInt(typeof args.limit === "string" ? args.limit : "10", 10);
  if (!query) fail("--query is required");

  const paths = resolveWiki();
  ensureWikiExists(paths);
  const terms = tokenize(query);
  if (terms.length === 0) fail("query produced no usable terms", { query });

  const files = [
    ...walk(paths.topics),
    ...walk(paths.sources),
    ...walk(paths.queries),
  ];

  const hits: SearchHit[] = [];
  for (const file of files) {
    let parsed;
    try { parsed = readPage(file); } catch { continue; }
    const fm = parsed.data;
    const title = String(fm.title ?? "");
    const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
    const aliases = Array.isArray(fm.aliases) ? fm.aliases.map(String) : [];
    const reasons: string[] = [];

    const titleScore = score(title, terms);
    const tagScore = score(tags.join(" "), terms);
    const aliasScore = score(aliases.join(" "), terms);
    const bodyScore = score(parsed.content, terms);

    let total = titleScore.score * 5 + tagScore.score * 3 + aliasScore.score * 4 + bodyScore.score;
    if (titleScore.hits > 0) reasons.push("title");
    if (tagScore.hits > 0) reasons.push("tags");
    if (aliasScore.hits > 0) reasons.push("aliases");
    if (bodyScore.hits > 0) reasons.push("body");
    if (typeof fm.mission_relevance === "number") total += fm.mission_relevance * 2;

    if (total <= 0) continue;
    hits.push({
      path: relative(paths.cwd, file),
      title,
      slug: String(fm.slug ?? ""),
      status: String(fm.status ?? ""),
      confidence: String(fm.confidence ?? ""),
      tags,
      score: Number(total.toFixed(2)),
      reasons,
      snippet: snippet(parsed.content, terms),
    });
  }

  hits.sort((a, b) => b.score - a.score);
  emit({ ok: true, query, count: hits.length, hits: hits.slice(0, limit) });
}

main();
