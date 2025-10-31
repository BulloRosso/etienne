import { Module } from '@nestjs/common';
import { McpServerController } from './mcp-server.controller';
import { McpServerService } from './mcp-server.service';
import { McpAuthGuard } from './auth.guard';
import { DeepResearchModule } from '../deep-research/deep-research.module';

@Module({
  imports: [DeepResearchModule],
  controllers: [McpServerController],
  providers: [McpServerService, McpAuthGuard],
  exports: [McpServerService],
})
export class McpServerModule {}
