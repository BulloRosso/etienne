import { Module } from '@nestjs/common';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { InterceptorsController } from './interceptors/interceptors.controller';
import { InterceptorsService } from './interceptors/interceptors.service';
import { ContentManagementModule } from './content-management/content-management.module';
import { ModelProxyModule } from './modelproxy/modelproxy.module';
import { McpServerModule } from './mcpserver/mcp-server.module';
import { MemoriesModule } from './memories/memories.module';
import { BudgetMonitoringModule } from './budget-monitoring/budget-monitoring.module';
import { BudgetMonitoringService } from './budget-monitoring/budget-monitoring.service';
import { SchedulerModule } from './scheduler/scheduler.module';
import { CheckpointsModule } from './checkpoints/checkpoints.module';
import { GuardrailsModule } from './input-guardrails/guardrails.module';
import { GuardrailsService } from './input-guardrails/guardrails.service';
import { OutputGuardrailsModule } from './output-guardrails/output-guardrails.module';
import { OutputGuardrailsService } from './output-guardrails/output-guardrails.service';

@Module({
  imports: [ContentManagementModule, ModelProxyModule, McpServerModule, MemoriesModule, BudgetMonitoringModule, SchedulerModule, CheckpointsModule, GuardrailsModule, OutputGuardrailsModule],
  controllers: [ClaudeController, InterceptorsController],
  providers: [ClaudeService, InterceptorsService, BudgetMonitoringService, GuardrailsService, OutputGuardrailsService],
})
export class AppModule {}
