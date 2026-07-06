import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { TtRepository } from './graph/tt-repository';
import { ProposalService, SubmitProposalInput } from './proposal.service';

const QUOTE_SIMILARITY_THRESHOLD = 0.9;
const DRIFT_LIKE_KINDS = new Set(['drift', 'progress_update', 'acceptance_signal']);

/**
 * Cross-artifact proposal dedup (spec §12.3): a decision seen in minutes, a
 * follow-up email AND a Quick-Capture paste of the same thread all link to the
 * same open proposal. Keyed on evidence-quote embedding similarity + overlapping
 * affected requirement ids, across artifact types. On a hit, the new evidence is
 * attached to the open proposal instead of creating a sibling card.
 *
 * Registered as the ProposalService dedup hook at module init.
 */
@Injectable()
export class ProposalDedupService {
  private readonly logger = new Logger(ProposalDedupService.name);

  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly repository: TtRepository,
    private readonly proposals: ProposalService,
  ) {
    this.proposals.registerDedupHook((project, input) => this.check(project, input));
  }

  private async check(
    project: string,
    input: SubmitProposalInput,
  ): Promise<{ attachedTo: string } | null> {
    if (!DRIFT_LIKE_KINDS.has(input.kind)) return null;
    const quote = input.evidence?.quote;
    if (!quote) return null;

    const open = await this.repository.listProposals(project, { status: 'proposed' });
    const candidates = open.filter(
      (proposal) =>
        DRIFT_LIKE_KINDS.has(proposal.kind) &&
        proposal.evidence?.quote &&
        this.overlaps(proposal.affectedRequirementIds, input.affectedRequirementIds ?? []),
    );
    if (candidates.length === 0) return null;

    let vectors: number[][];
    try {
      vectors = await this.embeddings.embedBatch([
        quote,
        ...candidates.map((proposal) => proposal.evidence!.quote),
      ]);
    } catch (error: any) {
      this.logger.warn(`Dedup skipped (embeddings unavailable): ${error.message}`);
      return null;
    }

    const [queryVector, ...candidateVectors] = vectors;
    for (let index = 0; index < candidates.length; index++) {
      if (this.cosine(queryVector, candidateVectors[index]) >= QUOTE_SIMILARITY_THRESHOLD) {
        const winner = candidates[index];
        await this.proposals.attachEvidence(project, winner.id, {
          quote,
          location: input.evidence?.location,
          speaker_or_author: input.evidence?.speaker_or_author,
          date: input.evidence?.date,
          artifactId: input.sourceArtifactId,
        });
        this.logger.log(
          `Dedup: evidence from ${input.sourceArtifactId ?? 'unknown artifact'} attached to open proposal ${winner.id}`,
        );
        return { attachedTo: winner.id };
      }
    }
    return null;
  }

  private overlaps(a: string[], b: string[]): boolean {
    // both empty (NEW topic proposals) also counts as overlapping context
    if (a.length === 0 && b.length === 0) return true;
    return a.some((id) => b.includes(id));
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
