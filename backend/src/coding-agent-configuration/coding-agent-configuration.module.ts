import { Module } from '@nestjs/common';
import { CodingAgentConfigurationController } from './coding-agent-configuration.controller';
import { CodingAgentConfigurationService } from './coding-agent-configuration.service';

@Module({
  controllers: [CodingAgentConfigurationController],
  providers: [CodingAgentConfigurationService],
  exports: [CodingAgentConfigurationService],
})
export class CodingAgentConfigurationModule {}
