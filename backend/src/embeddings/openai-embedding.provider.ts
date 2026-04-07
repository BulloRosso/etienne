import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { EmbeddingProvider } from './embedding-provider.interface';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';

const DEFAULT_MODEL = 'text-embedding-3-small';

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  private _dimension = 0;
  private client: OpenAI | null = null;
  private readonly logger = new Logger(OpenAiEmbeddingProvider.name);

  constructor(
    private readonly secretsManager: SecretsManagerService,
    model?: string,
  ) {
    this.model = model || DEFAULT_MODEL;
  }

  get dimension(): number {
    return this._dimension;
  }

  async initialize(): Promise<void> {
    let apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      apiKey = await this.secretsManager.getSecret('OPENAI_API_KEY');
    }
    if (!apiKey) {
      throw new Error(
        'OpenAI embedding provider requires OPENAI_API_KEY. Set it as an environment variable or in the secrets vault.',
      );
    }

    this.client = new OpenAI({ apiKey });

    // Detect dimension from a test embedding
    const response = await this.client.embeddings.create({
      model: this.model,
      input: 'test',
    });
    this._dimension = response.data[0].embedding.length;

    this.logger.log(`OpenAI embedding provider ready — model: ${this.model}, dimension: ${this._dimension}`);
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client!.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.client!.embeddings.create({
      model: this.model,
      input: texts,
    });

    // OpenAI returns embeddings in the same order as input
    return response.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);
  }
}
