import { readFileSync, statSync, existsSync } from "node:fs";
import { extname, relative, basename } from "node:path";
import { resolveWiki } from "./lib/paths.js";
import { parseArgs } from "./lib/argv.js";
import { emit, fail } from "./lib/log.js";

interface Chunk {
  kind: "heading" | "doc-comment" | "bullet-list" | "paragraph";
  startLine: number;
  endLine: number;
  text: string;
  hint?: string;
}

function extractMarkdown(lines: string[]): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      out.push({ kind: "heading", startLine: i + 1, endLine: i + 1, text: heading[2].trim(), hint: `h${heading[1].length}` });
      i++; continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      const start = i;
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*+]\s+/, "")); i++; }
      out.push({ kind: "bullet-list", startLine: start + 1, endLine: i, text: items.join("\n") });
      continue;
    }
    if (line.trim() && !line.startsWith("```")) {
      const start = i;
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^[-*+#]/.test(lines[i]) && !lines[i].startsWith("```")) {
        buf.push(lines[i]); i++;
      }
      const text = buf.join(" ").trim();
      if (text.length >= 40) out.push({ kind: "paragraph", startLine: start + 1, endLine: i, text });
      continue;
    }
    i++;
  }
  return out;
}

function extractCodeComments(lines: string[]): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\/\*\*/.test(lines[i])) {
      const start = i;
      const buf: string[] = [];
      while (i < lines.length && !/\*\//.test(lines[i])) { buf.push(lines[i]); i++; }
      buf.push(lines[i] ?? "");
      const text = buf.join("\n").replace(/^\s*\/?\*+\/?/gm, "").trim();
      if (text.length >= 30) out.push({ kind: "doc-comment", startLine: start + 1, endLine: i + 1, text });
      i++; continue;
    }
    if (/^\s*\/\/\s+\S/.test(lines[i])) {
      const start = i;
      const buf: string[] = [];
      while (i < lines.length && /^\s*\/\/\s/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\/\/\s?/, "")); i++; }
      const text = buf.join(" ").trim();
      if (text.length >= 60) out.push({ kind: "doc-comment", startLine: start + 1, endLine: i, text });
      continue;
    }
    if (/^\s*#\s+\S/.test(lines[i])) {
      const start = i;
      const buf: string[] = [];
      while (i < lines.length && /^\s*#\s/.test(lines[i])) { buf.push(lines[i].replace(/^\s*#\s?/, "")); i++; }
      const text = buf.join(" ").trim();
      if (text.length >= 60) out.push({ kind: "doc-comment", startLine: start + 1, endLine: i, text });
      continue;
    }
    i++;
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const path = typeof args.path === "string" ? args.path : "";
  if (!path) fail("--path is required");
  if (!existsSync(path)) fail(`file not found: ${path}`);
  const st = statSync(path);
  if (st.size > 2_000_000) fail("file too large (>2MB); chunk manually first");

  const paths = resolveWiki();
  const ext = extname(path).toLowerCase();
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");

  let chunks: Chunk[];
  if ([".md", ".mdx", ".txt", ".rst"].includes(ext)) {
    chunks = extractMarkdown(lines);
  } else if ([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".py", ".rb", ".go", ".rs", ".java", ".c", ".cc", ".cpp", ".h"].includes(ext)) {
    chunks = extractCodeComments(lines);
  } else {
    chunks = extractMarkdown(lines);
  }

  const draft = {
    sourceFile: relative(paths.cwd, path),
    suggestedSummarySlug: basename(path).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60),
    chunkCount: chunks.length,
    chunks: chunks.slice(0, 50).map(c => ({
      ...c,
      provenance: { kind: "file" as const, path: relative(paths.cwd, path), lines: `${c.startLine}-${c.endLine}` },
    })),
    note: "Review chunks; for each kept chunk run wiki-search then wiki-add. Build one summary page in wiki/sources/ linking to all topic pages this file touches.",
  };

  emit({ ok: true, draft });
}

main();
