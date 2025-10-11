import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { TaskStorageService } from './task-storage.service';
import { ClaudeService } from '../claude/claude.service';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';
import { GuardrailsModule } from '../input-guardrails/guardrails.module';
import { OutputGuardrailsModule } from '../output-guardrails/output-guardrails.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ScheduleModule.forRoot(), GuardrailsModule, OutputGuardrailsModule, SessionsModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, TaskStorageService, ClaudeService, BudgetMonitoringService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
