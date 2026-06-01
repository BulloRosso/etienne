import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { Cheatsheet, CheatsheetService, ExtractedItem } from './cheatsheet.service';

function getUsername(req: Request): string {
  const u = (req as any).user?.username;
  if (!u || typeof u !== 'string') {
    throw new Error('No authenticated user');
  }
  return u;
}

@Controller('api/cheatsheet')
export class CheatsheetController {
  constructor(private readonly cheatsheetService: CheatsheetService) {}

  @Roles('guest')
  @Post('extract')
  async extract(
    @Body() body: { bubbleText: string; existingCheatsheet?: Cheatsheet | null },
  ): Promise<ExtractedItem> {
    const bubbleText = (body?.bubbleText || '').toString();
    return this.cheatsheetService.extractItem(bubbleText, body?.existingCheatsheet ?? null);
  }

  @Roles('guest')
  @Get(':project')
  async get(
    @Param('project') project: string,
    @Req() req: Request,
  ): Promise<{ exists: boolean; cheatsheet: Cheatsheet; path: string }> {
    const username = getUsername(req);
    return this.cheatsheetService.readForUser(project, username);
  }

  @Roles('guest')
  @Put(':project')
  async put(
    @Param('project') project: string,
    @Req() req: Request,
    @Body() body: { cheatsheet: Cheatsheet },
  ): Promise<{ success: true; path: string }> {
    const username = getUsername(req);
    return this.cheatsheetService.writeForUser(project, username, body?.cheatsheet ?? { groups: [] });
  }
}
