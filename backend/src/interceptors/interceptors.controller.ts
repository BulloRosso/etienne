import { Controller, Get, Post, Body, Param, Headers, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { InterceptorsService } from './interceptors.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { GetInterceptorsDto } from './dto';

@Controller('api/interceptors')
export class InterceptorsController {
  constructor(
    private readonly svc: InterceptorsService,
    private readonly schedulerService: SchedulerService
  ) {}

  @Post('in')
  receiveInterceptor(
    @Headers('x-claude-code-project') project: string,
    @Body() data: any
  ) {
    if (!project) {
      return { success: false, error: 'Missing x-claude-code-project header' };
    }
    return this.svc.addInterceptor(project, data);
  }

  @Get('hooks/:project')
  getHooks(@Param('project') project: string) {
    return { project, hooks: this.svc.getHooks(project) };
  }

  @Get('events/:project')
  getEvents(@Param('project') project: string) {
    return { project, events: this.svc.getEvents(project) };
  }

  @Sse('stream/:project')
  streamInterceptors(@Param('project') project: string): Observable<MessageEvent> {
    return this.svc.getSubject(project).asObservable().pipe(
      map((event) => ({
        type: 'interceptor',
        data: event
      } as any))
    );
  }

  @Get('chat/:project')
  checkChatRefresh(@Param('project') project: string) {
    const needsRefresh = this.schedulerService.checkChatRefresh(project);
    if (needsRefresh) {
      this.schedulerService.clearChatRefresh(project);
    }
    return { needsRefresh };
  }
}
