import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { readPage } from "./lib/frontmatter.js";
import { resolveWiki, ensureWikiExists } from "./lib/paths.js";
import { parseArgs } from "./lib/argv.js";
import { emit, fail } from "./lib/log.js";

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","on","for","with","is","are","be","this","that",
  "we","our","your","you","i","it","its","as","by","from","at","but","not","will","want","would",
  "should","can","could","mission","goal","want","like","need","new",
]);

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    const st = statSync(f);
    if (st.isDirectory()) walk(f, acc);
    else if (e.endsWith(".md")) acc.push(f);
  }
  return acc;
}

function extractKeywords(text: string, top: number = 25): Array<{ term: string; n: number }> {
  const words = text.toLowerCase().split(/[^a-z0-9-]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .map(([term, n]) => ({ term, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, top);
}

function extractCapitalizedPhrases(text: string): string[] {
  const re = /\b([A-Z][a-z]+(?:[ -][A-Z][a-z]+){0,3})\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[1]);
  return [...out].sort();
}

function bootstrap(missionText: string): string {
  const kws = extractKeywords(missionText);
  const phrases = extractCapitalizedPhrases(missionText);
  const lines: string[] = [];
  lines.push("# Taxonomy proposal", "");
  lines.push("> Auto-proposed from `mission.md`. Review semantically, edit, then commit.", "");
  lines.push("## Suggested top-level categories (review and rename)", "");
  for (const k of kws.slice(0, 8)) lines.push(`- **${k.term}** _(mentioned ${k.n}×)_`);
  lines.push("", "## Suggested tag axes", "");
  lines.push("- `style:<value>`  — stylistic dimension");
  lines.push("- `material:<value>`  — material dimension");
  lines.push("- `decision`  — applied to confirmed decisions");
  lines.push("- `requirement`  — applied to fixed constraints");
  lines.push("- `option`  — applied to candidates under evaluation");
  lines.push("", "## Candidate stub topics (named in mission)", "");
  for (const p of phrases.slice(0, 12)) lines.push(`- ${p}`);
  lines.push("", "## Open questions", "", "- _Add unresolved trade-offs here as the wiki grows._", "");
  return lines.join("\n");
}

function diff(taxonomyText: string, allTags: Set<string>, allTitles: Set<string>): {
  declaredTags: string[];
  declaredTopics: string[];
  unusedDeclaredTags: string[];
  undeclaredUsedTags: string[];
  unusedDeclaredTopics: string[];
} {
  const declaredTags: string[] = [];
  const declaredTopics: string[] = [];
  const inAxes = /^- `([a-z][a-z0-9-]*(:<[a-z]+>)?)`/;
  const inTopics = /^## Candidate stub topics/i;
  let mode: "tags" | "topics" | "" = "";
  for (const line of taxonomyText.split("\n")) {
    if (/^## Suggested tag axes/i.test(line)) { mode = "tags"; continue; }
    if (inTopics.test(line)) { mode = "topics"; continue; }
    if (/^## /.test(line)) { mode = ""; continue; }
    if (mode === "tags") {
      const m = inAxes.exec(line);
      if (m) declaredTags.push(m[1].split(":")[0]);
    } else if (mode === "topics") {
      const m = /^- (.+)$/.exec(line.trim());
      if (m) declaredTopics.push(m[1]);
    }
  }
  const usedRoots = new Set([...allTags].map(t => t.split(":")[0]));
  return {
    declaredTags,
    declaredTopics,
    unusedDeclaredTags: declaredTags.filter(t => !usedRoots.has(t)),
    undeclaredUsedTags: [...usedRoots].filter(t => !declaredTags.includes(t)),
    unusedDeclaredTopics: declaredTopics.filter(t => !allTitles.has(t)),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const paths = resolveWiki();
  ensureWikiExists(paths);

  if (!existsSync(paths.mission)) fail("wiki/_meta/mission.md is missing", { hint: "host application must populate it" });
  const missionText = readFileSync(paths.mission, "utf8").trim();
  if (!missionText) fail("wiki/_meta/mission.md is empty", { hint: "host application must populate it" });

  if (args.bootstrap) {
    const proposal = bootstrap(missionText);
    const out = paths.taxonomy + ".proposal.md";
    writeFileSync(out, proposal, "utf8");
    emit({ ok: true, mode: "bootstrap", proposal: relative(paths.cwd, out), note: "Review and rename to taxonomy.md" });
    return;
  }

  if (args.diff) {
    if (!existsSync(paths.taxonomy)) fail("taxonomy.md not found; run with --bootstrap first");
    const tx = readFileSync(paths.taxonomy, "utf8");
    const tags = new Set<string>();
    const titles = new Set<string>();
    for (const file of [...walk(paths.topics), ...walk(paths.sources), ...walk(paths.queries)]) {
      try {
        const p = readPage(file);
        for (const t of (p.data.tags as string[] | undefined) ?? []) tags.add(t);
        if (p.data.title) titles.add(String(p.data.title));
      } catch { /* skip */ }
    }
    const result = diff(tx, tags, titles);
    emit({ ok: true, mode: "diff", ...result, totalTags: tags.size, totalTitles: titles.size });
    return;
  }

  fail("specify --bootstrap or --diff");
}

main();
