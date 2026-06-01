import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { QAEntry, QAndAService, UserSummary } from './q-and-a.service';

function getUsername(req: Request): string {
  const u = (req as any).user?.username;
  if (!u || typeof u !== 'string') {
    throw new Error('No authenticated user');
  }
  return u;
}

@Controller('api/q-and-a')
export class QAndAController {
  constructor(private readonly qAndAService: QAndAService) {}

  @Roles('guest')
  @Get(':project/unacknowledged-count')
  async unackedCount(
    @Param('project') project: string,
    @Req() req: Request,
  ): Promise<{ count: number }> {
    const username = getUsername(req);
    const count = await this.qAndAService.unacknowledgedCount(project, username);
    return { count };
  }

  @Roles('guest')
  @Get(':project')
  async getMine(
    @Param('project') project: string,
    @Req() req: Request,
  ): Promise<{ exists: boolean; entries: QAEntry[]; path: string }> {
    const username = getUsername(req);
    return this.qAndAService.readForUser(project, username);
  }

  @Roles('guest')
  @Post(':project/question')
  async appendQuestion(
    @Param('project') project: string,
    @Req() req: Request,
    @Body() body: { context: string; question: string },
  ): Promise<{ success: true; entry: QAEntry }> {
    const username = getUsername(req);
    return this.qAndAService.appendQuestion(project, username, {
      context: body?.context ?? '',
      question: body?.question ?? '',
    });
  }

  @Roles('guest')
  @Post(':project/acknowledge/:entryId')
  async acknowledge(
    @Param('project') project: string,
    @Param('entryId') entryId: string,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    const username = getUsername(req);
    return this.qAndAService.acknowledge(project, username, entryId);
  }

  @Roles('user')
  @Get(':project/expert/users')
  async listUsers(@Param('project') project: string): Promise<{ users: UserSummary[] }> {
    const users = await this.qAndAService.listAllUsers(project);
    return { users };
  }

  @Roles('user')
  @Get(':project/expert/:targetUsername')
  async readTarget(
    @Param('project') project: string,
    @Param('targetUsername') targetUsername: string,
  ): Promise<{ exists: boolean; entries: QAEntry[]; path: string; targetUsername: string }> {
    return this.qAndAService.readForTarget(project, targetUsername);
  }

  @Roles('user')
  @Put(':project/expert/:targetUsername/:entryId/answer')
  async writeAnswer(
    @Param('project') project: string,
    @Param('targetUsername') targetUsername: string,
    @Param('entryId') entryId: string,
    @Body() body: { answer: string },
  ): Promise<{ success: true; entry: QAEntry }> {
    return this.qAndAService.writeAnswer(project, targetUsername, entryId, body?.answer ?? '');
  }
}
