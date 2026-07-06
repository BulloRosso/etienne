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
import {
  ExtractionResult,
  ExtractedRequirement,
  extractionResultSchema,
} from '../schemas/extraction.schema';
import { DocumentSection, Proposal } from '../types/tendertrace-types';

const CHUNK_TARGET_CHARS = 12000; // ~3k tokens; sections stay whole below this
const CHUNK_OVERLAP_CHARS = 800; // ~200 tokens overlap for oversized splits (spec §5.1 notes)
const DEDUP_SIMILARITY = 0.92; // spec §4 pipeline 1

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

  async run(project: string, docId: string): Promise<{ runId: string; proposalIds: string[] }> {
    const document = await this.repository.getDocument(project, docId);
    if (!document) throw new Error(`Unknown document ${docId}`);
    if (document.parseStatus === 'needs_ocr') {
      throw new Error(`Document ${docId} needs OCR and is blocked from extraction (spec §12.11)`);
    }
    if (document.parseStatus !== 'parsed') {
      throw new Error(`Document ${docId} is not parsed (status: ${document.parseStatus})`);
    }

    const prompt = loadPrompt('p-extract.v1');
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
      });

      const systemPrompt = renderPrompt(prompt, {
        tender_id: project,
        document_name: document.title,
        document_type: document.kind,
        heading_path: chunk.headingPath,
        page_from: chunk.pageFrom,
        page_to: chunk.pageTo,
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
            language: this.detectLanguage(requirement.ears_text),
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
    });
    return { runId: run.id, proposalIds };
  }

  // ---------------------------------------------------------------------------
  // Chunking: one section per chunk, oversized sections split at paragraph
  // boundaries with overlap (spec §3.3 / §5.1 orchestrator notes)
  // ---------------------------------------------------------------------------

  private chunk(sections: DocumentSection[]): Array<{
    text: string;
    headingPath: string;
    pageFrom: number;
    pageTo: number;
    sectionIds: string[];
  }> {
    const chunks: Array<{
      text: string;
      headingPath: string;
      pageFrom: number;
      pageTo: number;
      sectionIds: string[];
    }> = [];
    for (const section of sections) {
      if (section.text.length <= CHUNK_TARGET_CHARS) {
        chunks.push({
          text: section.text,
          headingPath: section.headingPath,
          pageFrom: section.pageFrom,
          pageTo: section.pageTo,
          sectionIds: [section.id.split('/sec/').pop() ?? section.id],
        });
        continue;
      }
      const paragraphs = section.text.split(/\n\n+/);
      let current = '';
      for (const paragraph of paragraphs) {
        if (current.length + paragraph.length > CHUNK_TARGET_CHARS && current.length > 0) {
          chunks.push({
            text: current,
            headingPath: section.headingPath,
            pageFrom: section.pageFrom,
            pageTo: section.pageTo,
            sectionIds: [section.id.split('/sec/').pop() ?? section.id],
          });
          current = current.slice(-CHUNK_OVERLAP_CHARS);
        }
        current += (current ? '\n\n' : '') + paragraph;
      }
      if (current.trim().length > 0) {
        chunks.push({
          text: current,
          headingPath: section.headingPath,
          pageFrom: section.pageFrom,
          pageTo: section.pageTo,
          sectionIds: [section.id.split('/sec/').pop() ?? section.id],
        });
      }
    }
    return chunks;
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
      const shallError = this.oneShallCheck(requirement);
      if (shallError) return shallError;
    }
    return null;
  }

  /** Atomicity heuristic: exactly one obligation token in the shall-clause. */
  private oneShallCheck(requirement: ExtractedRequirement): string | null {
    const text = requirement.ears_text;
    const tokens = text.match(/\b(muss|müssen|soll|sollen|kann|können|shall|must)\b/gi) ?? [];
    if (tokens.length > 1) {
      return `Requirement ${requirement.temp_id}: ears_text contains ${tokens.length} obligation tokens ("${tokens.join('", "')}") — exactly one obligation per requirement; split it.`;
    }
    if (tokens.length === 0) {
      return `Requirement ${requirement.temp_id}: ears_text contains no obligation token (muss/soll/kann/shall).`;
    }
    return null;
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
