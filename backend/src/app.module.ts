import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { ClaudeSdkService } from './claude/sdk/claude-sdk.service';
import { SdkSessionManagerService } from './claude/sdk/sdk-session-manager.service';
import { SdkHookEmitterService } from './claude/sdk/sdk-hook-emitter.service';
import { ClaudeSdkOrchestratorService } from './claude/sdk/claude-sdk-orchestrator.service';
import { MissionLoaderService } from './claude/mission-loader.service';
import { SdkPermissionService } from './claude/sdk/sdk-permission.service';
import { SdkPermissionController } from './claude/sdk/sdk-permission.controller';
import { CodexSdkService } from './claude/codex-sdk/codex-sdk.service';
import { CodexSdkOrchestratorService } from './claude/codex-sdk/codex-sdk-orchestrator.service';
import { CodexSessionManagerService } from './claude/codex-sdk/codex-session-manager.service';
import { OpenAIAgentsSdkService } from './claude/openai-agent-sdk/openai-agents-sdk.service';
import { OpenAIAgentsOrchestratorService } from './claude/openai-agent-sdk/openai-agents-orchestrator.service';
import { OpenAIAgentsSessionManagerService } from './claude/openai-agent-sdk/openai-agents-session-manager.service';
import { OpenAIAgentsPermissionService } from './claude/openai-agent-sdk/openai-agents-permission.service';
import { OpenAIAgentsPermissionController } from './claude/openai-agent-sdk/openai-agents-permission.controller';
import { PiMonoOrchestratorService } from './claude/pi-mono-sdk/pi-mono-orchestrator.service';
import { OpenCodeSdkService } from './claude/opencode-sdk/opencode-sdk.service';
import { OpenCodeOrchestratorService } from './claude/opencode-sdk/opencode-sdk-orchestrator.service';
import { OpenCodeSessionManagerService } from './claude/opencode-sdk/opencode-session-manager.service';
import { OpenCodePermissionService } from './claude/opencode-sdk/opencode-permission.service';
import { InterceptorsModule } from './interceptors/interceptors.module';
import { ContentManagementModule } from './content-management/content-management.module';
import { McpServerModule } from './mcpserver/mcp-server.module';
import { MemoriesModule } from './memories/memories.module';
import { BudgetMonitoringModule } from './budget-monitoring/budget-monitoring.module';
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
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module';
import { SearchModule } from './knowledge-graph/search/search.module';
import { SkillsModule } from './skills/skills.module';
import { TagsModule } from './tags/tags.module';
import { ContextsModule } from './contexts/contexts.module';
import { EventHandlingModule } from './event-handling/event-handling.module';
import { ScrapbookModule } from './scrapbook/scrapbook.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { QuickActionsModule } from './quick-actions/quick-actions.module';
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
import { AutoConfigurationModule } from './auto-configuration/auto-configuration.module';
import { IssuesModule } from './issues/issues.module';
import { PersonaManagerModule } from './persona-manager/persona-manager.module';
import { UserOrdersModule } from './user-orders/user-orders.module';
import { RecentItemsModule } from './recent-items/recent-items.module';
import { SseMultiplexModule } from './sse-multiplex/sse-multiplex.module';
import { SecretsManagerModule } from './secrets-manager/secrets-manager.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { EmbeddingsModule } from './embeddings';
import { HitlProtocolModule } from './hitl-protocol/hitl-protocol.module';
import { FoundryAdapterModule } from './foundry-adapter/foundry-adapter.module';
import { DreamingModule } from './dreaming/dreaming.module';
import { Ms365Module } from './ms365/ms365.module';
import { WikiModule } from './wiki/wiki.module';
import { AdaptiveMemoryModule } from './adaptive-memory/adaptive-memory.module';
import { ApplicationTypesModule } from './application-types/application-types.module';
import { PackagesModule } from './packages/packages.module';
import { FirstRunController } from './first-run/first-run.controller';
import { DiagnosticsRunnerService } from './first-run/diagnostics-runner.service';
import { SupportAgentService } from './first-run/support-agent/support-agent.service';
import { SeedRunnerService } from './first-run/seed-runner.service';
import { CHECK_PROVIDERS, CHECK_CLASSES } from './first-run/checks';

@Module({
  imports: [SecretsManagerModule, EmbeddingsModule.register(), AuthModule, LlmModule, TelemetryModule, InterceptorsModule, ContentManagementModule, McpServerModule, MemoriesModule, BudgetMonitoringModule, SchedulerModule, CheckpointsModule, GuardrailsModule, OutputGuardrailsModule, SessionsModule, SubagentsModule, ExternalEventsModule, DeepResearchModule, KnowledgeGraphModule, SearchModule, SkillsModule, TagsModule, ContextsModule, EventHandlingModule, ScrapbookModule, ConfigurationModule, QuickActionsModule, A2ASettingsModule, A2AClientModule, FeedbackModule, ProcessManagerModule, RemoteSessionsModule, McpRegistryModule.forRoot({ providers: [{ kind: 'json-file' }], secrets: { keyVaultUrl: process.env.AZURE_KEY_VAULT_URL } }), AgentRoleRegistryModule, ProjectsModule, ComplianceModule, CodingAgentConfigurationModule, StatefulWorkflowsModule, PreviewersModule, OntologyCoreModule, AgentBusModule, UserNotificationsModule, AutoConfigurationModule, IssuesModule, PersonaManagerModule, UserOrdersModule, RecentItemsModule, SseMultiplexModule, CollaborationModule, HitlProtocolModule, FoundryAdapterModule.register(), DreamingModule, Ms365Module, WikiModule, AdaptiveMemoryModule, ApplicationTypesModule, PackagesModule],
  controllers: [ClaudeController, SdkPermissionController, OpenAIAgentsPermissionController, FirstRunController],
  providers: [
    ClaudeService,
    ClaudeSdkService,
    SdkSessionManagerService,
    SdkHookEmitterService,
    ClaudeSdkOrchestratorService,
    MissionLoaderService,
    SdkPermissionService,
    CodexSdkService,
    CodexSdkOrchestratorService,
    CodexSessionManagerService,
    OpenAIAgentsSdkService,
    OpenAIAgentsOrchestratorService,
    OpenAIAgentsSessionManagerService,
    OpenAIAgentsPermissionService,
    PiMonoOrchestratorService,
    OpenCodeSdkService,
    OpenCodeOrchestratorService,
    OpenCodeSessionManagerService,
    OpenCodePermissionService,
    GuardrailsService,
    OutputGuardrailsService,
    CodingAgentConfigurationService,
    McpServerConfigService,
    SupportAgentService,
    SeedRunnerService,
    ...CHECK_PROVIDERS,
    {
      provide: DiagnosticsRunnerService,
      useFactory: (...checks: any[]) => new DiagnosticsRunnerService(checks),
      inject: [...CHECK_CLASSES],
    },
  ],
})
export class AppModule {}
