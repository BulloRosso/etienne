import { Controller, Get, Param } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { safeRoot } from '../claude/utils/path.utils';

@Controller('api/sessions')
export class SessionsController {
  private readonly hostRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(private readonly sessionsService: SessionsService) {}

  @Get(':projectname')
  async getSessions(@Param('projectname') projectname: string): Promise<any> {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      const sessionsData = await this.sessionsService.getSessionsWithSummaries(projectRoot);

      return {
        success: true,
        sessions: sessionsData.sessions.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        sessions: []
      };
    }
  }

  @Get(':projectname/:sessionId/history')
  async getSessionHistory(
    @Param('projectname') projectname: string,
    @Param('sessionId') sessionId: string
  ): Promise<any> {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      const messages = await this.sessionsService.loadSessionHistory(projectRoot, sessionId);

      return {
        success: true,
        messages
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        messages: []
      };
    }
  }
}
