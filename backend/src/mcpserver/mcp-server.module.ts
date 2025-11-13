import { Module } from '@nestjs/common';
import { McpServerController } from './mcp-server.controller';
import { McpServerService } from './mcp-server.service';
import { McpAuthGuard } from './auth.guard';
import { DeepResearchModule } from '../deep-research/deep-research.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';

@Module({
  imports: [DeepResearchModule, KnowledgeGraphModule],
  controllers: [McpServerController],
  providers: [McpServerService, McpAuthGuard],
  exports: [McpServerService],
})
export class McpServerModule {}
