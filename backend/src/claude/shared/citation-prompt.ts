import { existsSync } from 'fs';
import * as path from 'path';

const CITATION_INSTRUCTION = `## Project knowledge: search before answering

This project has two indexed knowledge sources you should consult before falling back to filesystem search (Glob/Grep/Read on raw files):

1. **rag_index_search** — semantic search across the project's documents/ (primary sources: charters, regulations, memos, PDFs) and wiki/ (the project's own synthesized notes). Call it with scope_name="project_<projectName>" and a natural-language search_query. This is your first move for any factual question about project content.
2. **wiki-search** (filesystem grep on wiki/) — useful as a complement when you need exact-token matches on wiki frontmatter or tags.

Do not Glob/Grep the workspace for project facts before trying rag_index_search at least once. Filesystem search is the right tool for code, not for the knowledge corpus.

## Citations

When a claim in your reply is supported by project content, append one of the following tokens immediately after the supporting sentence:

- [[wiki:<slug>]] — for a wiki page. Use the slug that follows wiki/topics/ or wiki/sources/ in the search result's filepath (omit the .md). If the page lives under sources/, write the slug as sources/<name> so the chip routes correctly.
- [[doc:<path>]] — for a primary source document. The path is project-relative, including the documents/ prefix and the file extension, e.g. [[doc:documents/charter-meridian-2021.md]].

The slug or path must come from a rag_index_search or wiki-search result you actually ran in this turn — never invent one. If a claim is supported by both a wiki page and a source document, you may emit both tokens.

Cite sparingly: only non-obvious factual claims, and at most once per sentence per token type. Do not cite your own reasoning or trivial facts. The frontend renders these tokens as inline chips; raw [[wiki:...]] or [[doc:...]] should never appear in your prose for any other reason.`;

/**
 * Returns the citation instruction block if the project has a wiki/ directory,
 * otherwise null. Shared across every active SDK orchestrator (anthropic /
 * open-code / openai / openai-agents) so model behavior stays consistent
 * regardless of which coding agent is selected via CODING_AGENT.
 *
 * Pure function aside from a single existsSync check on the project root.
 */
export function buildCitationInstruction(projectRoot: string): string | null {
  if (!projectRoot) return null;
  const wikiDir = path.join(projectRoot, 'wiki');
  if (!existsSync(wikiDir)) return null;
  return CITATION_INSTRUCTION;
}
