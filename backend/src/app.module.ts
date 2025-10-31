import { Module } from '@nestjs/common';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { InterceptorsModule } from './interceptors/interceptors.module';
import { ContentManagementModule } from './content-management/content-management.module';
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
import { SessionsModule } from './sessions/sessions.module';
import { SubagentsModule } from './subagents/subagents.module';
import { ExternalEventsModule } from './external-events/external-events.module';
import { DeepResearchModule } from './deep-research/deep-research.module';

@Module({
  imports: [InterceptorsModule, ContentManagementModule, McpServerModule, MemoriesModule, BudgetMonitoringModule, SchedulerModule, CheckpointsModule, GuardrailsModule, OutputGuardrailsModule, SessionsModule, SubagentsModule, ExternalEventsModule, DeepResearchModule],
  controllers: [ClaudeController],
  providers: [ClaudeService, BudgetMonitoringService, GuardrailsService, OutputGuardrailsService],
})
export class AppModule {}
