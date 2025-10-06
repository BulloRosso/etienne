import { Controller, Get, Post, Body, Param, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { BudgetMonitoringService, BudgetSettings } from './budget-monitoring.service';

@Controller('api/budget-monitoring')
export class BudgetMonitoringController {
  constructor(private readonly service: BudgetMonitoringService) {}

  @Get(':project/current')
  async getCurrentCosts(@Param('project') project: string) {
    return this.service.getCurrentCosts(project);
  }

  @Get(':project/all')
  async getAllCosts(@Param('project') project: string) {
    return this.service.getAllCosts(project);
  }

  @Get(':project/settings')
  async getSettings(@Param('project') project: string) {
    return this.service.getSettings(project);
  }

  @Post(':project/settings')
  async saveSettings(
    @Param('project') project: string,
    @Body() settings: BudgetSettings
  ) {
    await this.service.saveSettings(project, settings);
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
