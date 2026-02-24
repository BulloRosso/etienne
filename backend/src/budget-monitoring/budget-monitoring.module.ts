import { Module } from '@nestjs/common';
import { BudgetMonitoringController } from './budget-monitoring.controller';
import { BudgetMonitoringService } from './budget-monitoring.service';
import { EmailModule } from '../smtp-imap/email.module';

@Module({
  imports: [EmailModule],
  controllers: [BudgetMonitoringController],
  providers: [BudgetMonitoringService],
  exports: [BudgetMonitoringService], // Export so it can be used in ClaudeService
})
export class BudgetMonitoringModule {}
