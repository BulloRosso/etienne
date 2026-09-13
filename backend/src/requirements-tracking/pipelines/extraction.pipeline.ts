import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { EmbeddingsService } from '../../embeddings/embeddings.service';
import { IngestionService } from '../ingestion.service';
import { ProposalService } from '../proposal.service';
import { TtEventsService } from '../events.service';
import { TtRepository } from '../graph/tt-repository';
import { RunRegistryService } from './run-registry.service';
import { loadPrompt, renderPrompt } from './prompt-loader';
import { runStructured } from './structured-run';
import { validateQuote } from './quote-validator';
import { validateRequirement, EarsType } from '../../ears/ears-validator';
import {
  ExtractionResult,
  ExtractedRequirement,
  extractionResultSchema,
} from '../schemas/extraction.schema';
import { DocumentSection, Proposal } from '../types/tendertrace-types';

const CHUNK_TARGET_CHARS = 12000; // ~3k tokens; sections stay whole below this
const CHUNK_OVERLAP_CHARS = 800; // ~200 tokens overlap for oversized splits (spec §5.1 notes)
const DEDUP_SIMILARITY = 0.92; // spec §4 pipeline 1
const NO_GLOSSARY = '(kein Glossar vorhanden — domain_text ist identisch mit ears_text)';

/**
 * Obligation tokens. "muss … können" (must be able to) carries ONE obligation:
 * the ability verb after a modal is collapsed into it; "darf … nicht" is one
 * prohibition; "ist/sind/hat/haben zu" is the German infinitive obligation.
 */
const OBLIGATION_RE =
  /(?<![A-Za-zÄÖÜäöüß])(muss|müssen|soll|sollen|sollte|sollten|kann|können|darf|dürfen|shall|must|should|may)(?![A-Za-zÄÖÜäöüß])|(?<![A-Za-zÄÖÜäöüß])(?:ist|sind|hat|haben)(?![A-Za-zÄÖÜäöüß])[^.;:!?]{0,80}?(?<![A-Za-zÄÖÜäöüß])(?:zu\s+[A-Za-zÄÖÜäöüß]+(?:en|n)|[A-Za-zÄÖÜäöüß]+zu[A-Za-zÄÖÜäöüß]+(?:en|n))(?![A-Za-zÄÖÜäöüß])/gi;
const MODAL_BEFORE_ABILITY_RE = /^(muss|müssen|soll|sollen|sollte|sollten|darf|dürfen|must|shall|should)$/;
const ABILITY_RE = /^(kann|können)$/;

export interface ExtractionRunOptions {
  /** rendered <glossary> block (our domain vocabulary) for the DOMAIN LANGUAGE rule */
  glossaryText?: string;
  /** tender-analysis run id stamped on every proposal payload */
  runTag?: string;
}

interface Chunk {
  text: string;
  headingPath: string;
  pageFrom: number;
  pageTo: number;
  sectionIds: string[];
}

/** Count obligations in an EARS sentence (exported for the unit test). */
export function countObligations(text: string): number {
  const tokens = [...text.matchAll(OBLIGATION_RE)].map((match) => match[0].toLowerCase().replace(/\s+/g, ' '));
  let count = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const previous = tokens[index - 1];
    if (index > 0 && ABILITY_RE.test(token) && previous && MODAL_BEFORE_ABILITY_RE.test(previous)) continue;
    count++;
  }
  return count;
}

/**
 * Extraction pipeline (spec §4 pipeline 1): per document-section chunk run
 * P-EXTRACT → submit one proposal per requirement → embedding-similarity dedup
 * pass flags merge candidates for the reviewer.
 */
@Injectable()
export class ExtractionPipeline {
  private readonly logger = new Logger(ExtractionPipeline.name);

  constructor(
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingsService,
    private readonly ingestion: IngestionService,
    private readonly proposals: ProposalService,
    private readonly events: TtEventsService,
    private readonly repository: TtRepository,
    private readonly runs: RunRegistryService,
  ) {}

