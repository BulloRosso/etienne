import { Module } from '@nestjs/common';
import { EventRouterService } from './core/event-router.service';
import { RuleEngineService } from './core/rule-engine.service';
import { EventStoreService } from './core/event-store.service';
import { FileWatcherService } from './core/file-watcher.service';
import { PromptsStorageService } from './core/prompts-storage.service';
import { RuleActionExecutorService } from './core/rule-action-executor.service';
import { SSEPublisherService } from './publishers/sse-publisher.service';
import { EventsController } from './api/events.controller';
import { RulesController } from './api/rules.controller';
import { PromptsController } from './api/prompts.controller';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';

@Module({
  imports: [KnowledgeGraphModule],
  controllers: [EventsController, RulesController, PromptsController],
  providers: [
    EventRouterService,
    RuleEngineService,
    EventStoreService,
    FileWatcherService,
    PromptsStorageService,
    RuleActionExecutorService,
    SSEPublisherService,
  ],
  exports: [EventRouterService, RuleEngineService, SSEPublisherService, PromptsStorageService],
})
export class EventHandlingModule {}
