import { Module } from '@nestjs/common';
import { InterceptorsController } from './interceptors.controller';
import { InterceptorsService } from './interceptors.service';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [SchedulerModule],
  controllers: [InterceptorsController],
  providers: [InterceptorsService],
  exports: [InterceptorsService],
})
export class InterceptorsModule {}
