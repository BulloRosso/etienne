import { Module } from '@nestjs/common';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { GraphBuilderService } from './graph-builder.service';
import { VectorStoreModule } from './vector-store/vector-store.module';
import { OpenAiModule } from './openai/openai.module';

@Module({
  imports: [VectorStoreModule, OpenAiModule],
  providers: [KnowledgeGraphService, GraphBuilderService],
  exports: [KnowledgeGraphService, GraphBuilderService, VectorStoreModule, OpenAiModule]
})
export class KnowledgeGraphModule {}
