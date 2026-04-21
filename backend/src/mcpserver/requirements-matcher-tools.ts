/**
 * Requirements Matcher Tools — find_solutions_for
 *
 * MCP tool that matches EARS requirements against previous offer documents
 * and generates a structured Markdown response following a guidance outline.
 *
 * Two source modes:
 *   - "documents": parse offer PDFs/DOCX with LiteParse, match via LLM
 *   - "rag": query the existing RAG index, filtered to specified documents
 *
 * Pipeline:
 *   1. Acquire offer content (parse+cache or RAG search)
 *   2. Pass 1 — match requirements to offer excerpts
 *   3. Map requirements to guidance structure sections
 *   4. Pass 2 — generate cohesive section content
 *   5. Assemble final Markdown
 *
 * Prompts stored as editable Markdown in ./requirements-matcher-prompts/
 */

import { ToolService, McpTool, ProgressCallback } from './types';
import { LlmService } from '../llm/llm.service';
import { RagService } from '../rag/rag.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_OUTPUT_TOKENS = 16384;
const REQS_PER_BATCH = 8;
const MAX_DOC_CHARS = 80_000;
const DOC_CHUNK_OVERLAP = 500;
const RAG_TOP_K = 10;
const WORKSPACE_DIR = path.join(process.cwd(), '..', 'workspace');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequirementInput {
  id: string;
  ears_normalized: string;
  action: string;
  constraint: string;
  priority: string;
  verification: string;
  references_standard: string;
}

interface MatchEntry {
  document_name: string;
  excerpt: string;
  page_or_location: string;
  relevance: 'high' | 'medium' | 'low';
  rationale: string;
}

interface MatchResult {
  requirement_id: string;
  matches: MatchEntry[];
}

interface GuidanceSection {
  number: string;
  title: string;
  depth: number;
}

interface ParsedDocument {
  name: string;
  fullText: string;
}

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

const PROMPTS_DIR = path.join(__dirname, 'requirements-matcher-prompts');

async function loadPrompt(filename: string): Promise<string> {
  return fs.readFile(path.join(PROMPTS_DIR, filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

function parseLlmJson<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    cleaned = lines.join('\n');
  }
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Document parsing & caching (documents mode)
// ---------------------------------------------------------------------------

async function parseDocument(absolutePath: string): Promise<string> {
  const { LiteParse } = await (new Function('return import("@llamaindex/liteparse")'))();
  const parser = new LiteParse({ ocrEnabled: true, outputFormat: 'text' });
  const result = await parser.parse(absolutePath, true);

  if (!result.text || !result.text.trim()) {
    throw new Error(`LiteParse returned empty content for ${absolutePath}`);
  }
  return result.text;
}

function cachePathFor(docPath: string): string {
  const project = docPath.split(/[/\\]/)[0];
  const baseName = path.basename(docPath, path.extname(docPath));
  const hash = crypto.createHash('sha256').update(docPath).digest('hex').substring(0, 8);
  return path.join(WORKSPACE_DIR, project, 'parsed-documents', `${baseName}-${hash}.txt`);
}

async function getOrParseDocument(docPath: string, onStatus?: (msg: string) => void): Promise<ParsedDocument> {
  const absolutePath = path.resolve(WORKSPACE_DIR, docPath);
  const cachePath = cachePathFor(docPath);
  const name = path.basename(docPath);

  // Check cache freshness
  try {
    const [srcStat, cacheStat] = await Promise.all([
      fs.stat(absolutePath),
      fs.stat(cachePath),
    ]);
    if (cacheStat.mtimeMs >= srcStat.mtimeMs) {
      if (onStatus) onStatus(`Using cached: ${name}`);
      const fullText = await fs.readFile(cachePath, 'utf-8');
      return { name, fullText };
    }
  } catch {
    // cache miss — fall through to parse
  }

  // Verify source exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Document not found: ${docPath} (resolved to ${absolutePath})`);
  }

  if (onStatus) onStatus(`Parsing: ${name}`);
  const fullText = await parseDocument(absolutePath);

  // Write cache
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, fullText, 'utf-8');

  return { name, fullText };
}

// ---------------------------------------------------------------------------
// Document text chunking
// ---------------------------------------------------------------------------

