import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DreamingModule } from '../dreaming/dreaming.module';
import { EmbeddingsModule } from '../embeddings';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { LlmModule } from '../llm/llm.module';
import { McpRegistryModule } from '../mcp-registry/mcp-registry.module';
import { MemoriesModule } from '../memories/memories.module';
import { WikiModule } from '../wiki/wiki.module';
import { AdaptiveMemoryAgent } from './agent/adaptive-memory-agent.service';
import { TaskFramingService } from './agent/task-framing.service';
import { AdaptiveMemoryConfigService } from './config/adaptive-memory-config.service';
import {
  RealKGAdapter,
  RealPreferencesAdapter,
  RealRAGAdapter,
  RealSORAdapter,
  RealWikiAdapter,
} from './adapters/real';
import {
  KG_ADAPTER,
  PREFERENCES_ADAPTER,
  RAG_ADAPTER,
  SOR_ADAPTER,
  WIKI_ADAPTER,
} from './adaptive-memory.tokens';
import { Packer } from './subagents/packer.service';
import { Picker } from './subagents/picker.service';
import { Ponderer } from './subagents/ponderer.service';
import { PersonalityStore } from './stores/personality.store';
import { ReviewQueueStore } from './stores/review-queue.store';
import { SessionsStore } from './stores/sessions.store';
import { SkillsStore } from './stores/skills.store';
import { AdaptiveMemoryController } from './adaptive-memory.controller';
import { RagModule } from '../rag/rag.module';

const CRON_PREFIX = 'adaptive_memory__ponderer__';

/**
 * Adaptive Memory module.
 *
 * Wires every subagent and store, binds adapter DI tokens to the real
 * implementations, and registers the Ponderer cron job for every opted-in
 * project on startup. "Opted in" = the per-project
 * `.etienne/adaptive-memory.config.json` file exists.
 *
 * Activation lifecycle:
 *   - On `onModuleInit`, scan the workspace and register a cron for each
 *     active project.
 *   - When settings are saved via the REST controller, the controller can
 *     ask the module to (re-)register the cron via `applyCron(project)`.
 *     POST settings is the activation gesture; DELETE deactivates and the
 *     module unregisters the cron via `removeCron(project)`.
 */
@Module({
  imports: [
    WikiModule,
    KnowledgeGraphModule,
    EmbeddingsModule.register(),
    MemoriesModule,
    LlmModule,
    RagModule,
    forwardRef(() => DreamingModule),
    McpRegistryModule.forRoot({
      providers: [{ kind: 'json-file' }],
      secrets: { keyVaultUrl: process.env.AZURE_KEY_VAULT_URL },
    }),
  ],
  controllers: [AdaptiveMemoryController],
  providers: [
    // Config
    AdaptiveMemoryConfigService,
    // Stores
    SessionsStore,
    SkillsStore,
    PersonalityStore,
    ReviewQueueStore,
    // Adapters — real implementations bound to the tokens.
    RealWikiAdapter,
    RealKGAdapter,
    RealRAGAdapter,
    RealSORAdapter,
    RealPreferencesAdapter,
    { provide: WIKI_ADAPTER, useExisting: RealWikiAdapter },
    { provide: KG_ADAPTER, useExisting: RealKGAdapter },
    { provide: RAG_ADAPTER, useExisting: RealRAGAdapter },
    { provide: SOR_ADAPTER, useExisting: RealSORAdapter },
    { provide: PREFERENCES_ADAPTER, useExisting: RealPreferencesAdapter },
    // Subagents
    TaskFramingService,
    Picker,
    Packer,
    Ponderer,
    AdaptiveMemoryAgent,
    // AdapterBundle is what AdaptiveMemoryAgent injects — a small object
    // shaped like AgentAdapters. We build it inline as a factory so the
    // agent doesn't have to know about adapter tokens.
    {
      provide: 'AgentAdapters',
      useFactory: (
        wiki: RealWikiAdapter,
        kg: RealKGAdapter,
        rag: RealRAGAdapter,
        preferences: RealPreferencesAdapter,
      ) => ({ wiki, kg, rag, preferences }),
      inject: [RealWikiAdapter, RealKGAdapter, RealRAGAdapter, RealPreferencesAdapter],
    },
  ],
  exports: [
    AdaptiveMemoryAgent,
    Ponderer,
    AdaptiveMemoryConfigService,
    ReviewQueueStore,
  ],
})
export class AdaptiveMemoryModule implements OnModuleInit {
  private readonly logger = new Logger(AdaptiveMemoryModule.name);

  constructor(
    private readonly scheduler: SchedulerRegistry,
    private readonly config: AdaptiveMemoryConfigService,
    private readonly ponderer: Ponderer,
  ) {}

  async onModuleInit(): Promise<void> {
    const active = await this.config.listActiveProjects();
    this.logger.log(
      `Adaptive Memory initialised; ${active.length} project(s) opted in: ${active.join(', ') || '(none)'}`,
    );
    for (const project of active) {
      try {
        await this.applyCron(project);
      } catch (err: any) {
        this.logger.warn(`Could not register Ponderer cron for ${project}: ${err.message}`);
      }
    }
  }

  /**
   * Register (or replace) the per-project Ponderer cron. Idempotent: a
   * subsequent settings save re-applies the schedule from the merged config.
   * Called from the controller on POST /settings.
   */
  async applyCron(project: string): Promise<void> {
    const name = this.cronName(project);
    try {
      this.scheduler.deleteCronJob(name);
    } catch {
      /* not registered */
    }
    if (!this.config.isActive(project)) {
      this.logger.log(`Adaptive Memory inactive for ${project} — no cron registered`);
      return;
    }
    const cfg = await this.config.get(project);
    const job = new CronJob(
      cfg.ponderer.schedule,
      () => {
        this.ponderer.run(project).catch((err) =>
          this.logger.warn(`Ponderer.run(${project}) failed: ${err.message}`),
        );
      },
      null,
      true,
      cfg.ponderer.timeZone,
    );
    this.scheduler.addCronJob(name, job);
    this.logger.log(
      `Registered Ponderer cron for ${project}: ${cfg.ponderer.schedule} (${cfg.ponderer.timeZone})`,
    );
  }

  /** Unregister the Ponderer cron for a project. Called from DELETE /settings. */
  removeCron(project: string): void {
    try {
      this.scheduler.deleteCronJob(this.cronName(project));
      this.logger.log(`Unregistered Ponderer cron for ${project}`);
    } catch {
      /* already gone */
    }
  }

  private cronName(project: string): string {
    return `${CRON_PREFIX}${project}`;
  }
}
