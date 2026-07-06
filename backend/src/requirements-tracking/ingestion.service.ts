import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { TtFilesService } from './store/files.service';
import { TtRepository } from './graph/tt-repository';
import { TtGraphClient, q } from './graph/tt-graph.client';
import { CLASS, GRAPH_TENDER, IRI, P, RDF_TYPE, XSD } from './graph/tt-vocab';
import { DocumentSection, TenderDocument } from './types/tendertrace-types';

const BINARY_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.docm', '.odt', '.rtf',
  '.ppt', '.pptx', '.pptm', '.odp',
  '.xls', '.xlsx', '.xlsm', '.ods',
]);

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

/**
 * Document/artifact intake: register originals under requirements-tracking/uploads|artifacts,
 * parse to normalized markdown + sections with char offsets (LiteParse for binary formats),
 * and write the tt:Document/tt:File nodes. Everything downstream consumes sections, never
 * raw files (spec §3.2 IngestionModule).
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
   * Parse the original into parsed/<docId>/document.md + sections.json.
   * Binary formats go through LiteParse (built-in OCR); a document that yields no
   * text is flagged needs_ocr and blocked from extraction (spec §12.11).
   */
  async parseDocument(project: string, docId: string): Promise<TenderDocument> {
    const document = await this.repository.getDocument(project, docId);
    if (!document) throw new Error(`Unknown document ${docId}`);
    if (!document.originalPath) throw new Error(`Document ${docId} has no original file`);

    await this.repository.saveDocument(project, { ...document, parseStatus: 'parsing' });

    let markdown: string;
    try {
      markdown = await this.extractText(project, document.originalPath);
    } catch (error: any) {
      this.logger.warn(`Parse failed for ${docId}: ${error.message}`);
      const failed: TenderDocument = { ...document, parseStatus: 'failed' };
      await this.repository.saveDocument(project, failed);
      return failed;
    }

    if (!markdown || markdown.trim().length < 20) {
      const needsOcr: TenderDocument = { ...document, parseStatus: 'needs_ocr' };
      await this.repository.saveDocument(project, needsOcr);
      return needsOcr;
    }

    const sections = this.sectionize(docId, markdown);
    const parsedMd = await this.files.writeFile(
      project,
      `parsed/${docId}/document.md`,
      markdown,
    );
    await this.files.writeJson(project, `parsed/${docId}/sections.json`, sections);
    await this.writeFileNode(
      project,
      IRI.doc(docId),
      P.parsedMarkdown,
      parsedMd,
      'text/markdown',
    );
    await this.repository.saveSections(project, sections);

    const parsed: TenderDocument = {
      ...document,
      parseStatus: 'parsed',
      parsedPath: `parsed/${docId}/`,
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

  private async extractText(project: string, relativePath: string): Promise<string> {
    const absolute = this.files.absolutePath(project, relativePath);
    const extension = path.extname(absolute).toLowerCase();
    if (BINARY_EXTENSIONS.has(extension)) {
      this.logger.log(`Parsing binary file with LiteParse: ${absolute}`);
      // ESM-only package — real dynamic import, not transpiled require()
      const { LiteParse } = await new Function('return import("@llamaindex/liteparse")')();
      const parser = new LiteParse({ ocrEnabled: true, outputFormat: 'text' });
      const result = await parser.parse(absolute, true /* quiet */);
      return result.text ?? '';
    }
    return this.files.readText(project, relativePath);
  }

  /**
   * Split normalized markdown into sections at heading boundaries, with char offsets.
   * Page numbers are taken from `\f` form feeds when the parser emitted them; otherwise
   * estimated at ~3000 chars/page — provenance keeps exact char offsets either way.
   */
  sectionize(docId: string, markdown: string): DocumentSection[] {
    const lines = markdown.split('\n');
    interface Raw {
      headingPath: string;
      charFrom: number;
      charTo: number;
      text: string;
    }
    const sections: Raw[] = [];
    const headingStack: string[] = [];
    let current: Raw | null = null;
    let offset = 0;

    const pushCurrent = (end: number) => {
      if (current && current.text.trim().length > 0) {
        current.charTo = end;
        sections.push(current);
      }
    };

    for (const line of lines) {
      const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line);
      if (headingMatch) {
        pushCurrent(offset);
        const level = headingMatch[1].length;
        headingStack.length = level - 1;
        headingStack[level - 1] = headingMatch[2].trim();
        current = {
          headingPath: headingStack.filter(Boolean).join(' > '),
          charFrom: offset,
          charTo: offset,
          text: '',
        };
      }
      if (!current) {
        current = { headingPath: '(preamble)', charFrom: 0, charTo: 0, text: '' };
      }
      current.text += `${line}\n`;
      offset += line.length + 1;
    }
    pushCurrent(offset);

    const charsPerPage = 3000;
    return sections.map((raw, index) => ({
      id: `${docId}/sec/${index + 1}`,
      documentId: docId,
      headingPath: raw.headingPath,
      pageFrom: Math.floor(raw.charFrom / charsPerPage) + 1,
      pageTo: Math.floor(Math.max(raw.charTo - 1, 0) / charsPerPage) + 1,
      charFrom: raw.charFrom,
      charTo: raw.charTo,
      text: raw.text.trim(),
    }));
  }
}
