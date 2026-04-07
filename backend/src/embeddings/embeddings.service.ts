import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EmbeddingProvider } from './embedding-provider.interface';

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    @Inject('EMBEDDING_PROVIDER') private readonly provider: EmbeddingProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.provider.initialize();
    this.logger.log(
      `Embeddings ready — provider: ${this.provider.name}, model: ${this.provider.model}, dimension: ${this.provider.dimension}`,
    );
  }

  get dimension(): number {
    return this.provider.dimension;
  }

  get providerName(): string {
    return this.provider.name;
  }

  get model(): string {
    return this.provider.model;
  }

  async embed(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.provider.embedBatch(texts);
  }
}
