/**
 * Tiny frontmatter (YAML envelope) reader/writer used by the WikiService.
 *
 * The wiki skill uses `gray-matter` inside its own process; the backend only
 * needs to extract the YAML block, parse it, and access the body. We deliberately
 * never write pages from the backend directly — writes go through `wiki-add.ts`
 * via subprocess — so this module only needs a parser, not a serializer.
 *
 * The envelope:
 *   ---\n
 *   <yaml>\n
 *   ---\n
 *   <body>
 */

import * as yaml from 'js-yaml';

export interface PageFrontmatter {
  title?: string;
  slug?: string;
  status?: 'stub' | 'draft' | 'stable' | 'deleted';
  confidence?: 'high' | 'medium' | 'low';
  tags?: string[];
  mission_relevance?: number;
  sources?: Array<
    | { kind: 'conversation'; turn: string; note?: string }
    | { kind: 'file'; path: string; lines?: string }
  >;
  created?: string;
  last_updated?: string;
  supersedes?: string[];
  aliases?: string[];
  classification?: 'public' | 'private' | 'secret';
  provenance?: {
    sourceSessions?: string[];
    sourceEntries?: string[];
    createdBy?: 'agent' | 'ponderer' | 'user';
    createdAt?: string;
    updatedAt?: string;
    inferenceTag?: string;
  };
  [k: string]: unknown;
}

export interface ParsedPage {
  frontmatter: PageFrontmatter;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parsePage(raw: string): ParsedPage {
  const m = FENCE.exec(raw);
  if (!m) {
    return { frontmatter: {}, body: raw };
  }
  const data = yaml.load(m[1]);
  const frontmatter =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as PageFrontmatter)
      : {};
  return { frontmatter, body: m[2] ?? '' };
}

/** Extract internal wiki links from a body for the WikiPage.links field. */
export function extractLinks(body: string): string[] {
  const re = /\]\(((?:\.\.\/)?(?:topics|sources|queries)\/[a-z0-9-]+\.md)\)/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    // Normalise to slug form (strip path + .md)
    const path = m[1];
    const slug = path.split('/').pop()?.replace(/\.md$/, '');
    if (slug) out.add(slug);
  }
  return [...out];
}
