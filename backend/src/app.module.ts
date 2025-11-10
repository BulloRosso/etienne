import { Module } from '@nestjs/common';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { ClaudeSdkService } from './claude/sdk/claude-sdk.service';
import { SdkSessionManagerService } from './claude/sdk/sdk-session-manager.service';
import { SdkHookEmitterService } from './claude/sdk/sdk-hook-emitter.service';
import { ClaudeSdkOrchestratorService } from './claude/sdk/claude-sdk-orchestrator.service';
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
import { SessionsService } from './sessions/sessions.service';
import { SubagentsModule } from './subagents/subagents.module';
import { ExternalEventsModule } from './external-events/external-events.module';
import { DeepResearchModule } from './deep-research/deep-research.module';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module';
import { SearchModule } from './knowledge-graph/search/search.module';

@Module({
  imports: [InterceptorsModule, ContentManagementModule, McpServerModule, MemoriesModule, BudgetMonitoringModule, SchedulerModule, CheckpointsModule, GuardrailsModule, OutputGuardrailsModule, SessionsModule, SubagentsModule, ExternalEventsModule, DeepResearchModule, KnowledgeGraphModule, SearchModule],
  controllers: [ClaudeController],
  providers: [
    ClaudeService,
    ClaudeSdkService,
    SdkSessionManagerService,
    SdkHookEmitterService,
    ClaudeSdkOrchestratorService,
    BudgetMonitoringService,
    GuardrailsService,
    OutputGuardrailsService,
    SessionsService
  ],
})
export class AppModule {}
