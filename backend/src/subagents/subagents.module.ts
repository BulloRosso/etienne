import { Module } from '@nestjs/common';
import { SubagentsController } from './subagents.controller';
import { SubagentsService } from './subagents.service';
import { CodingAgentConfigurationModule } from '../coding-agent-configuration/coding-agent-configuration.module';

@Module({
  imports: [CodingAgentConfigurationModule],
  controllers: [SubagentsController],
  providers: [SubagentsService],
  exports: [SubagentsService],
})
export class SubagentsModule {}
