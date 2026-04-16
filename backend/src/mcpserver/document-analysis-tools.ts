/**
 * Document Analysis Tools — EARS Requirements Extraction
 *
 * MCP tool group that analyses PDF/Office tender documents using the
 * EARS (Easy Approach to Requirements Syntax) framework.
 *
 * Pipeline:
 *   1. Parse document text via LiteParse (PDF, Word, Excel, PowerPoint)
 *   2. Detect document language
 *   3. Chunk pages and extract requirements per chunk via LLM
 *   4. Merge & deduplicate across chunks
 *   5. Cross-reference quality pass (duplicates, contradictions, gaps)
 *   6. Generate structured Markdown + JSON report
 *   7. Optionally translate to English if source language is not English
 *
 * Prompts are stored as editable Markdown files in ./ears-analysis-prompts/
 */

import { ToolService, McpTool, ProgressCallback } from './types';
import { LlmService } from '../llm/llm.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Max output tokens for LLM extraction / cross-reference calls */
const MAX_OUTPUT_TOKENS = 16384;

/** Number of pages to send per LLM extraction call */
const PAGES_PER_CHUNK = 10;

/** Max characters per translation chunk (~3-4k tokens) */
const TRANSLATE_CHUNK_SIZE = 12_000;

/** Workspace root — same convention as RagService */
const WORKSPACE_DIR = path.join(process.cwd(), '..', 'workspace');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EarsType =
  | 'ubiquitous'
  | 'event_driven'
  | 'state_driven'
  | 'unwanted_behavior'
  | 'optional';

type RequirementPriority = 'mandatory' | 'scored' | 'optional' | 'informational';

type VerificationMethod =
  | 'test'
  | 'analysis'
  | 'inspection'
  | 'demonstration'
  | 'review'
  | 'not_specified';

interface Requirement {
  id: string;
  original_text: string;
  ears_normalized: string;
  ears_type: EarsType;
  trigger_condition: string;
  actor: string;
  action: string;
  constraint: string;
  priority: RequirementPriority;
  verification: VerificationMethod;
  references_standard: string;
  has_penalty: boolean;
  source_section: string;
  source_page: number;
  response_cluster: string;
  ambiguity_flag: boolean;
  ambiguity_notes: string;
}

interface ContextFact {
  id: string;
  text: string;
  category: string;
  source_section: string;
  source_page: number;
}

interface CommercialTerm {
  id: string;
  text: string;
  category: string;
  source_section: string;
  source_page: number;
}

interface DocumentSection {
  section_number: string;
  title: string;
  page_start: number;
}

interface ExtractionResult {
  requirements: Requirement[];
  context_facts: ContextFact[];
  commercial_terms: CommercialTerm[];
  document_sections: DocumentSection[];
}

interface LanguageInfo {
  language_code: string;
  language_name: string;
  confidence: string;
}

interface CrossReferenceResult {
  duplicates: Array<{ ids: string[]; reason: string }>;
  contradictions: Array<{ ids: string[]; reason: string }>;
  gaps: Array<{ area: string; explanation: string }>;
  executive_summary: string;
}

