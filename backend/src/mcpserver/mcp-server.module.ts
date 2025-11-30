import { Module } from '@nestjs/common';
import { McpServerController } from './mcp-server.controller';
import { McpServerService } from './mcp-server.service';
import { McpAuthGuard } from './auth.guard';
import { DeepResearchModule } from '../deep-research/deep-research.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { EmailModule } from '../smtp-imap/email.module';
import { ScrapbookModule } from '../scrapbook/scrapbook.module';

@Module({
  imports: [DeepResearchModule, KnowledgeGraphModule, EmailModule, ScrapbookModule],
  controllers: [McpServerController],
  providers: [McpServerService, McpAuthGuard],
  exports: [McpServerService],
})
export class McpServerModule {}
