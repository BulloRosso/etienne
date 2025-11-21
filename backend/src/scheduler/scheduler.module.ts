import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { TaskStorageService } from './task-storage.service';
import { ClaudeSdkOrchestratorService } from '../claude/sdk/claude-sdk-orchestrator.service';
import { ClaudeSdkService } from '../claude/sdk/claude-sdk.service';
import { SdkSessionManagerService } from '../claude/sdk/sdk-session-manager.service';
import { SdkHookEmitterService } from '../claude/sdk/sdk-hook-emitter.service';
import { GuardrailsModule } from '../input-guardrails/guardrails.module';
import { OutputGuardrailsModule } from '../output-guardrails/output-guardrails.module';
import { SessionsModule } from '../sessions/sessions.module';
import { InterceptorsModule } from '../interceptors/interceptors.module';
import { BudgetMonitoringModule } from '../budget-monitoring/budget-monitoring.module';
import { ContextsModule } from '../contexts/contexts.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    GuardrailsModule,
    OutputGuardrailsModule,
    SessionsModule,
    forwardRef(() => InterceptorsModule),
    BudgetMonitoringModule,
    ContextsModule
  ],
  controllers: [SchedulerController],
  providers: [
    SchedulerService,
    TaskStorageService,
    ClaudeSdkOrchestratorService,
    ClaudeSdkService,
    SdkSessionManagerService,
    SdkHookEmitterService
  ],
  exports: [SchedulerService],
})
export class SchedulerModule {}
