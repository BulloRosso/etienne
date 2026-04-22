import { Module } from '@nestjs/common';
import { AutoConfigurationController } from './auto-configuration.controller';
import { AutoConfigurationService } from './auto-configuration.service';
import { SkillsModule } from '../skills/skills.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CodingAgentConfigurationModule } from '../coding-agent-configuration/coding-agent-configuration.module';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';

@Module({
  imports: [
    SkillsModule,
    SessionsModule,
    CodingAgentConfigurationModule,
  ],
  controllers: [AutoConfigurationController],
  providers: [AutoConfigurationService, McpServerConfigService],
})
export class AutoConfigurationModule {}
