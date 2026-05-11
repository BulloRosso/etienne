import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DreamingController } from './dreaming.controller';
import { DreamingService } from './dreaming.service';
import { DreamingWorkerService } from './worker/dreaming-worker.service';
import { DreamingCollectionsService } from './chroma/dreaming-collections.service';
import { StrategyPrefilterService } from './inference/strategy-prefilter.service';
import { BudgetMonitoringModule } from '../budget-monitoring/budget-monitoring.module';
import { QuickActionsModule } from '../quick-actions/quick-actions.module';

/**
 * LlmModule and EmbeddingsModule are @Global() in this codebase, so we don't
 * re-import them here — that would re-instantiate the embedding provider and
 * (for transformers) reload the model into memory.
 */
@Module({
  imports: [ScheduleModule.forRoot(), BudgetMonitoringModule, QuickActionsModule],
  controllers: [DreamingController],
  providers: [DreamingService, DreamingWorkerService, DreamingCollectionsService, StrategyPrefilterService],
  exports: [DreamingService, DreamingCollectionsService, StrategyPrefilterService],
})
export class DreamingModule {}
