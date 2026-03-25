import { Module, forwardRef } from '@nestjs/common';
import { DecisionSupportService } from './decision-support.service';
import { DecisionSupportController } from './decision-support.controller';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { EventHandlingModule } from '../event-handling/event-handling.module';
import { AgentBusModule } from '../agent-bus/agent-bus.module';
import { LlmModule } from '../llm/llm.module';
import { InterceptorsModule } from '../interceptors/interceptors.module';
import { ScenarioHydratorService } from './scenario-hydrator.service';
import { ScenarioEvaluatorService } from './scenario-evaluator.service';
import { OntologyLearningService } from './ontology-learning.service';
import { OntologyPublicController } from './ontology-public.controller';

@Module({
  imports: [
    KnowledgeGraphModule,
    forwardRef(() => EventHandlingModule),
    forwardRef(() => AgentBusModule),
    LlmModule,
    InterceptorsModule,
  ],
  controllers: [DecisionSupportController, OntologyPublicController],
  providers: [DecisionSupportService, ScenarioHydratorService, ScenarioEvaluatorService, OntologyLearningService],
  exports: [DecisionSupportService],
})
export class OntologyCoreModule {}
