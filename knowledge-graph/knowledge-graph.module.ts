import { Module } from '@nestjs/common';
import { KnowledgeGraphService } from './knowledge-graph.service';

@Module({
  providers: [KnowledgeGraphService],
  exports: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
