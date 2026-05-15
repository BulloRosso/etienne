import matter from "gray-matter";
import { readFileSync, writeFileSync } from "node:fs";

export interface PageFrontmatter {
  title: string;
  slug: string;
  // `deleted` is the soft-tombstone state written by wiki-delete.ts. Excluded
  // from index.md regeneration; redirects entry retains the slug history.
  status: "stub" | "draft" | "stable" | "deleted";
  confidence: "high" | "medium" | "low";
  tags: string[];
  mission_relevance: number;
  sources: SourceEntry[];
  created: string;
  last_updated: string;
  supersedes: string[];
  aliases: string[];
  // Adaptive-Memory extensions. Optional; pages without these keys default to
  // classification='private' and a synthesised Provenance at the service boundary.
  classification?: "public" | "private" | "secret";
  provenance?: Provenance;
}

export interface Provenance {
  sourceSessions: string[];
  sourceEntries: string[];
  createdBy: "agent" | "ponderer" | "user";
  createdAt: string;
  updatedAt: string;
  inferenceTag?: string;
}

export type SourceEntry =
  | { kind: "conversation"; turn: string; note?: string }
  | { kind: "file"; path: string; lines?: string };

export interface ParsedPage {
  data: Partial<PageFrontmatter> & Record<string, unknown>;
  content: string;
  raw: string;
}

export function readPage(path: string): ParsedPage {
  const raw = readFileSync(path, "utf8");
  const parsed = matter(raw);
  return { data: parsed.data as Partial<PageFrontmatter>, content: parsed.content, raw };
}

export function writePage(path: string, fm: Partial<PageFrontmatter>, body: string): void {
  const stringified = matter.stringify(body.endsWith("\n") ? body : body + "\n", fm);
  writeFileSync(path, stringified, "utf8");
}

export function nowIso(): string {
  return new Date().toISOString();
}
