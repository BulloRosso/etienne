import { Module } from '@nestjs/common';
import { VectorStoreModule } from './vector-store/vector-store.module';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module';
import { SearchModule } from './search/search.module';
import { OpenAiModule } from './openai/openai.module';

@Module({
  imports: [
    VectorStoreModule,
    KnowledgeGraphModule,
    SearchModule,
    OpenAiModule,
  ],
})
export class AppModule {}
