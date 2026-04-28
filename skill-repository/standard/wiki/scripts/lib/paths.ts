import { resolve, join } from "node:path";
import { existsSync } from "node:fs";

export interface WikiPaths {
  cwd: string;
  wikiRoot: string;
  meta: string;
  topics: string;
  sources: string;
  queries: string;
  index: string;
  mission: string;
  taxonomy: string;
  changelog: string;
  graph: string;
  redirects: string;
}

export function resolveWiki(cwd: string = process.cwd()): WikiPaths {
  const wikiRoot = resolve(cwd, "wiki");
  return {
    cwd,
    wikiRoot,
    meta: join(wikiRoot, "_meta"),
    topics: join(wikiRoot, "topics"),
    sources: join(wikiRoot, "sources"),
    queries: join(wikiRoot, "queries"),
    index: join(wikiRoot, "index.md"),
    mission: join(wikiRoot, "_meta", "mission.md"),
    taxonomy: join(wikiRoot, "_meta", "taxonomy.md"),
    changelog: join(wikiRoot, "_meta", "changelog.md"),
    graph: join(wikiRoot, "_meta", "graph.md"),
    redirects: join(wikiRoot, "_meta", "redirects.md"),
  };
}

export function ensureWikiExists(p: WikiPaths): void {
  if (!existsSync(p.wikiRoot)) {
    throw new Error(`wiki/ not found at ${p.wikiRoot}. Bootstrap required.`);
  }
}
