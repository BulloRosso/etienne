import { Module } from '@nestjs/common';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { GraphBuilderService } from './graph-builder.service';
import { VectorStoreModule } from './vector-store/vector-store.module';

@Module({
  imports: [VectorStoreModule],
  providers: [KnowledgeGraphService, GraphBuilderService],
  exports: [KnowledgeGraphService, GraphBuilderService, VectorStoreModule]
})
export class KnowledgeGraphModule {}
