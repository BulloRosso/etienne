import { Module } from '@nestjs/common';
import { EventRouterService } from './core/event-router.service';
import { RuleEngineService } from './core/rule-engine.service';
import { EventStoreService } from './core/event-store.service';
import { FileWatcherService } from './core/file-watcher.service';
import { SSEPublisherService } from './publishers/sse-publisher.service';
import { EventsController } from './api/events.controller';
import { RulesController } from './api/rules.controller';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';

@Module({
  imports: [KnowledgeGraphModule],
  controllers: [EventsController, RulesController],
  providers: [
    EventRouterService,
    RuleEngineService,
    EventStoreService,
    FileWatcherService,
    SSEPublisherService,
  ],
  exports: [EventRouterService, RuleEngineService, SSEPublisherService],
})
export class EventHandlingModule {}
