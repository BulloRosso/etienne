import { Module } from '@nestjs/common';
import { McpServerController } from './mcp-server.controller';
import { McpServerService } from './mcp-server.service';
import { McpAuthGuard } from './auth.guard';
import { DeepResearchModule } from '../deep-research/deep-research.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { EmailModule } from '../smtp-imap/email.module';
import { ScrapbookModule } from '../scrapbook/scrapbook.module';
import { A2AClientModule } from '../a2a-client/a2a-client.module';
import { A2ASettingsModule } from '../a2a-settings/a2a-settings.module';
import { InterceptorsModule } from '../interceptors/interceptors.module';
import { ProjectToolsModule } from './project-tools/project-tools.module';

@Module({
  imports: [DeepResearchModule, KnowledgeGraphModule, EmailModule, ScrapbookModule, A2AClientModule, A2ASettingsModule, InterceptorsModule, ProjectToolsModule],
  controllers: [McpServerController],
  providers: [McpServerService, McpAuthGuard],
  exports: [McpServerService],
})
export class McpServerModule {}
