import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SkillsModule } from '../skills/skills.module';
import { AgentRoleRegistryModule } from '../agent-role-registry/agent-role-registry.module';
import { A2ASettingsModule } from '../a2a-settings/a2a-settings.module';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';

@Module({
  imports: [
    SkillsModule,
    AgentRoleRegistryModule,
    A2ASettingsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, McpServerConfigService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
