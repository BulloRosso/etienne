import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { EmbeddingsService } from '../../embeddings';

const CHROMADB_URL = process.env.CHROMADB_URL || 'http://localhost:7100';

export interface StrategyEmbeddingMetadata {
  skill_name: string;
  skill_path: string;
  domain: string;
  status: 'active' | 'contested' | 'investigating' | 'deprecated';
  confidence: number;
  support_count: number;
  last_verified: string;
}

export interface StrategySearchHit {
  id: string;
  description: string;
  similarity: number;
  metadata: StrategyEmbeddingMetadata;
}

@Injectable()
export class DreamingCollectionsService {
  private readonly logger = new Logger(DreamingCollectionsService.name);

  constructor(private readonly embeddings: EmbeddingsService) {}

  private strategyCollection(project: string): string {
    return `strategy_descriptions_${this.sanitize(project)}_${this.embeddings.dimension}`;
  }

  private sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async ensureChroma(): Promise<void> {
    try {
      await axios.get(`${CHROMADB_URL}/api/v1/heartbeat`, { timeout: 2000 });
    } catch {
      throw new Error('ChromaDB service not available on port 7100');
    }
  }

  private async ensureCollection(project: string): Promise<string> {
    await this.ensureChroma();
    const name = this.strategyCollection(project);
    try {
      await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections`, {
        name,
        metadata: { description: 'Strategy SKILL.md description embeddings for dreaming pre-filter' },
        get_or_create: true,
      });
    } catch (err: any) {
      throw new Error(`Failed to ensure strategy collection: ${err.message}`);
    }
    return name;
  }

  async upsertStrategy(project: string, id: string, description: string, metadata: StrategyEmbeddingMetadata): Promise<void> {
    const name = await this.ensureCollection(project);
    const embedding = await this.embeddings.embed(description);
    try { await axios.delete(`${CHROMADB_URL}/api/v1/${project}/collections/${name}/documents`, { data: { ids: [id] } }); } catch { /* ignore not-found */ }
    await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections/${name}/add`, {
      ids: [id],
      embeddings: [embedding],
      documents: [description],
      metadatas: [{ ...metadata }],
    });
  }

  async searchStrategies(project: string, query: string, k: number, minSimilarity = 0): Promise<StrategySearchHit[]> {
    const name = await this.ensureCollection(project);
    const embedding = await this.embeddings.embed(query);
    const response = await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections/${name}/query`, {
      query_embeddings: [embedding],
      n_results: k,
      include: ['documents', 'metadatas', 'distances'],
    });
    const r = response.data.results;
    const ids: string[] = r.ids?.[0] ?? [];
    const docs: string[] = r.documents?.[0] ?? [];
    const meta: any[] = r.metadatas?.[0] ?? [];
    const distances: number[] = r.distances?.[0] ?? [];
    const out: StrategySearchHit[] = [];
    for (let i = 0; i < ids.length; i++) {
      const similarity = 1 - (distances[i] / 2);
      if (similarity < minSimilarity) continue;
      out.push({ id: ids[i], description: docs[i] || '', similarity, metadata: meta[i] as StrategyEmbeddingMetadata });
    }
    return out;
  }
}
