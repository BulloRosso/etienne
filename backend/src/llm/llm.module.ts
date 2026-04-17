import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { BudgetMonitoringModule } from '../budget-monitoring/budget-monitoring.module';

@Global()
@Module({
  imports: [BudgetMonitoringModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