/** A single page of extracted text */
interface PageText {
  page_number: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

const PROMPTS_DIR = path.join(__dirname, 'ears-analysis-prompts');

async function loadPrompt(filename: string): Promise<string> {
  return fs.readFile(path.join(PROMPTS_DIR, filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// PDF / document parsing via LiteParse
// ---------------------------------------------------------------------------

/**
 * Extract text from a document using LiteParse.
 * Returns an array of page objects with page_number and text.
 * LiteParse output is split on page markers when available.
 */
async function extractDocumentText(absolutePath: string): Promise<PageText[]> {
  // Use Function-based import to get a real ESM dynamic import that won't be
  // transpiled to require() by ts-node. The @llamaindex/liteparse package is
  // ESM-only (no "require" export condition).
  const { LiteParse } = await (new Function('return import("@llamaindex/liteparse")'))();
  const parser = new LiteParse({ ocrEnabled: true, outputFormat: 'text' });
  const result = await parser.parse(absolutePath, true /* quiet */);

  if (!result.text || !result.text.trim()) {
    throw new Error('LiteParse returned empty content for the document.');
  }

  // LiteParse may embed page markers like "--- Page N ---" or similar.
  // Split on common page boundary patterns; fall back to a single page.
  const rawText = result.text;
  const pagePattern = /(?:^|\n)---\s*Page\s+(\d+)\s*---\s*\n/gi;
  const matches = [...rawText.matchAll(pagePattern)];

  if (matches.length > 1) {
    const pages: PageText[] = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index! + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : rawText.length;
      pages.push({
        page_number: parseInt(matches[i][1], 10),
        text: rawText.slice(start, end).trim(),
      });
    }
    return pages;
  }

  // No page markers — split into synthetic pages by character count (~3000 chars ≈ 1 page)
  const CHARS_PER_PAGE = 3000;
  const pages: PageText[] = [];
  for (let i = 0; i < rawText.length; i += CHARS_PER_PAGE) {
    pages.push({
      page_number: pages.length + 1,
      text: rawText.slice(i, i + CHARS_PER_PAGE).trim(),
    });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Chunking helpers
// ---------------------------------------------------------------------------

function chunkPages(pages: PageText[], chunkSize: number = PAGES_PER_CHUNK): PageText[][] {
  const chunks: PageText[][] = [];
  for (let i = 0; i < pages.length; i += chunkSize) {
    chunks.push(pages.slice(i, i + chunkSize));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// LLM interaction helpers
// ---------------------------------------------------------------------------

/**
 * Parse JSON from an LLM response, stripping markdown code fences if present.
 */
function parseLlmJson<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift(); // drop opening fence
    if (lines.length && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    cleaned = lines.join('\n');
  }
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

/**
 * Step 1 — Detect the primary language of the document by sampling pages.
 */
async function detectLanguage(
  llm: LlmService,
  pages: PageText[],
): Promise<LanguageInfo> {
  const systemPrompt = await loadPrompt('language-detection-system.md');

  // Sample from start, middle, end
  const indices = [0];
  if (pages.length > 4) indices.push(Math.floor(pages.length / 2));
  if (pages.length > 1) indices.push(pages.length - 1);

  const sample = indices
    .filter(i => pages[i].text.trim())
    .map(i => `[PAGE ${pages[i].page_number}]\n${pages[i].text.slice(0, 1500)}`)
    .join('\n\n---\n\n');

  const raw = await llm.generateTextWithMessages({
    tier: 'small',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sample },
    ],
    maxOutputTokens: 256,
  });

  try {
    return parseLlmJson<LanguageInfo>(raw);
  } catch {
    return { language_code: 'en', language_name: 'English', confidence: 'low' };
  }
}

/**
 * Step 2 — Extract requirements from a single chunk of pages.
 */
async function extractChunk(
  llm: LlmService,
  chunk: PageText[],
  chunkIndex: number,
  totalChunks: number,
  idOffsets: { req: number; ctx: number; com: number },
): Promise<any> {
  const systemPrompt = await loadPrompt('extraction-system.md');

  const continuation =
    `Start requirement IDs from REQ-${String(idOffsets.req).padStart(3, '0')}, ` +
    `context fact IDs from CTX-${String(idOffsets.ctx).padStart(3, '0')}, ` +
    `commercial term IDs from COM-${String(idOffsets.com).padStart(3, '0')}.`;

  const header =
    `--- Tender document chunk ${chunkIndex + 1} of ${totalChunks} ---\n` +
    `Pages ${chunk[0].page_number}–${chunk[chunk.length - 1].page_number}\n\n`;

  const body = chunk
    .map(p => `[PAGE ${p.page_number}]\n${p.text}`)
    .join('\n\n');

  const footer =
    '\n\nContinue the ID sequences from previous chunks if applicable.  ' +
    'Return ONLY the JSON for items found in THESE pages.';

  const userMsg = continuation + '\n\n' + header + body + footer;

  const raw = await llm.generateTextWithMessages({
    tier: 'regular',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  try {
    return parseLlmJson<any>(raw);
  } catch {
    return { requirements: [], context_facts: [], commercial_terms: [], document_sections: [] };
  }
}

/**
 * Step 3 — Merge and deduplicate results from all chunks.
 */
function mergeResults(chunkResults: any[]): ExtractionResult {
  const result: ExtractionResult = {
    requirements: [],
    context_facts: [],
    commercial_terms: [],
    document_sections: [],
  };
  const seenReqTexts = new Set<string>();

  for (const cr of chunkResults) {
    for (const r of cr.requirements ?? []) {
      const key = (r.original_text ?? '').trim().toLowerCase();
      if (key && !seenReqTexts.has(key)) {
        seenReqTexts.add(key);
        result.requirements.push(buildRequirement(r));
      }
    }
    for (const cf of cr.context_facts ?? []) {
      result.context_facts.push(buildContextFact(cf));
    }
    for (const ct of cr.commercial_terms ?? []) {
      result.commercial_terms.push(buildCommercialTerm(ct));
    }
    for (const ds of cr.document_sections ?? []) {
      result.document_sections.push(ds);
    }
  }

  // Re-number IDs sequentially after merge
  result.requirements.forEach((r, i) => { r.id = `REQ-${String(i + 1).padStart(3, '0')}`; });
  result.context_facts.forEach((cf, i) => { cf.id = `CTX-${String(i + 1).padStart(3, '0')}`; });
  result.commercial_terms.forEach((ct, i) => { ct.id = `COM-${String(i + 1).padStart(3, '0')}`; });

  return result;
}

function safe(val: any, fallback = ''): any {
  return val ?? fallback;
}

function buildRequirement(r: any): Requirement {
  return {
    id: r.id ?? '',
    original_text: safe(r.original_text),
    ears_normalized: safe(r.ears_normalized),
    ears_type: r.ears_type ?? 'ubiquitous',
    trigger_condition: safe(r.trigger_condition),
    actor: safe(r.actor),
    action: safe(r.action),
    constraint: safe(r.constraint),
    priority: r.priority ?? 'mandatory',
    verification: r.verification ?? 'not_specified',
    references_standard: safe(r.references_standard),
    has_penalty: !!r.has_penalty,
    source_section: safe(r.source_section),
    source_page: parseInt(r.source_page, 10) || 0,
    response_cluster: safe(r.response_cluster, 'other'),
    ambiguity_flag: !!r.ambiguity_flag,
    ambiguity_notes: safe(r.ambiguity_notes),
  };
}

function buildContextFact(cf: any): ContextFact {
  return {
    id: cf.id ?? '',
    text: safe(cf.text),
    category: safe(cf.category, 'site'),
    source_section: safe(cf.source_section),
    source_page: parseInt(cf.source_page, 10) || 0,
  };
}

function buildCommercialTerm(ct: any): CommercialTerm {
  return {
    id: ct.id ?? '',
    text: safe(ct.text),
    category: safe(ct.category, 'payment'),
    source_section: safe(ct.source_section),
    source_page: parseInt(ct.source_page, 10) || 0,
  };
}

/**
 * Step 4 — Cross-reference quality pass over all extracted requirements.
 */
async function crossReference(
  llm: LlmService,
  result: ExtractionResult,
): Promise<CrossReferenceResult> {
  const systemPrompt = await loadPrompt('cross-reference-system.md');

  const compact = result.requirements.map(r => ({
    id: r.id,
    ears_normalized: r.ears_normalized,
    ears_type: r.ears_type,
    priority: r.priority,
    response_cluster: r.response_cluster,
    constraint: r.constraint,
    ambiguity_flag: r.ambiguity_flag,
  }));

  const raw = await llm.generateTextWithMessages({
    tier: 'regular',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(compact, null, 1) },
    ],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  try {
    return parseLlmJson<CrossReferenceResult>(raw);
  } catch {
    return { duplicates: [], contradictions: [], gaps: [], executive_summary: '' };
  }
}

// ---------------------------------------------------------------------------
// Markdown report generation
// ---------------------------------------------------------------------------

function generateMarkdown(
  result: ExtractionResult,
  xref: CrossReferenceResult,
  documentName: string,
): string {
  const lines: string[] = [];
  const w = (line: string) => lines.push(line);

  w(`# Tender Requirements Analysis: ${documentName}\n`);

  // Executive summary
  if (xref.executive_summary) {
    w('## Executive Summary\n');
    w(xref.executive_summary + '\n');
  }

  // Stats
  w('## Extraction Statistics\n');
  const earsCounts: Record<string, number> = {};
  const priorityCounts: Record<string, number> = {};
  const clusterCounts: Record<string, number> = {};
  let ambiguousCount = 0;
  let penaltyCount = 0;

  for (const r of result.requirements) {
    earsCounts[r.ears_type] = (earsCounts[r.ears_type] ?? 0) + 1;
    priorityCounts[r.priority] = (priorityCounts[r.priority] ?? 0) + 1;
    clusterCounts[r.response_cluster] = (clusterCounts[r.response_cluster] ?? 0) + 1;
    if (r.ambiguity_flag) ambiguousCount++;
    if (r.has_penalty) penaltyCount++;
  }

  w('| Metric | Count |');
  w('|--------|-------|');
  w(`| Total requirements | ${result.requirements.length} |`);
  w(`| Context facts | ${result.context_facts.length} |`);
  w(`| Commercial terms | ${result.commercial_terms.length} |`);
  w(`| Ambiguous (needs review) | ${ambiguousCount} |`);
  w(`| Penalty-linked | ${penaltyCount} |`);
  w('');

  w('### EARS Classification Breakdown\n');
  w('| EARS Type | Count |');
  w('|-----------|-------|');
  for (const etype of Object.keys(earsCounts).sort()) {
    w(`| ${etype} | ${earsCounts[etype]} |`);
  }
  w('');

  w('### Priority Distribution\n');
  w('| Priority | Count |');
  w('|----------|-------|');
  for (const prio of Object.keys(priorityCounts).sort()) {
    w(`| ${prio} | ${priorityCounts[prio]} |`);
  }
  w('');

  w('### Response Cluster Distribution\n');
  w('| Cluster | Count |');
  w('|---------|-------|');
  for (const cluster of Object.keys(clusterCounts).sort()) {
    w(`| ${cluster} | ${clusterCounts[cluster]} |`);
  }
  w('');

  // Document structure
  if (result.document_sections.length) {
    w('## Document Structure\n');
    w('| Section | Title | Page |');
    w('|---------|-------|------|');
    for (const ds of result.document_sections) {
      w(`| ${ds.section_number ?? ''} | ${ds.title ?? ''} | ${ds.page_start ?? ''} |`);
    }
    w('');
  }

  // Requirements grouped by response cluster
  w('## Requirements by Response Cluster\n');
  const clusters: Record<string, Requirement[]> = {};
  for (const r of result.requirements) {
    (clusters[r.response_cluster] ??= []).push(r);
  }

  for (const clusterName of Object.keys(clusters).sort()) {
    const reqs = clusters[clusterName];
    const title = clusterName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    w(`### ${title} (${reqs.length} requirements)\n`);
    for (const r of reqs) {
      const penaltyTag = r.has_penalty ? ' \u26a0\ufe0f PENALTY' : '';
      const ambiguityTag = r.ambiguity_flag ? ' \ud83d\udd0d AMBIGUOUS' : '';
      w(`#### ${r.id} [${r.ears_type}] [${r.priority}]${penaltyTag}${ambiguityTag}\n`);
      w(`**Original text:** ${r.original_text}\n`);
      w(`**EARS normalized:** ${r.ears_normalized}\n`);
      if (r.trigger_condition) {
        w(`**Trigger:** ${r.trigger_condition}\n`);
      }
      w(`**Actor:** ${r.actor} | **Action:** ${r.action}\n`);
      if (r.constraint) {
        w(`**Constraint:** ${r.constraint}\n`);
      }
      let verLine = `**Verification:** ${r.verification}`;
      if (r.references_standard) {
        verLine += ` | **Standard:** ${r.references_standard}`;
      }
      verLine += ` | **Source:** \u00a7${r.source_section} (p.${r.source_page})\n`;
      w(verLine);
      if (r.ambiguity_flag && r.ambiguity_notes) {
        w(`> \u26a0\ufe0f **Ambiguity:** ${r.ambiguity_notes}\n`);
      }
      w('');
    }
  }

  // Ambiguity register
  const ambiguousReqs = result.requirements.filter(r => r.ambiguity_flag);
  if (ambiguousReqs.length) {
    w('## Ambiguity Register \u2014 Items Requiring Clarification\n');
    w('| ID | EARS Type | Issue | Source |');
    w('|----|-----------|-------|--------|');
    for (const r of ambiguousReqs) {
      w(`| ${r.id} | ${r.ears_type} | ${r.ambiguity_notes} | \u00a7${r.source_section} p.${r.source_page} |`);
    }
    w('');
  }

  // Context facts
  if (result.context_facts.length) {
    w('## Context Facts & Constraints\n');
    const cats: Record<string, ContextFact[]> = {};
    for (const cf of result.context_facts) {
      (cats[cf.category] ??= []).push(cf);
    }
    for (const cat of Object.keys(cats).sort()) {
      const title = cat.charAt(0).toUpperCase() + cat.slice(1);
      w(`### ${title}\n`);
      for (const cf of cats[cat]) {
        w(`- **${cf.id}** (\u00a7${cf.source_section}, p.${cf.source_page}): ${cf.text}`);
      }
      w('');
    }
  }

  // Commercial terms
  if (result.commercial_terms.length) {
    w('## Commercial Terms\n');
    const ccat: Record<string, CommercialTerm[]> = {};
    for (const ct of result.commercial_terms) {
      (ccat[ct.category] ??= []).push(ct);
    }
    for (const cat of Object.keys(ccat).sort()) {
      const title = cat.charAt(0).toUpperCase() + cat.slice(1);
      w(`### ${title}\n`);
      for (const ct of ccat[cat]) {
        w(`- **${ct.id}** (\u00a7${ct.source_section}, p.${ct.source_page}): ${ct.text}`);
      }
      w('');
    }
  }

  // Quality analysis
  w('## Quality Analysis\n');

  if (xref.duplicates.length) {
    w('### Potential Duplicates\n');
    for (const d of xref.duplicates) {
      w(`- ${d.ids.join(', ')}: ${d.reason}`);
    }
    w('');
  }

  if (xref.contradictions.length) {
    w('### Contradictions\n');
    for (const c of xref.contradictions) {
      w(`- ${c.ids.join(', ')}: ${c.reason}`);
    }
    w('');
  }

  if (xref.gaps.length) {
    w('### Coverage Gaps\n');
    for (const g of xref.gaps) {
      w(`- **${g.area}**: ${g.explanation}`);
    }
    w('');
  }

  if (!xref.duplicates.length && !xref.contradictions.length && !xref.gaps.length) {
    w('No duplicates, contradictions, or coverage gaps detected.\n');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/**
 * Translate a Markdown report into English, processing in chunks.
 */
async function translateMarkdown(
  llm: LlmService,
  markdown: string,
  sourceLanguage: string,
): Promise<string> {
  const systemPrompt = await loadPrompt('translation-system.md');

  // Split on double newlines to avoid breaking mid-table
  const sections = markdown.split('\n\n');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLen = 0;

  for (const section of sections) {
    if (currentLen + section.length > TRANSLATE_CHUNK_SIZE && currentChunk.length) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [section];
      currentLen = section.length;
    } else {
      currentChunk.push(section);
      currentLen += section.length;
    }
  }
  if (currentChunk.length) {
    chunks.push(currentChunk.join('\n\n'));
  }

  const translatedParts: string[] = [];
  for (const chunk of chunks) {
    const userMsg =
      `Source language: ${sourceLanguage}\n\n` +
      `--- BEGIN MARKDOWN ---\n${chunk}\n--- END MARKDOWN ---`;

    const translated = await llm.generateTextWithMessages({
      tier: 'regular',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    translatedParts.push(translated.trim());
  }

  return translatedParts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full EARS analysis pipeline on a document.
 */
async function runPipeline(
  llm: LlmService,
  documentPath: string,
  skipTranslation: boolean,
  onProgress?: ProgressCallback,
): Promise<{ markdown: string; json: any }> {
  // Resolve path relative to workspace
  const absolutePath = path.resolve(WORKSPACE_DIR, documentPath);

  // Verify file exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Document not found: ${documentPath} (resolved to ${absolutePath})`);
  }

  const documentName = path.basename(documentPath);

  // Progress: total steps = 2 (parse + lang) + chunks.length + 2 (xref + report/translate)
  // We calculate totalSteps after chunking, but send page-based progress for the chunk loop.
  const report = async (progress: number, total: number, message: string) => {
    if (onProgress) await onProgress(progress, total, message);
  };

  // 1. Extract text from document via LiteParse
  await report(0, 1, 'Parsing document…');
  const pages = await extractDocumentText(absolutePath);
  if (!pages.length) {
    throw new Error(`No text could be extracted from ${documentName}`);
  }

  // 2. Detect document language
  const totalPages = pages.length;
  await report(0, totalPages, `Parsed ${totalPages} pages. Detecting language…`);
  const langInfo = await detectLanguage(llm, pages);
  const isEnglish = langInfo.language_code.startsWith('en');

  // 3. Chunk pages for processing
  const chunks = chunkPages(pages);

  // 4. Process each chunk through the LLM
  const chunkResults: any[] = [];
  const idOffsets = { req: 1, ctx: 1, com: 1 };
  let pagesProcessed = 0;

  for (let i = 0; i < chunks.length; i++) {
    await report(pagesProcessed, totalPages, `Extracting requirements from pages ${pagesProcessed + 1}–${Math.min(pagesProcessed + chunks[i].length, totalPages)}…`);
    const data = await extractChunk(llm, chunks[i], i, chunks.length, idOffsets);
    chunkResults.push(data);
    idOffsets.req += (data.requirements ?? []).length;
    idOffsets.ctx += (data.context_facts ?? []).length;
    idOffsets.com += (data.commercial_terms ?? []).length;
    pagesProcessed += chunks[i].length;
    await report(pagesProcessed, totalPages, `Processed ${pagesProcessed} of ${totalPages} pages`);
  }

  // 5. Merge and deduplicate
  const result = mergeResults(chunkResults);

  // 6. Cross-reference quality pass
  await report(pagesProcessed, totalPages, 'Running quality analysis…');
  const xref = await crossReference(llm, result);

  // 7. Generate Markdown report
  let markdown = generateMarkdown(result, xref, documentName);

  // 8. Translate to English if non-English source
  if (!isEnglish && !skipTranslation) {
    await report(pagesProcessed, totalPages, `Translating from ${langInfo.language_name} to English…`);
    markdown = await translateMarkdown(llm, markdown, langInfo.language_name);
  }

  await report(totalPages, totalPages, 'Complete');

  // 9. Build raw JSON data
  const jsonData = {
    source_language: langInfo,
    requirements: result.requirements,
    context_facts: result.context_facts,
    commercial_terms: result.commercial_terms,
    document_sections: result.document_sections,
    quality_analysis: xref,
  };

  return { markdown, json: jsonData };
}

// ---------------------------------------------------------------------------
// MCP tool definition & service
// ---------------------------------------------------------------------------

const tools: McpTool[] = [
  {
    name: 'document_analysis_ears',
    description:
      'Analyse a PDF or Office document using the EARS (Easy Approach to Requirements Syntax) framework. ' +
      'Extracts requirements, context facts, and commercial terms from energy-market tender documents. ' +
      'Returns a structured Markdown report with statistics, EARS classifications, ambiguity register, ' +
      'cross-reference quality analysis (duplicates, contradictions, gaps), and an executive summary. ' +
      'Automatically detects document language and translates to English when needed. ' +
      'Supports PDF, Word, PowerPoint, and Excel via LiteParse with built-in OCR.',
    inputSchema: {
      type: 'object',
      properties: {
        document_path: {
          type: 'string',
          description:
            'Path to the document file, relative to the workspace root ' +
            '(e.g. "my-project/documents/tender.pdf", "my-project/data/specs.docx").',
        },
        skip_translation: {
          type: 'boolean',
          description:
            'Skip automatic English translation for non-English documents. ' +
            'Default: false — non-English documents are translated automatically.',
        },
        output_format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description:
            'Output format for the analysis result. ' +
            '"markdown" returns a human-readable Markdown report (default). ' +
            '"json" returns structured JSON data for programmatic consumption.',
        },
      },
      required: ['document_path'],
    },
  },
];

/**
 * Create the document-analysis MCP tool service.
 *
 * @param llmService - Injected LlmService for AI calls (Anthropic / OpenAI via Vercel AI SDK)
 */
export function createDocumentAnalysisToolsService(llmService: LlmService): ToolService {
  async function execute(toolName: string, args: any, _elicit?: any, onProgress?: ProgressCallback): Promise<any> {
    switch (toolName) {
      case 'document_analysis_ears': {
        const outputFormat: 'markdown' | 'json' = args.output_format === 'json' ? 'json' : 'markdown';

        const { markdown, json } = await runPipeline(
          llmService,
          args.document_path,
          !!args.skip_translation,
          onProgress,
        );

        if (outputFormat === 'json') {
          return json;
        }

        // Default: Markdown report with appended JSON data
        return markdown + '\n\n---\n\n## Raw JSON Data\n\n```json\n' + JSON.stringify(json, null, 2) + '\n```';
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return { tools, execute };
}
