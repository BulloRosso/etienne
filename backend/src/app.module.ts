import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { ClaudeSdkService } from './claude/sdk/claude-sdk.service';
import { SdkSessionManagerService } from './claude/sdk/sdk-session-manager.service';
import { SdkHookEmitterService } from './claude/sdk/sdk-hook-emitter.service';
import { ClaudeSdkOrchestratorService } from './claude/sdk/claude-sdk-orchestrator.service';
import { SdkPermissionService } from './claude/sdk/sdk-permission.service';
import { SdkPermissionController } from './claude/sdk/sdk-permission.controller';
import { CodexSdkService } from './claude/codex-sdk/codex-sdk.service';
import { CodexSdkOrchestratorService } from './claude/codex-sdk/codex-sdk-orchestrator.service';
import { CodexSessionManagerService } from './claude/codex-sdk/codex-session-manager.service';
import { CodexPermissionService } from './claude/codex-sdk/codex-permission.service';
import { CodexPermissionController } from './claude/codex-sdk/codex-permission.controller';
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
import { SkillsModule } from './skills/skills.module';
import { TagsModule } from './tags/tags.module';
import { ContextsModule } from './contexts/contexts.module';
import { EventHandlingModule } from './event-handling/event-handling.module';
import { ScrapbookModule } from './scrapbook/scrapbook.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { A2ASettingsModule } from './a2a-settings/a2a-settings.module';
import { A2AClientModule } from './a2a-client/a2a-client.module';
import { TelemetryModule } from './observability/telemetry.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ProcessManagerModule } from './process-manager/process-manager.module';
import { RemoteSessionsModule } from './remote-sessions/remote-sessions.module';
import { McpRegistryModule } from './mcp-registry/mcp-registry.module';
import { AgentRoleRegistryModule } from './agent-role-registry/agent-role-registry.module';
import { ProjectsModule } from './projects/projects.module';
import { ComplianceModule } from './compliance/compliance.module';
import { CodingAgentConfigurationModule } from './coding-agent-configuration/coding-agent-configuration.module';
import { CodingAgentConfigurationService } from './coding-agent-configuration/coding-agent-configuration.service';
import { McpServerConfigService } from './claude/mcpserverconfig/mcp.server.config';
import { LlmModule } from './llm/llm.module';
import { StatefulWorkflowsModule } from './stateful-workflows/stateful-workflows.module';
import { PreviewersModule } from './previewers/previewers.module';
import { OntologyCoreModule } from './ontology-core/ontology-core.module';
import { AgentBusModule } from './agent-bus/agent-bus.module';
import { UserNotificationsModule } from './user-notifications/user-notifications.module';

@Module({
  imports: [AuthModule, LlmModule, TelemetryModule, InterceptorsModule, ContentManagementModule, McpServerModule, MemoriesModule, BudgetMonitoringModule, SchedulerModule, CheckpointsModule, GuardrailsModule, OutputGuardrailsModule, SessionsModule, SubagentsModule, ExternalEventsModule, DeepResearchModule, KnowledgeGraphModule, SearchModule, SkillsModule, TagsModule, ContextsModule, EventHandlingModule, ScrapbookModule, ConfigurationModule, A2ASettingsModule, A2AClientModule, FeedbackModule, ProcessManagerModule, RemoteSessionsModule, McpRegistryModule, AgentRoleRegistryModule, ProjectsModule, ComplianceModule, CodingAgentConfigurationModule, StatefulWorkflowsModule, PreviewersModule, OntologyCoreModule, AgentBusModule, UserNotificationsModule],
  controllers: [ClaudeController, SdkPermissionController, CodexPermissionController],
  providers: [
    ClaudeService,
    ClaudeSdkService,
    SdkSessionManagerService,
    SdkHookEmitterService,
    ClaudeSdkOrchestratorService,
    SdkPermissionService,
    CodexSdkService,
    CodexSdkOrchestratorService,
    CodexSessionManagerService,
    CodexPermissionService,
    BudgetMonitoringService,
    GuardrailsService,
    OutputGuardrailsService,
    SessionsService,
    CodingAgentConfigurationService,
    McpServerConfigService
  ],
})
export class AppModule {}
