import { Module } from '@nestjs/common';
import { StatefulWorkflowsController } from './stateful-workflows.controller';
import { StatefulWorkflowsService } from './stateful-workflows.service';

@Module({
  controllers: [StatefulWorkflowsController],
  providers: [StatefulWorkflowsService],
  exports: [StatefulWorkflowsService],
})
export class StatefulWorkflowsModule {}
