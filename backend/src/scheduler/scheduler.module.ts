import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { TaskStorageService } from './task-storage.service';
import { BudgetMonitoringModule } from '../budget-monitoring/budget-monitoring.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BudgetMonitoringModule,
  ],
  controllers: [SchedulerController],
  providers: [
    SchedulerService,
    TaskStorageService,
  ],
  exports: [SchedulerService],
})
export class SchedulerModule {}