function chunkText(text: string, maxChars: number = MAX_DOC_CHARS, overlap: number = DOC_CHUNK_OVERLAP): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    // Try to break at a paragraph boundary
    if (end < text.length) {
      const lastBreak = text.lastIndexOf('\n\n', end);
      if (lastBreak > start + maxChars * 0.5) {
        end = lastBreak;
      }
    }
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start < 0) start = 0;
    if (end >= text.length) break;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Guidance structure parsing
// ---------------------------------------------------------------------------

function parseGuidanceStructure(structure: string): GuidanceSection[] {
  const sections: GuidanceSection[] = [];
  const lines = structure.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\d+(?:\.\d+)*)\s+(.+)/);
    if (match) {
      const number = match[1];
      const title = match[2];
      const depth = number.split('.').length;
      sections.push({ number, title, depth });
    }
  }

  if (!sections.length) {
    throw new Error('Could not parse guidance_structure. Expected numbered lines like "1. IT Solutions\\n1.1 Computers"');
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Batching helper
// ---------------------------------------------------------------------------

function batchArray<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Extract top-level headings from a document
// ---------------------------------------------------------------------------

const MAX_STRUCTURE_CHARS = 40_000;

async function extractDocumentHeadings(
  llm: LlmService,
  documentPath: string,
  onProgress?: ProgressCallback,
): Promise<{ number: string; title: string }[]> {
  if (onProgress) await onProgress(0, 3, 'Parsing document...');

  const doc = await getOrParseDocument(documentPath, (msg) => {
    if (onProgress) onProgress(0, 3, msg);
  });

  if (onProgress) await onProgress(1, 3, 'Extracting headings...');

  const systemPrompt = await loadPrompt('extract-headings-system.md');
  const truncatedText = doc.fullText.slice(0, MAX_STRUCTURE_CHARS);

  const raw = await llm.generateTextWithMessages({
    tier: 'small',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: truncatedText },
    ],
    maxOutputTokens: 4096,
  });

  if (onProgress) await onProgress(2, 3, 'Done');

  try {
    return parseLlmJson<{ number: string; title: string }[]>(raw);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Language name helper
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  it: 'Italian',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  zh: 'Chinese',
};

const NO_REQUIREMENTS_MESSAGE: Record<string, string> = {
  en: '*No requirements were mapped to this section.*',
  it: '*Nessun requisito \u00e8 stato associato a questa sezione.*',
  de: '*Dieser Abschnitt wurden keine Anforderungen zugeordnet.*',
  fr: "*Aucune exigence n'a \u00e9t\u00e9 associ\u00e9e \u00e0 cette section.*",
  es: '*No se asignaron requisitos a esta secci\u00f3n.*',
  zh: '*\u6ca1\u6709\u9700\u6c42\u88ab\u6620\u5c04\u5230\u6b64\u7ae0\u8282\u3002*',
};

function languageInstruction(langCode: string): string {
  const name = LANGUAGE_NAMES[langCode] || langCode;
  return (
    `\nOutput language: ${name} (${langCode})\n` +
    `You MUST write ALL generated content strictly in ${name}. ` +
    `If source excerpts are in a different language, translate them accurately into ${name} ` +
    `while preserving technical terms, acronyms, and proper nouns.`
  );
}

// ---------------------------------------------------------------------------
// Pass 1 — Documents mode: LLM-based matching
// ---------------------------------------------------------------------------

