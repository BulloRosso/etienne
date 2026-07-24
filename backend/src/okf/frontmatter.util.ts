/**
 * Frontmatter (YAML envelope) parse + serialize for OKF concept documents.
 *
 * Deliberately local to the okf module: the wiki's frontmatter helper
 * (src/wiki/frontmatter.ts) is parser-only and typed to wiki pages, while
 * OKF needs a serializer and must round-trip arbitrary producer fields.
 */

import * as yaml from 'js-yaml';

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
  /** True when a well-formed, parseable YAML envelope was found. */
  hadFrontmatter: boolean;
}

/**
 * Split a markdown document into frontmatter and body. Tolerant: a missing
 * or unparseable envelope yields `{ frontmatter: {}, body: raw }` so callers
 * never lose content on malformed input.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const m = FENCE.exec(raw);
  if (!m) {
    return { frontmatter: {}, body: raw, hadFrontmatter: false };
  }
  try {
    const data = yaml.load(m[1]);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return {
        frontmatter: data as Record<string, unknown>,
        body: m[2] ?? '',
        hadFrontmatter: true,
      };
    }
  } catch {
    // fall through — treat the whole document as body
  }
  return { frontmatter: {}, body: raw, hadFrontmatter: false };
}

/** Serialize frontmatter + body back into a fenced markdown document. */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yamlBlock = yaml.dump(frontmatter, { lineWidth: 120, noRefs: true });
  return `---\n${yamlBlock}---\n${body}`;
}
