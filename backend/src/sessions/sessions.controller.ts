import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { safeRoot } from '../claude/utils/path.utils';
import { Roles } from '../auth/roles.decorator';

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

  @Get(':projectname/:sessionId/context')
  async getActiveContext(
    @Param('projectname') projectname: string,
    @Param('sessionId') sessionId: string
  ): Promise<any> {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      const contextId = await this.sessionsService.getActiveContext(projectRoot, sessionId);

      return {
        success: true,
        contextId
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        contextId: null
      };
    }
  }

  @Roles('user')
  @Post(':projectname/:sessionId/context')
  async setActiveContext(
    @Param('projectname') projectname: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { contextId: string | null }
  ): Promise<any> {
    try {
      const projectRoot = safeRoot(this.hostRoot, projectname);
      await this.sessionsService.setActiveContext(projectRoot, sessionId, body.contextId);

      return {
        success: true,
        contextId: body.contextId
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
