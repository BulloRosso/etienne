import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { OpenAiModule } from '../openai/openai.module';

@Module({
  imports: [
    VectorStoreModule,
    KnowledgeGraphModule,
    OpenAiModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
