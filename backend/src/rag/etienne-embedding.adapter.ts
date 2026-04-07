import { EmbeddingsService } from '../embeddings';

/**
 * LlamaIndex BaseEmbedding adapter that delegates to our EmbeddingsService.
 * This ensures LlamaIndex uses the same embedding provider/model as the rest of the system.
 *
 * Note: We implement the minimal interface needed by LlamaIndex's SentenceSplitter
 * and indexing pipeline rather than importing BaseEmbedding directly, to avoid
 * tight coupling to LlamaIndex's class hierarchy.
 */
export class EtienneEmbedding {
  constructor(private readonly embeddingsService: EmbeddingsService) {}

  async getTextEmbedding(text: string): Promise<number[]> {
    return this.embeddingsService.embed(text);
  }

  async getTextEmbeddings(texts: string[]): Promise<number[][]> {
    return this.embeddingsService.embedBatch(texts);
  }

  async getQueryEmbedding(query: string): Promise<number[]> {
    return this.embeddingsService.embed(query);
  }

  get dimensions(): number {
    return this.embeddingsService.dimension;
  }
}
