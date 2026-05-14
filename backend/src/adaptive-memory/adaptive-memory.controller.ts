import {
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { ReviewVerdict } from '../memory/types';
import {
  AdaptiveMemoryAgent,
  AdaptiveMemoryInactiveError,
  type RunTaskResult,
} from './agent/adaptive-memory-agent.service';
import {
  AdaptiveMemoryConfigService,
  type AdaptiveMemoryConfig,
} from './config/adaptive-memory-config.service';
import { Ponderer, type PondererReport } from './subagents/ponderer.service';
import { ReviewQueueStore } from './stores/review-queue.store';
import { AdaptiveMemoryModule } from './adaptive-memory.module';

/**
 * REST entry point for Adaptive Memory.
 *
 * All endpoints are gated by `AdaptiveMemoryConfigService.isActive(project)`
 * except the settings endpoints themselves. Settings POST is the activation
 * gesture (creates the per-project config file); settings DELETE deactivates.
 */
@Controller('api/adaptive-memory')
export class AdaptiveMemoryController {
  constructor(
    private readonly agent: AdaptiveMemoryAgent,
    private readonly ponderer: Ponderer,
    private readonly config: AdaptiveMemoryConfigService,
    private readonly reviewQueue: ReviewQueueStore,
    @Inject(forwardRef(() => AdaptiveMemoryModule))
    private readonly mod: AdaptiveMemoryModule,
  ) {}

  // --- within-task ---------------------------------------------------------

  @Post(':project/task')
  @Roles('user')
  async runTask(
    @Param('project') project: string,
    @Body() body: { prompt: string },
  ): Promise<RunTaskResult> {
    if (!body?.prompt || typeof body.prompt !== 'string') {
      throw new HttpException(
        'prompt is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.agent.runTask(project, body.prompt);
    } catch (err: any) {
      if (err instanceof AdaptiveMemoryInactiveError) {
        throw new HttpException(
          {
            error: 'adaptive_memory_inactive',
            project,
            hint: 'create .etienne/adaptive-memory.config.json via POST /api/adaptive-memory/:project/settings',
          },
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        `runTask failed: ${err.message ?? err}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // --- between-task --------------------------------------------------------

  @Post(':project/run-now')
  @Roles('user')
  async runPondererNow(@Param('project') project: string): Promise<PondererReport> {
    if (!this.config.isActive(project)) {
      throw new HttpException(
        { error: 'adaptive_memory_inactive', project },
        HttpStatus.CONFLICT,
      );
    }
    try {
      return await this.ponderer.run(project);
    } catch (err: any) {
      throw new HttpException(
        `ponderer run failed: ${err.message ?? err}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // --- review queue --------------------------------------------------------

  @Get(':project/review')
  @Roles('user')
  async listReview(@Param('project') project: string) {
    return this.reviewQueue.listByProject(project);
  }

  @Post(':project/review/:itemId/verdict')
  @Roles('user')
  async setVerdict(
    @Param('project') project: string,
    @Param('itemId') itemId: string,
    @Body() body: { verdict: ReviewVerdict },
  ): Promise<{ ok: true }> {
    const valid: ReviewVerdict[] = ['pending', 'good', 'badly_reasoned', 'unusable'];
    if (!valid.includes(body?.verdict)) {
      throw new HttpException(
        `verdict must be one of ${valid.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.reviewQueue.setVerdict(project, itemId, body.verdict);
    return { ok: true };
  }

  @Get('cycles')
  @Roles('user')
  async cyclesSummary() {
    return this.reviewQueue.cyclesSummary();
  }

  // --- settings (activation) ----------------------------------------------

  @Get(':project/settings')
  @Roles('user')
  async getSettings(
    @Param('project') project: string,
  ): Promise<{ active: boolean; config: AdaptiveMemoryConfig | null }> {
    const config = await this.config.peek(project);
    return { active: this.config.isActive(project), config };
  }

  @Post(':project/settings')
  @Roles('user')
  async saveSettings(
    @Param('project') project: string,
    @Body() body: Partial<AdaptiveMemoryConfig>,
  ): Promise<{ active: true; config: AdaptiveMemoryConfig }> {
    const config = await this.config.save(project, body ?? {});
    // Saving settings is the activation gesture; (re-)register the cron with
    // the new schedule.
    await this.mod.applyCron(project).catch(() => {});
    return { active: true, config };
  }

  @Delete(':project/settings')
  @Roles('user')
  async deactivate(
    @Param('project') project: string,
  ): Promise<{ deactivated: boolean }> {
    const r = await this.config.deactivate(project);
    // Removing the config file deactivates the module for this project;
    // unregister the cron so it can't fire.
    this.mod.removeCron(project);
    return r;
  }
}
