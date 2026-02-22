import { Module, forwardRef } from '@nestjs/common';
import { StatefulWorkflowsController } from './stateful-workflows.controller';
import { StatefulWorkflowsService } from './stateful-workflows.service';
import { AgentBusModule } from '../agent-bus/agent-bus.module';

@Module({
  imports: [forwardRef(() => AgentBusModule)],
  controllers: [StatefulWorkflowsController],
  providers: [StatefulWorkflowsService],
  exports: [StatefulWorkflowsService],
})
export class StatefulWorkflowsModule {}