async function pass1Documents(
  llm: LlmService,
  requirements: RequirementInput[],
  documents: ParsedDocument[],
  onProgress?: ProgressCallback,
): Promise<Map<string, MatchEntry[]>> {
  const systemPrompt = await loadPrompt('pass1-matching-system.md');
  const allMatches = new Map<string, MatchEntry[]>();
  // Initialize empty arrays for all requirements
  for (const r of requirements) allMatches.set(r.id, []);

  const batches = batchArray(requirements, REQS_PER_BATCH);
  let step = 0;
  const totalSteps = batches.length * documents.reduce((sum, doc) => sum + chunkText(doc.fullText).length, 0);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const reqsJson = JSON.stringify(batch, null, 1);

    for (const doc of documents) {
      const chunks = chunkText(doc.fullText);
      for (let ci = 0; ci < chunks.length; ci++) {
        if (onProgress) {
          await onProgress(step, totalSteps, `Matching batch ${bi + 1}/${batches.length} against ${doc.name}${chunks.length > 1 ? ` (chunk ${ci + 1}/${chunks.length})` : ''}`);
        }

        const userMsg =
          `Requirements:\n${reqsJson}\n\n` +
          `--- Offer Document: ${doc.name}${chunks.length > 1 ? ` (chunk ${ci + 1} of ${chunks.length})` : ''} ---\n` +
          chunks[ci];

        const raw = await llm.generateTextWithMessages({
          tier: 'regular',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg },
          ],
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });

        try {
          const results = parseLlmJson<MatchResult[]>(raw);
          for (const r of results) {
            const existing = allMatches.get(r.requirement_id) ?? [];
            for (const m of r.matches) {
              existing.push({ ...m, document_name: doc.name });
            }
            allMatches.set(r.requirement_id, existing);
          }
        } catch {
          // Skip malformed chunk results
        }

        step++;
      }
    }
  }

  if (onProgress) await onProgress(totalSteps, totalSteps, 'Pass 1 matching complete');
  return allMatches;
}

// ---------------------------------------------------------------------------
// Pass 1 — RAG mode: semantic search with document filtering
// ---------------------------------------------------------------------------

async function pass1Rag(
  ragService: RagService,
  requirements: RequirementInput[],
  offerDocuments: string[],
  onProgress?: ProgressCallback,
): Promise<Map<string, MatchEntry[]>> {
  const allMatches = new Map<string, MatchEntry[]>();

  // Derive scope from the first document path (project name)
  const project = offerDocuments[0].split(/[/\\]/)[0];
  const scopeName = `project_${project}`;

  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i];
    if (onProgress) {
      await onProgress(i, requirements.length, `Searching RAG for ${req.id} (${i + 1}/${requirements.length})`);
    }

    try {
      const { results } = await ragService.indexSearchFiltered(
        scopeName,
        req.ears_normalized,
        offerDocuments,
        RAG_TOP_K,
      );

      const matches: MatchEntry[] = results.map(r => ({
        document_name: r.metadata?.filepath ? path.basename(r.metadata.filepath) : 'unknown',
        excerpt: r.content,
        page_or_location: r.metadata?.chunkNumber != null ? `Chunk ${r.metadata.chunkNumber + 1}` : 'unknown',
        relevance: r.similarity > 0.8 ? 'high' : r.similarity > 0.6 ? 'medium' : 'low',
        rationale: `Semantic similarity: ${(r.similarity * 100).toFixed(1)}%`,
      }));

      allMatches.set(req.id, matches);
    } catch {
      allMatches.set(req.id, []);
    }
  }

  if (onProgress) await onProgress(requirements.length, requirements.length, 'RAG search complete');
  return allMatches;
}

// ---------------------------------------------------------------------------
// Step 3 — Map requirements to guidance sections
// ---------------------------------------------------------------------------

