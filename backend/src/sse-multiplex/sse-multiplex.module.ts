import { Module } from '@nestjs/common';
import { SseMultiplexController } from './sse-multiplex.controller';
import { InterceptorsModule } from '../interceptors/interceptors.module';
import { DeepResearchModule } from '../deep-research/deep-research.module';
import { BudgetMonitoringModule } from '../budget-monitoring/budget-monitoring.module';
import { EventHandlingModule } from '../event-handling/event-handling.module';
import { Ms365Module } from '../ms365/ms365.module';
import { RequirementsTrackingModule } from '../requirements-tracking/requirements-tracking.module';

@Module({
  imports: [InterceptorsModule, DeepResearchModule, BudgetMonitoringModule, EventHandlingModule, Ms365Module, RequirementsTrackingModule],
  controllers: [SseMultiplexController],
})
export class SseMultiplexModule {}
