import { Module, forwardRef } from '@nestjs/common';
import { DecisionSupportService } from './decision-support.service';
import { DecisionSupportController } from './decision-support.controller';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { EventHandlingModule } from '../event-handling/event-handling.module';
import { AgentBusModule } from '../agent-bus/agent-bus.module';
import { ScenarioHydratorService } from './scenario-hydrator.service';
import { ScenarioEvaluatorService } from './scenario-evaluator.service';

@Module({
  imports: [KnowledgeGraphModule, forwardRef(() => EventHandlingModule), forwardRef(() => AgentBusModule)],
  controllers: [DecisionSupportController],
  providers: [DecisionSupportService, ScenarioHydratorService, ScenarioEvaluatorService],
  exports: [DecisionSupportService],
})
export class OntologyCoreModule {}
