import { Injectable } from '@nestjs/common';
import { EmbeddingsService } from '../../embeddings/embeddings.service';
import { DiagnosticCheck } from '../types';

@Injectable()
export class EmbeddingsCheck implements DiagnosticCheck {
  readonly id = 'embeddings.reachable';
  readonly title = 'Embeddings provider is reachable';
  readonly category = 'connectivity' as const;

  constructor(private readonly embeddings: EmbeddingsService) {}

  async run() {
    try {
      const vec = await this.embeddings.embed('ping');
      const ok = Array.isArray(vec) && vec.length === this.embeddings.dimension;
      if (!ok) {
        return {
          status: 'fail' as const,
          severity: 'medium' as const,
          message: `Embeddings provider returned unexpected vector shape (got length ${vec?.length}, expected ${this.embeddings.dimension}).`,
          evidence: {
            provider: this.embeddings.providerName,
            model: this.embeddings.model,
            expectedDimension: this.embeddings.dimension,
            actualDimension: vec?.length,
          },
        };
      }
      return {
        status: 'ok' as const,
        severity: 'medium' as const,
        message: `Embeddings ready (provider: ${this.embeddings.providerName}, model: ${this.embeddings.model}, dim: ${this.embeddings.dimension}).`,
        evidence: {
          provider: this.embeddings.providerName,
          model: this.embeddings.model,
          dimension: this.embeddings.dimension,
        },
      };
    } catch (err: any) {
      return {
        status: 'fail' as const,
        severity: 'medium' as const,
        message: `Embeddings provider failed: ${err?.message || 'unknown error'}`,
        evidence: { provider: this.embeddings.providerName, error: err?.message },
        remediation: {
          kind: 'manual' as const,
          summary:
            'Verify the embeddings provider configuration (EMBEDDING_PROVIDER, EMBEDDING_MODEL) and, for openai, that OPENAI_API_KEY is set.',
        },
      };
    }
  }
}