async function mapRequirementsToSections(
  llm: LlmService,
  requirements: RequirementInput[],
  sections: GuidanceSection[],
): Promise<Record<string, string[]>> {
  const systemPrompt = await loadPrompt('mapping-system.md');

  const reqSummaries = requirements.map(r => ({
    id: r.id,
    ears_normalized: r.ears_normalized,
    action: r.action,
    constraint: r.constraint,
  }));

  const structureText = sections.map(s => `${s.number} ${s.title}`).join('\n');

  const userMsg =
    `Requirements:\n${JSON.stringify(reqSummaries, null, 1)}\n\n` +
    `Guidance Structure:\n${structureText}`;

  const raw = await llm.generateTextWithMessages({
    tier: 'small',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    maxOutputTokens: 4096,
  });

  try {
    return parseLlmJson<Record<string, string[]>>(raw);
  } catch {
    // Fallback: assign all requirements to first section
    const mapping: Record<string, string[]> = {};
    for (const s of sections) mapping[s.number] = [];
    if (sections.length > 0) {
      mapping[sections[0].number] = requirements.map(r => r.id);
    }
    return mapping;
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — Generate section content
// ---------------------------------------------------------------------------

async function generateSectionContent(
  llm: LlmService,
  section: GuidanceSection,
  requirements: RequirementInput[],
  matches: Map<string, MatchEntry[]>,
  assignedReqIds: string[],
  outputLanguage?: string,
): Promise<string> {
  const systemPrompt = await loadPrompt('pass2-combining-system.md');

  // Collect assigned requirements and their matches
  const assignedReqs = requirements.filter(r => assignedReqIds.includes(r.id));
  const reqsWithMatches = assignedReqs.map(r => ({
    ...r,
    matched_excerpts: (matches.get(r.id) ?? [])
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.relevance] - order[b.relevance];
      })
      .slice(0, 5), // Top 5 matches per requirement
  }));

  if (!reqsWithMatches.length) {
    const msg = (outputLanguage && NO_REQUIREMENTS_MESSAGE[outputLanguage])
      ?? NO_REQUIREMENTS_MESSAGE['en'];
    return `${msg}\n`;
  }

  let userMsg =
    `Section: ${section.number} ${section.title}\n\n` +
    `Requirements and their matched offer excerpts:\n${JSON.stringify(reqsWithMatches, null, 1)}`;

  if (outputLanguage) {
    userMsg += languageInstruction(outputLanguage);
  }

  const raw = await llm.generateTextWithMessages({
    tier: 'regular',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  return raw.trim();
}

// ---------------------------------------------------------------------------
// Final assembly
// ---------------------------------------------------------------------------

function assembleMarkdown(sections: GuidanceSection[], sectionContents: Map<string, string>): string {
  const lines: string[] = [];

  for (const section of sections) {
    // Heading level based on depth: 1 -> ##, 1.1 -> ###, 1.1.1 -> ####
    const headingLevel = Math.min(section.depth + 1, 5);
    const heading = '#'.repeat(headingLevel);
    lines.push(`${heading} ${section.number} ${section.title}\n`);

    const content = sectionContents.get(section.number) ?? '*No content generated for this section.*';
    lines.push(content);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function runPipeline(
  llm: LlmService,
  ragService: RagService,
  requirements: RequirementInput[],
  offerDocuments: string[],
  guidanceStructure: string,
  source: 'documents' | 'rag',
  outputLanguage?: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const report = async (progress: number, total: number, message: string) => {
    if (onProgress) await onProgress(progress, total, message);
  };

  // Parse guidance structure
  const sections = parseGuidanceStructure(guidanceStructure);

  // ── Phase 1: Acquire matches ──

  let allMatches: Map<string, MatchEntry[]>;

  if (source === 'documents') {
    // 1a. Parse & cache documents
    const documents: ParsedDocument[] = [];
    for (let i = 0; i < offerDocuments.length; i++) {
      await report(i, offerDocuments.length, `Parsing document ${i + 1} of ${offerDocuments.length}...`);
      const doc = await getOrParseDocument(offerDocuments[i], (msg) => {
        if (onProgress) onProgress(i, offerDocuments.length, msg);
      });
      documents.push(doc);
    }
    await report(offerDocuments.length, offerDocuments.length, 'All documents parsed');

    // 2a. Pass 1 — LLM matching
    allMatches = await pass1Documents(llm, requirements, documents, onProgress);
  } else {
    // 2b. Pass 1 — RAG search
    allMatches = await pass1Rag(ragService, requirements, offerDocuments, onProgress);
  }

  // ── Phase 2: Map requirements to sections ──

  await report(0, sections.length + 1, 'Mapping requirements to guidance sections...');
  const sectionMapping = await mapRequirementsToSections(llm, requirements, sections);

  // ── Phase 3: Generate section content (Pass 2) ──

  const sectionContents = new Map<string, string>();
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    await report(i + 1, sections.length + 1, `Generating section ${i + 1}/${sections.length}: ${section.title}`);

    const assignedReqIds = sectionMapping[section.number] ?? [];
    const content = await generateSectionContent(llm, section, requirements, allMatches, assignedReqIds, outputLanguage);
    sectionContents.set(section.number, content);
  }

  // ── Phase 4: Assemble ──

  await report(sections.length + 1, sections.length + 1, 'Assembling final document...');
  const markdown = assembleMarkdown(sections, sectionContents);

  await report(sections.length + 1, sections.length + 1, 'Complete');
  return markdown;
}

// ---------------------------------------------------------------------------
// MCP tool definition & service
// ---------------------------------------------------------------------------

const tools: McpTool[] = [
  {
    name: 'find_solutions_for',
    description:
      'Match EARS requirements against offer documents and generate a structured response document. ' +
      'Parses PDF/DOCX offer documents (or queries RAG index), finds matching content for each requirement, ' +
      'then combines matches into a coherent Markdown document following the provided guidance structure. ' +
      'Supports two source modes: "documents" (parse with LiteParse, cached) or "rag" (semantic search via RAG index).',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Requirement ID (e.g. "REQ-001")' },
              ears_normalized: { type: 'string', description: 'EARS-normalized requirement text' },
              action: { type: 'string', description: 'Required action' },
              constraint: { type: 'string', description: 'Acceptance constraint' },
              priority: { type: 'string', description: 'Priority level' },
              verification: { type: 'string', description: 'Verification method' },
              references_standard: { type: 'string', description: 'Referenced standards' },
            },
            required: ['id', 'ears_normalized'],
          },
          description: 'Array of EARS-normalized requirements to match against offer documents.',
        },
        offer_documents: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Paths to offer documents (PDF/DOCX), relative to the workspace root. ' +
            'In "documents" mode these are parsed with LiteParse. ' +
            'In "rag" mode these paths filter the RAG index to only return results from these documents.',
        },
        guidance_structure: {
          type: 'string',
          description:
            'Numbered outline defining the output document structure. ' +
            'Each line should be a numbered section, e.g.:\n' +
            '1. IT Solutions\n1.1 Computers\n1.2 Personnel\n2. Facilities\n2.1 Size',
        },
        source: {
          type: 'string',
          enum: ['documents', 'rag'],
          description:
            'Content source mode. ' +
            '"documents": parse offer files with LiteParse (cached in <project>/parsed-documents/). ' +
            '"rag": query the RAG index, filtered to the specified offer_documents (documents must be pre-indexed).',
        },
        output_language: {
          type: 'string',
          description:
            'ISO 639-1 language code for the generated output (e.g. "it", "en"). ' +
            'All generated content will be written in this language. Default: "it" (Italian).',
        },
      },
      required: ['requirements', 'offer_documents', 'guidance_structure', 'source'],
    },
  },
  {
    name: 'extract_document_headings',
    description:
      'Extract top-level section headings from a document (PDF or DOCX). ' +
      'Returns a JSON array of { number, title } objects representing the first-level heading structure.',
    inputSchema: {
      type: 'object',
      properties: {
        document_path: {
          type: 'string',
          description: 'Path to the document, relative to the workspace root (e.g. "my-project/previous-offers/Offer.docx").',
        },
      },
      required: ['document_path'],
    },
  },
];

