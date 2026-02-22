import { Module, forwardRef } from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import { BusLoggerService } from './bus-logger.service';
import { IntentRouterService } from './intent-router.service';
import { DssQueryAdapterService } from './dss-query-adapter.service';
import { ContextInjectorService } from './context-injector.service';
import { AgentBusController } from './agent-bus.controller';
import { OntologyCoreModule } from '../ontology-core/ontology-core.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { StatefulWorkflowsModule } from '../stateful-workflows/stateful-workflows.module';

@Module({
  imports: [
    forwardRef(() => OntologyCoreModule),
    KnowledgeGraphModule,
    forwardRef(() => StatefulWorkflowsModule),
  ],
  controllers: [AgentBusController],
  providers: [
    EventBusService,
    BusLoggerService,
    IntentRouterService,
    DssQueryAdapterService,
    ContextInjectorService,
  ],
  exports: [
    EventBusService,
    BusLoggerService,
    DssQueryAdapterService,
    ContextInjectorService,
  ],
})
export class AgentBusModule {}
