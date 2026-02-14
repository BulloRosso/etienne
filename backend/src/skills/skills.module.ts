import { Module } from '@nestjs/common';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';
import { CodingAgentConfigurationModule } from '../coding-agent-configuration/coding-agent-configuration.module';

@Module({
  imports: [CodingAgentConfigurationModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
