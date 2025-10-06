import { Module } from '@nestjs/common';
import { BudgetMonitoringController } from './budget-monitoring.controller';
import { BudgetMonitoringService } from './budget-monitoring.service';

@Module({
  controllers: [BudgetMonitoringController],
  providers: [BudgetMonitoringService],
  exports: [BudgetMonitoringService], // Export so it can be used in ClaudeService
})
export class BudgetMonitoringModule {}
