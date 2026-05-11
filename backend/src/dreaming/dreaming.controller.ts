import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { DreamingService } from './dreaming.service';
import { Roles } from '../auth/roles.decorator';
import { DreamFeedbackPayload, DreamingSettings } from './dto/dreaming-settings.dto';

@Controller('api/dreaming')
export class DreamingController {
  constructor(private readonly service: DreamingService) {}

  @Get(':project/settings')
  async getSettings(@Param('project') project: string) {
    return this.service.getSettings(project);
  }

  @Roles('user')
  @Post(':project/settings')
  async saveSettings(
    @Param('project') project: string,
    @Body() body: Partial<DreamingSettings>,
  ) {
    const settings = await this.service.saveSettings(project, body);
    return { success: true, settings };
  }

  @Get(':project/dreams')
  async listDreams(@Param('project') project: string) {
    return { dreams: await this.service.listDreamFiles(project) };
  }

  @Get(':project/dreams/:fileName')
  async readDream(
    @Param('project') project: string,
    @Param('fileName') fileName: string,
  ) {
    return this.service.readDreamFile(project, fileName);
  }

  @Roles('user')
  @Post(':project/dreams/:fileName/feedback')
  async submitFeedback(
    @Param('project') project: string,
    @Param('fileName') fileName: string,
    @Body() body: DreamFeedbackPayload,
  ) {
    const dream = await this.service.submitFeedback(project, fileName, body);
    return { success: true, dream };
  }

  @Roles('user')
  @Post(':project/run-now')
  async runNow(@Param('project') project: string) {
    return this.service.triggerRun(project);
  }

  /**
   * Server-Sent Events stream of dreaming pipeline progress for a project.
   * Browsers cannot set Authorization headers on EventSource; the frontend
   * passes the access token via ?token= and the JwtAuthGuard accepts it.
   */
  @Sse(':project/events')
  events(@Param('project') project: string): Observable<MessageEvent> {
    return this.service.getEventSubject(project).pipe(
      map((event) => ({ data: event, type: 'dreaming-event' } as MessageEvent)),
    );
  }
}
