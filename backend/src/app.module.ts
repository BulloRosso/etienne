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

@Module({
  imports: [ContentManagementModule, ModelProxyModule, McpServerModule, MemoriesModule, BudgetMonitoringModule, SchedulerModule, CheckpointsModule, GuardrailsModule],
  controllers: [ClaudeController, InterceptorsController],
  providers: [ClaudeService, InterceptorsService, BudgetMonitoringService],
})
export class AppModule {}
