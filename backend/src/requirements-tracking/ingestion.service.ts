import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { TtFilesService } from './store/files.service';
import { TtRepository } from './graph/tt-repository';
import { TtGraphClient, q } from './graph/tt-graph.client';
import { CLASS, GRAPH_TENDER, IRI, P, RDF_TYPE, XSD } from './graph/tt-vocab';
import { DocumentSection, TenderDocument } from './types/tendertrace-types';
import { joinPages, sectionizeDocument } from './ingestion/sectionizer';
import { XlsxCellRecord, renderWorkbookToMarkdown } from './ingestion/xlsx-markdown';

/** Formats LiteParse handles (LibreOffice → PDF → text/OCR). */
const LITEPARSE_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docm', '.odt', '.rtf',
  '.ppt', '.pptx', '.pptm', '.odp',
  '.xls', '.ods',
]);
/** Workbooks are read cell-by-cell with ExcelJS (sheet names + addresses survive). */
const WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm']);
/** Word documents go through mammoth so headings survive as markdown. */
const MAMMOTH_EXTENSIONS = new Set(['.docx']);

export interface RegisterDocumentInput {
  /** path relative to the project root (e.g. 'documents/leistungsbeschreibung.docx') */
  projectRelativePath?: string;
  /** or inline text content (pastes, .eml bodies) */
  text?: string;
  title: string;
  kind: 'tender' | 'artifact';
  artifactType?: 'email' | 'minutes' | 'change_request' | 'spec' | 'paste';
  artifactDate?: string;
  artifactParties?: string;
}

interface ExtractedDocument {
  markdown: string;
  cells?: XlsxCellRecord[];
  notes: string[];
}

/**
 * mammoth escapes markdown punctuation, so a tender sentence is stored as
 * `18\.500 m² … Kontraktlogistik\-Dienstleistung`. Downstream every quote is
 * checked verbatim against this text, but the model (correctly) quotes what a
 * reader sees — so the escapes have to go before the text is stored. Only
 * escapes of real markdown punctuation are unwrapped; `\\` stays a backslash.
 */
