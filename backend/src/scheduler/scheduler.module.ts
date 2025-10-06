import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { TaskStorageService } from './task-storage.service';
import { ClaudeService } from '../claude/claude.service';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SchedulerController],
  providers: [SchedulerService, TaskStorageService, ClaudeService, BudgetMonitoringService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