export function createRequirementsMatcherToolsService(llmService: LlmService, ragService: RagService): ToolService {
  async function execute(toolName: string, args: any, _elicit?: any, onProgress?: ProgressCallback): Promise<any> {
    switch (toolName) {
      case 'find_solutions_for': {
        const requirements: RequirementInput[] = args.requirements ?? [];
        const offerDocuments: string[] = args.offer_documents ?? [];
        const guidanceStructure: string = args.guidance_structure ?? '';
        const source: 'documents' | 'rag' = args.source === 'rag' ? 'rag' : 'documents';
        const outputLanguage: string | undefined = args.output_language || undefined;

        if (!requirements.length) throw new Error('requirements array is empty');
        if (!offerDocuments.length) throw new Error('offer_documents array is empty');
        if (!guidanceStructure.trim()) throw new Error('guidance_structure is empty');

        return await runPipeline(
          llmService,
          ragService,
          requirements,
          offerDocuments,
          guidanceStructure,
          source,
          outputLanguage,
          onProgress,
        );
      }

      case 'extract_document_headings': {
        const documentPath: string = args.document_path ?? '';
        if (!documentPath.trim()) throw new Error('document_path is empty');

        return await extractDocumentHeadings(llmService, documentPath, onProgress);
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return { tools, execute };
}
