import { Module } from '@nestjs/common';
import { AgentRoleRegistryService } from './agent-role-registry.service';
import { AgentRoleRegistryController } from './agent-role-registry.controller';

@Module({
  controllers: [AgentRoleRegistryController],
  providers: [AgentRoleRegistryService],
  exports: [AgentRoleRegistryService],
})
export class AgentRoleRegistryModule {}
