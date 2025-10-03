import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ContentManagementService } from './content-management.service';

@Controller('api/workspace')
export class ContentManagementController {
  constructor(private readonly contentManagementService: ContentManagementService) {}

  @Get(':project/files/*')
  async getFile(
    @Param('project') project: string,
    @Param('0') filepath: string,
    @Res() res: Response,
  ) {
    const { content, mimeType } = await this.contentManagementService.getFileContent(project, filepath);

    res.setHeader('Content-Type', mimeType);
    res.send(content);
  }
}