  async run(
    project: string,
    docId: string,
    opts: ExtractionRunOptions = {},
  ): Promise<{ runId: string; proposalIds: string[]; failedChunks: number; chunks: number }> {
    const document = await this.repository.getDocument(project, docId);
    if (!document) throw new Error(`Unknown document ${docId}`);
    if (document.parseStatus === 'needs_ocr') {
      throw new Error(`Document ${docId} needs OCR and is blocked from extraction (spec §12.11)`);
    }
    if (document.parseStatus !== 'parsed') {
      throw new Error(`Document ${docId} is not parsed (status: ${document.parseStatus})`);
    }

    const prompt = loadPrompt('p-extract.v2');
    const run = await this.runs.start(project, {
      pipeline: 'extraction',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    const sections = await this.ingestion.getSections(project, docId);
    const chunks = this.chunk(sections);
    const proposalIds: string[] = [];
    let failedChunks = 0;

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      await this.events.emit(project, 'pipeline.progress', {
        runId: run.id,
        pipeline: 'extraction',
        docId,
        step: index + 1,
        total: chunks.length,
        message: chunk.headingPath,
        analysisRunId: opts.runTag,
      });

      const systemPrompt = renderPrompt(prompt, {
        tender_id: project,
        document_name: document.title,
        document_type: document.kind,
        heading_path: chunk.headingPath,
        page_from: chunk.pageFrom,
        page_to: chunk.pageTo,
        glossary: opts.glossaryText?.trim() ? opts.glossaryText : NO_GLOSSARY,
      });

      const outcome = await runStructured(this.llm, {
        schema: extractionResultSchema,
        systemPrompt,
        userMessage: `<section>\n${chunk.text}\n</section>`,
        tier: 'regular',
        temperature: 0,
        maxOutputTokens: 16000,
        postValidators: [
          (result: ExtractionResult) => this.validateChunkResult(result, chunk.text),
        ],
      });

      if (!outcome.ok || !outcome.data) {
        failedChunks++;
        this.logger.warn(
          `Extraction chunk ${index + 1}/${chunks.length} failed for ${docId}: ${outcome.error}`,
        );
        continue;
      }

      for (const requirement of outcome.data.requirements) {
        const submitted = await this.proposals.submit(project, {
          kind: 'extraction',
          payload: {
            ...requirement,
            domain_text: requirement.domain_text?.trim() || requirement.ears_text,
            term_mappings: requirement.term_mappings ?? [],
            validation_flags: this.validationFlags(requirement),
            language: this.detectLanguage(requirement.ears_text),
            analysis_run_id: opts.runTag,
            source: {
              ...requirement.source,
              documentId: docId,
              sectionId: chunk.sectionIds[0],
            },
          },
          evidence: {
            quote: requirement.source.quote,
            location: requirement.source.section,
            artifactId: docId,
          },
          affectedRequirementIds: [],
          agentRunId: run.id,
          promptVersion: prompt.version,
          confidence: requirement.confidence,
          sourceArtifactId: docId,
          sourceText: chunk.text,
        });
        if ('id' in submitted) proposalIds.push(submitted.id);
      }
    }

    const mergeCandidates = await this.dedupPass(project, proposalIds);

    await this.runs.finish(project, run, failedChunks === 0 ? 'ok' : 'partial', {
      proposalIds,
    });
    await this.events.emit(project, 'run.finished', {
      runId: run.id,
      pipeline: 'extraction',
      docId,
      proposals: proposalIds.length,
      failedChunks,
      mergeCandidates,
      analysisRunId: opts.runTag,
    });
    return { runId: run.id, proposalIds, failedChunks, chunks: chunks.length };
  }

  // ---------------------------------------------------------------------------
  // Chunking: one section per chunk, oversized sections split at paragraph
  // boundaries with overlap (spec §3.3 / §5.1 orchestrator notes); paragraphs
  // without blank lines (tables, row lists) split at line boundaries.
  // ---------------------------------------------------------------------------

  private chunk(sections: DocumentSection[]): Chunk[] {
    const chunks: Chunk[] = [];
    for (const section of sections) {
      const sectionIds = [section.id.split('/sec/').pop() ?? section.id];
      const base = {
        headingPath: section.headingPath,
        pageFrom: section.pageFrom,
        pageTo: section.pageTo,
        sectionIds,
      };
      if (section.text.length <= CHUNK_TARGET_CHARS) {
        chunks.push({ text: section.text, ...base });
        continue;
      }
      const paragraphs = section.text
        .split(/\n\n+/)
        .flatMap((paragraph) => this.splitOversized(paragraph));
      let current = '';
      for (const paragraph of paragraphs) {
        if (current.length + paragraph.length > CHUNK_TARGET_CHARS && current.length > 0) {
          chunks.push({ text: current, ...base });
          current = current.slice(-CHUNK_OVERLAP_CHARS);
        }
        current += (current ? '\n\n' : '') + paragraph;
      }
      if (current.trim().length > 0) {
        chunks.push({ text: current, ...base });
      }
    }
    return chunks;
  }

  /** A single paragraph larger than the target is split at line breaks. */
  private splitOversized(paragraph: string): string[] {
    if (paragraph.length <= CHUNK_TARGET_CHARS) return [paragraph];
    const pieces: string[] = [];
    let current = '';
    for (const line of paragraph.split('\n')) {
      if (current.length + line.length + 1 > CHUNK_TARGET_CHARS && current.length > 0) {
        pieces.push(current);
        current = '';
      }
      current += (current ? '\n' : '') + line;
    }
    if (current) pieces.push(current);
    return pieces;
  }

  // ---------------------------------------------------------------------------
  // Deterministic server-side checks (spec §5.1 orchestrator notes)
  // ---------------------------------------------------------------------------

  private validateChunkResult(result: ExtractionResult, chunkText: string): string | null {
    for (const requirement of result.requirements) {
      const quoteCheck = validateQuote(chunkText, requirement.source.quote);
      if (!quoteCheck.valid) {
        return `Requirement ${requirement.temp_id}: source.quote is not a verbatim quote from the section text. Copy it character-for-character.`;
      }
      const shallError =
        this.oneShallCheck(requirement.temp_id, 'ears_text', requirement.ears_text) ??
        (requirement.domain_text?.trim()
          ? this.oneShallCheck(requirement.temp_id, 'domain_text', requirement.domain_text)
          : null);
      if (shallError) return shallError;
    }
    return null;
  }

  /** Atomicity heuristic: exactly one obligation in the shall-clause. */
  private oneShallCheck(tempId: string, field: string, text: string): string | null {
    const count = countObligations(text);
    if (count > 1) {
      return `Requirement ${tempId}: ${field} contains ${count} obligations — exactly one obligation per requirement; split it.`;
    }
    if (count === 0) {
      return `Requirement ${tempId}: ${field} contains no obligation token (muss/soll/kann/darf/ist zu/shall).`;
    }
    return null;
  }

  /** Rule-based EARS flags (backend/src/ears/ears-validator.ts) — advisory chips for the reviewer. */
  private validationFlags(requirement: ExtractedRequirement): string[] {
    const typeMap: Record<string, EarsType | undefined> = {
      ubiquitous: 'ubiquitous',
      event_driven: 'event_driven',
      state_driven: 'state_driven',
      unwanted_behavior: 'unwanted_behavior',
      optional_feature: 'optional',
      complex: undefined,
    };
    const fields = requirement.ears_fields ?? ({} as ExtractedRequirement['ears_fields']);
    const trigger = fields.trigger ?? fields.state ?? fields.condition ?? fields.feature;
    try {
      return validateRequirement({
        id: requirement.temp_id,
        ears_normalized: requirement.ears_text,
        ears_type: typeMap[requirement.ears_pattern],
        trigger_condition: trigger ?? undefined,
        action: fields.response ?? undefined,
      });
    } catch {
      return [];
    }
  }

  private detectLanguage(text: string): string {
    return /\b(muss|müssen|soll|sollen|kann|wenn|während|falls|der|die|das)\b/i.test(text)
      ? 'de'
      : 'en';
  }

  // ---------------------------------------------------------------------------
  // Dedup pass: embedding similarity within the tender flags merge candidates
  // for the reviewer (they are NOT auto-merged)
  // ---------------------------------------------------------------------------

  private async dedupPass(project: string, proposalIds: string[]): Promise<number> {
    if (proposalIds.length < 2) return 0;
    const proposals: Proposal[] = [];
    for (const pid of proposalIds) {
      const proposal = await this.repository.getProposal(project, pid);
      if (proposal?.payload?.ears_text) proposals.push(proposal);
    }
    if (proposals.length < 2) return 0;

    let vectors: number[][];
    try {
      vectors = await this.embeddings.embedBatch(proposals.map((p) => p.payload.ears_text));
    } catch (error: any) {
      this.logger.warn(`Dedup pass skipped (embeddings unavailable): ${error.message}`);
      return 0;
    }

    let flagged = 0;
    for (let i = 0; i < proposals.length; i++) {
      const candidates: string[] = [];
      for (let j = 0; j < proposals.length; j++) {
        if (i === j) continue;
        if (this.cosine(vectors[i], vectors[j]) > DEDUP_SIMILARITY) {
          candidates.push(proposals[j].id);
        }
      }
      if (candidates.length > 0) {
        flagged++;
        await this.repository.updateProposal(project, {
          ...proposals[i],
          payload: { ...proposals[i].payload, merge_candidates: candidates },
        });
      }
    }
    return flagged;
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }
}
