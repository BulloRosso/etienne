import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { GraphClientService } from './graph-client.service';
import {
  DEFAULT_OBSERVER_CONFIG,
  ObserverConfig,
  TeamsChannelSyncService,
  slugify,
} from './teams-channel-sync.service';
import { PutObserverChannelsDto } from './dto/teams-observer.dto';

/**
 * REST surface for the Teams channel observer: team/channel pickers,
 * per-project observed-channel config, and sync control.
 * Auth: default JWT guard (deliberately not @Public).
 */
@Controller('api/msteams-observer')
export class TeamsObserverController {
  constructor(
    private readonly graph: GraphClientService,
    private readonly sync: TeamsChannelSyncService,
  ) {}

  @Get(':project/teams')
  async listTeams(@Param('project') project: string) {
    const teams = await this.graph.listJoinedTeams(project);
    return teams.map((t) => ({ id: t.id, displayName: t.displayName }));
  }

  @Get(':project/teams/:teamId/channels')
  async listChannels(@Param('project') project: string, @Param('teamId') teamId: string) {
    const channels = await this.graph.listChannels(project, teamId);
    return channels.map((c) => ({ id: c.id, displayName: c.displayName, membershipType: c.membershipType }));
  }

  @Get(':project/channels')
  async getChannels(@Param('project') project: string) {
    return this.sync.loadConfigOrDefault(project);
  }

  @Put(':project/channels')
  async putChannels(@Param('project') project: string, @Body() body: PutObserverChannelsDto) {
    const existing = await this.sync.loadConfigOrDefault(project);
    const usedSlugs = new Set<string>();
    const channels = body.channels.map((ch) => {
      let slug = ch.slug || slugify(`${ch.teamName}--${ch.channelName}`);
      let candidate = slug;
      let i = 2;
      while (usedSlugs.has(candidate)) candidate = `${slug}-${i++}`;
      usedSlugs.add(candidate);
      return { ...ch, slug: candidate };
    });

    const cfg: ObserverConfig = {
      ...DEFAULT_OBSERVER_CONFIG,
      ...existing,
      enabled: body.enabled,
      syncIntervalSec: body.syncIntervalSec ?? existing.syncIntervalSec,
      refreshWindowHours: body.refreshWindowHours ?? existing.refreshWindowHours,
      downloadHostedContent: body.downloadHostedContent ?? existing.downloadHostedContent,
      backfillDays: body.backfillDays ?? existing.backfillDays,
      channels,
    };
    await this.sync.saveConfig(project, cfg);

    if (cfg.enabled && cfg.channels.length > 0) {
      // Restart to pick up a changed interval/channel set.
      this.sync.stopPolling(project);
      this.sync.startPolling(project);
    } else {
      this.sync.stopPolling(project);
    }
    return cfg;
  }

  @Post(':project/sync-now')
  async syncNow(@Param('project') project: string) {
    const results = await this.sync.syncNow(project);
    return { ok: true, channels: results };
  }

  @Get(':project/status')
  async status(@Param('project') project: string) {
    return this.sync.getStatus(project);
  }
}
