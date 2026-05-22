import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SkillsModule } from '../skills/skills.module';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';
import { CodingAgentConfigurationModule } from '../coding-agent-configuration/coding-agent-configuration.module';
import { PackagesModule } from '../packages/packages.module';

@Module({
  imports: [
    SkillsModule,
    CodingAgentConfigurationModule,
    PackagesModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, McpServerConfigService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
