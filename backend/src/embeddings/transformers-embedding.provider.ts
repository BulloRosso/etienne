import { Logger } from '@nestjs/common';
import { EmbeddingProvider } from './embedding-provider.interface';

const DEFAULT_MODEL = 'Xenova/multilingual-e5-base';

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'transformers';
  readonly model: string;
  private _dimension = 0;
  private pipeline: any = null;
  private readonly logger = new Logger(TransformersEmbeddingProvider.name);

  constructor(model?: string) {
    this.model = model || DEFAULT_MODEL;
  }

  get dimension(): number {
    return this._dimension;
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    this.logger.log(`Loading transformers.js model: ${this.model}...`);

    const { pipeline } = await import('@huggingface/transformers');
    this.pipeline = await pipeline('feature-extraction', this.model, {
      dtype: 'fp32',
    });

    // Detect dimension from a test embedding
    const testOutput = await this.pipeline('test', { pooling: 'mean', normalize: true });
    this._dimension = testOutput.dims[testOutput.dims.length - 1];

    const elapsed = Date.now() - startTime;
    this.logger.log(`Model loaded in ${elapsed}ms — dimension: ${this._dimension}`);
  }

  async embed(text: string): Promise<number[]> {
    const prefixed = this.prefixText(text);
    const output = await this.pipeline(prefixed, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const prefixed = texts.map(t => this.prefixText(t));
    const output = await this.pipeline(prefixed, { pooling: 'mean', normalize: true });

    // output.dims = [batchSize, dimension]
    const dim = this._dimension;
    const data = output.data as Float32Array;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      results.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
    }
    return results;
  }

  /**
   * E5 models require "query: " or "passage: " prefix for best results.
   * We default to "query: " since embeddings are primarily used for search.
   */
  private prefixText(text: string): string {
    if (this.model.includes('e5')) {
      return `query: ${text}`;
    }
    return text;
  }
}
