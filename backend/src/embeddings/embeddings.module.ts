import { DynamicModule, Global, Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { TransformersEmbeddingProvider } from './transformers-embedding.provider';
import { OpenAiEmbeddingProvider } from './openai-embedding.provider';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';

@Global()
@Module({})
export class EmbeddingsModule {
  static register(): DynamicModule {
    return {
      module: EmbeddingsModule,
      global: true,
      providers: [
        {
          provide: 'EMBEDDING_PROVIDER',
          useFactory: (secretsManager: SecretsManagerService) => {
            const providerName = process.env.EMBEDDING_PROVIDER || 'transformers';
            const model = process.env.EMBEDDING_MODEL || undefined;

            switch (providerName) {
              case 'openai':
                return new OpenAiEmbeddingProvider(secretsManager, model);
              case 'transformers':
              default:
                return new TransformersEmbeddingProvider(model);
            }
          },
          inject: [SecretsManagerService],
        },
        EmbeddingsService,
      ],
      exports: [EmbeddingsService],
    };
  }
}