export function unescapeMarkdownPunctuation(markdown: string): string {
  return markdown.replace(/\\([\\`*_{}\[\]()#+\-.!>|~])/g, '$1');
}

/**
 * Document/artifact intake: register originals under requirements-tracking/uploads|artifacts,
 * parse to normalized markdown + sections with char offsets, and write the
 * tt:Document/tt:File nodes. Everything downstream consumes sections, never
 * raw files (spec §3.2 IngestionModule).
 *
 * Parsing routes by format: PDF/OCR → LiteParse (JSON mode, so real page
 * numbers survive as `<!-- page: N -->` markers), DOCX → mammoth markdown
 * (headings survive), XLSX → ExcelJS row lines (sheet + cell addresses
 * survive, `cells.json` feeds the figure index), everything else → text.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly files: TtFilesService,
    private readonly repository: TtRepository,
    private readonly graph: TtGraphClient,
  ) {}

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  /** Write a tt:File node (spec §11.3 — tt:relativePath is the only place a path exists). */
  private async writeFileNode(
    project: string,
    ownerIri: string,
    ownerPredicate: string,
    file: { relativePath: string; sha256: string; byteCount: number },
    format: string,
  ): Promise<void> {
    const fileIri = IRI.file(file.sha256.slice(0, 16));
    await this.graph.put(project, [
      q.node(fileIri, RDF_TYPE, CLASS.File, GRAPH_TENDER),
      q.literal(fileIri, P.relativePath, file.relativePath, GRAPH_TENDER),
      q.literal(fileIri, P.sha256, file.sha256, GRAPH_TENDER),
      q.typed(fileIri, P.byteCount, String(file.byteCount), `${XSD}integer`, GRAPH_TENDER),
      q.literal(fileIri, P.format, format, GRAPH_TENDER),
      q.node(ownerIri, ownerPredicate, fileIri, GRAPH_TENDER),
    ]);
  }

  private formatFor(extension: string): string {
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
      '.xls': 'application/vnd.ms-excel',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.md': 'text/markdown',
      '.eml': 'message/rfc822',
      '.txt': 'text/plain',
    };
    return map[extension] ?? 'application/octet-stream';
  }

  /** Counter-safe only under the caller's project lock (ProposalService/tools layer). */
  async registerDocument(
    project: string,
    input: RegisterDocumentInput,
  ): Promise<TenderDocument> {
    const isArtifact = input.kind === 'artifact';
    const docId = await this.repository.nextKey(
      project,
      isArtifact ? 'artifact' : 'document',
      isArtifact ? 'A-' : 'D-',
      2,
    );
    const slug = this.slugify(input.title);

    let extension: string;
    let stored: { relativePath: string; sha256: string; byteCount: number };
    if (input.projectRelativePath) {
      extension = path.extname(input.projectRelativePath).toLowerCase() || '.md';
      const targetDir = isArtifact ? 'artifacts' : 'uploads';
      stored = await this.files.importProjectFile(
        project,
        input.projectRelativePath,
        `${targetDir}/${docId}-${slug}${extension}`,
      );
    } else if (input.text !== undefined) {
      extension = '.md';
      const targetDir = isArtifact ? 'artifacts' : 'uploads';
      stored = await this.files.writeFile(
        project,
        `${targetDir}/${docId}-${slug}.md`,
        input.text,
      );
    } else {
      throw new Error('registerDocument needs projectRelativePath or text');
    }

    const document: TenderDocument = {
      id: docId,
      title: input.title,
      kind: input.kind,
      artifactType: input.artifactType,
      originalPath: stored.relativePath,
      parseStatus: 'pending',
      uploadedAt: new Date().toISOString(),
      sha256: stored.sha256,
      artifactDate: input.artifactDate,
      artifactParties: input.artifactParties,
    };
    await this.repository.saveDocument(project, document);
    await this.writeFileNode(
      project,
      IRI.doc(docId),
      P.originalFile,
      stored,
      this.formatFor(extension),
    );
    return document;
  }

  /**
   * Parse the original into parsed/<docId>/document.md + sections.json (+ cells.json
   * for workbooks). A document that yields no text is flagged needs_ocr and blocked
   * from extraction (spec §12.11).
   */
  async parseDocument(project: string, docId: string): Promise<TenderDocument> {
    const document = await this.repository.getDocument(project, docId);
    if (!document) throw new Error(`Unknown document ${docId}`);
    if (!document.originalPath) throw new Error(`Document ${docId} has no original file`);

    await this.repository.saveDocument(project, { ...document, parseStatus: 'parsing' });

    let extracted: ExtractedDocument;
    try {
      extracted = await this.extractDocument(project, document.originalPath);
    } catch (error: any) {
      this.logger.warn(`Parse failed for ${docId}: ${error.message}`);
      const failed: TenderDocument = { ...document, parseStatus: 'failed', parseNotes: error.message };
      await this.repository.saveDocument(project, failed);
      return failed;
    }

    const markdown = extracted.markdown;
    if (!markdown || markdown.replace(/<!--[^>]*-->/g, '').trim().length < 20) {
      const needsOcr: TenderDocument = { ...document, parseStatus: 'needs_ocr' };
      await this.repository.saveDocument(project, needsOcr);
      return needsOcr;
    }

    const { sections, pageSource } = sectionizeDocument(docId, markdown);
    const parsedMd = await this.files.writeFile(project, `parsed/${docId}/document.md`, markdown);
    await this.files.writeJson(project, `parsed/${docId}/sections.json`, sections);
    if (extracted.cells) {
      await this.files.writeJson(project, `parsed/${docId}/cells.json`, extracted.cells);
    }
    await this.writeFileNode(project, IRI.doc(docId), P.parsedMarkdown, parsedMd, 'text/markdown');
    await this.repository.saveSections(project, sections);

    const notes = [...extracted.notes];
    if (pageSource === 'estimated') notes.push('page numbers estimated (~3000 chars/page)');
    const parsed: TenderDocument = {
      ...document,
      parseStatus: 'parsed',
      parsedPath: `parsed/${docId}/`,
      pageSource,
      sectionCount: sections.length,
      hasCells: Boolean(extracted.cells?.length),
      parseNotes: notes.length > 0 ? notes.join('; ') : undefined,
    };
    await this.repository.saveDocument(project, parsed);
    return parsed;
  }

  async getSections(project: string, docId: string): Promise<DocumentSection[]> {
    return this.files.readJson<DocumentSection[]>(project, `parsed/${docId}/sections.json`);
  }

  async getSection(project: string, sectionRef: string): Promise<DocumentSection | null> {
    // sectionRef: "D-01/sec/3.2.1" or bare section id with documentId prefix
    const [docId] = sectionRef.split('/');
    try {
      const sections = await this.getSections(project, docId);
      return sections.find((s) => s.id === sectionRef) ?? null;
    } catch {
      return null;
    }
  }

  /** Cell records of a parsed workbook (empty for non-workbook documents). */
  async getCells(project: string, docId: string): Promise<XlsxCellRecord[]> {
    try {
      return await this.files.readJson<XlsxCellRecord[]>(project, `parsed/${docId}/cells.json`);
    } catch {
      return [];
    }
  }

  /** Backward-compatible wrapper around the heading-aware sectionizer. */
  sectionize(docId: string, markdown: string): DocumentSection[] {
    return sectionizeDocument(docId, markdown).sections;
  }

  // ---------------------------------------------------------------------------
  // Format routing
  // ---------------------------------------------------------------------------

  private async extractDocument(project: string, relativePath: string): Promise<ExtractedDocument> {
    const absolute = this.files.absolutePath(project, relativePath);
    const extension = path.extname(absolute).toLowerCase();
    const notes: string[] = [];

    if (WORKBOOK_EXTENSIONS.has(extension)) {
      this.logger.log(`Parsing workbook with ExcelJS: ${absolute}`);
      const rendered = await renderWorkbookToMarkdown(absolute);
      notes.push(`${rendered.sheets.length} sheet(s), ${rendered.cells.length} cells`);
      return { markdown: rendered.markdown, cells: rendered.cells, notes };
    }

    if (MAMMOTH_EXTENSIONS.has(extension)) {
      try {
        this.logger.log(`Parsing DOCX with mammoth: ${absolute}`);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require('mammoth');
        const result = await mammoth.convertToMarkdown({ path: absolute });
        const markdown = unescapeMarkdownPunctuation(String(result.value ?? ''));
        if (markdown.trim().length >= 20) {
          return { markdown, notes };
        }
        notes.push('mammoth returned no text; fell back to LiteParse');
      } catch (error: any) {
        notes.push(`mammoth failed (${error.message}); fell back to LiteParse`);
      }
      return { markdown: await this.parseWithLiteParse(absolute), notes };
    }

    if (LITEPARSE_EXTENSIONS.has(extension)) {
      return { markdown: await this.parseWithLiteParse(absolute), notes };
    }

    return { markdown: await this.files.readText(project, relativePath), notes };
  }

  /** LiteParse in JSON mode → page-marked text (built-in OCR for scans). */
  private async parseWithLiteParse(absolute: string): Promise<string> {
    this.logger.log(`Parsing binary file with LiteParse: ${absolute}`);
    // ESM-only package — real dynamic import, not transpiled require()
    const { LiteParse } = await new Function('return import("@llamaindex/liteparse")')();
    const parser = new LiteParse({ ocrEnabled: true, outputFormat: 'json' });
    const result = await parser.parse(absolute, true /* quiet */);
    const pages: Array<{ page?: number; pageNum?: number; text?: string }> =
      result?.json?.pages ?? result?.pages ?? [];
    if (Array.isArray(pages) && pages.length > 0) {
      return joinPages(
        pages.map((page, index) => ({
          pageNum: page.page ?? page.pageNum ?? index + 1,
          text: page.text ?? '',
        })),
      );
    }
    return result?.text ?? '';
  }
}
