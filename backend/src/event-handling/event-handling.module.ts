import { Module, forwardRef } from '@nestjs/common';
import { EventRouterService } from './core/event-router.service';
import { RuleEngineService } from './core/rule-engine.service';
import { EventStoreService } from './core/event-store.service';
import { FileWatcherService } from './core/file-watcher.service';
import { PromptsStorageService } from './core/prompts-storage.service';
import { RuleActionExecutorService } from './core/rule-action-executor.service';
import { InitExternalServicesService } from './core/init-external-services.service';
import { SSEPublisherService } from './publishers/sse-publisher.service';
import { WorkflowEntryActionService } from './core/workflow-entry-action.service';
import { EventsController } from './api/events.controller';
import { RulesController } from './api/rules.controller';
import { PromptsController } from './api/prompts.controller';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { ProcessManagerModule } from '../process-manager/process-manager.module';
import { StatefulWorkflowsModule } from '../stateful-workflows/stateful-workflows.module';
import { AgentBusModule } from '../agent-bus/agent-bus.module';

@Module({
  imports: [KnowledgeGraphModule, ProcessManagerModule, forwardRef(() => StatefulWorkflowsModule), forwardRef(() => AgentBusModule)],
  controllers: [EventsController, RulesController, PromptsController],
  providers: [
    EventRouterService,
    RuleEngineService,
    EventStoreService,
    FileWatcherService,
    PromptsStorageService,
    RuleActionExecutorService,
    InitExternalServicesService,
    SSEPublisherService,
    WorkflowEntryActionService,
  ],
  exports: [EventRouterService, RuleEngineService, SSEPublisherService, PromptsStorageService, FileWatcherService],
})
export class EventHandlingModule {}
