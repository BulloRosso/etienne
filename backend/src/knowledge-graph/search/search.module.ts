import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { KnowledgeGraphService } from '../knowledge-graph.service';
import { GraphBuilderService } from '../graph-builder.service';
import { OpenAiModule } from '../openai/openai.module';

@Module({
  imports: [VectorStoreModule, OpenAiModule],
  controllers: [SearchController],
  providers: [SearchService, KnowledgeGraphService, GraphBuilderService],
  exports: [SearchService]
})
export class SearchModule {}
