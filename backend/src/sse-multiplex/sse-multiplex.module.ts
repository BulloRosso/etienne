import { Module } from '@nestjs/common';
import { SseMultiplexController } from './sse-multiplex.controller';
import { InterceptorsModule } from '../interceptors/interceptors.module';
import { DeepResearchModule } from '../deep-research/deep-research.module';
import { BudgetMonitoringModule } from '../budget-monitoring/budget-monitoring.module';
import { EventHandlingModule } from '../event-handling/event-handling.module';

@Module({
  imports: [InterceptorsModule, DeepResearchModule, BudgetMonitoringModule, EventHandlingModule],
  controllers: [SseMultiplexController],
})
export class SseMultiplexModule {}
