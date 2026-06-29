import { Controller, Get, Post, Body, Param, Query, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { BudgetMonitoringService, BudgetSettings } from './budget-monitoring.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/budget-monitoring')
export class BudgetMonitoringController {
  constructor(private readonly service: BudgetMonitoringService) {}

  @Get('global/current')
  async getGlobalCosts() {
    return this.service.getGlobalCosts();
  }

  @Get(':project/current')
  async getCurrentCosts(@Param('project') project: string) {
    return this.service.getCurrentCosts(project);
  }

  @Get(':project/all')
  async getAllCosts(@Param('project') project: string) {
    return this.service.getAllCosts(project);
  }

  @Get(':project/daily')
  async getDailyCosts(
    @Param('project') project: string,
    @Query('days') days?: string,
  ) {
    return this.service.getDailyCosts(project, days ? parseInt(days, 10) : 30);
  }

  @Get(':project/top-sessions')
  async getTopSessions(
    @Param('project') project: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getTopSessions(project, limit ? parseInt(limit, 10) : 3);
  }

  @Get(':project/settings')
  async getSettings(@Param('project') project: string) {
    return this.service.getSettings(project);
  }

  @Roles('user')
  @Post(':project/settings')
  async saveSettings(
    @Param('project') project: string,
    @Body() body: { enabled: boolean; limit: number; resetCounters?: boolean; notificationEmail?: string }
  ) {
    await this.service.saveSettings(project, {
      enabled: body.enabled,
      limit: body.limit,
      notificationEmail: body.notificationEmail,
    });

    if (body.resetCounters) {
      await this.service.resetAllCosts();
    }

    return { success: true };
  }

  @Sse(':project/stream')
  stream(@Param('project') project: string): Observable<MessageEvent> {
    return this.service.getSubject(project).pipe(
      map((event) => ({
        data: event,
        type: 'budget-update'
      } as MessageEvent))
    );
  }
}
