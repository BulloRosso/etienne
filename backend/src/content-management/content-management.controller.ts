import { Controller, Get, Post, Delete, Put, Param, Res, Body, UploadedFile, UseInterceptors, Query, Inject, Optional } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContentManagementService } from './content-management.service';
import { TagsService } from '../tags/tags.service';

@Controller('api/workspace')
export class ContentManagementController {
  constructor(
    private readonly contentManagementService: ContentManagementService,
    @Optional() @Inject(TagsService) private readonly tagsService?: TagsService,
  ) {}

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

  @Delete(':project/files/*')
  async deleteFile(
    @Param('project') project: string,
    @Param('0') filepath: string,
  ) {
    const result = await this.contentManagementService.deleteFileOrFolder(project, filepath);

    // Sync tags: remove file from tags
    if (this.tagsService) {
      await this.tagsService.deleteFile(project, filepath);
    }

    return result;
  }

  @Post(':project/files/move')
  async moveFile(
    @Param('project') project: string,
    @Body() body: { sourcePath: string; destinationPath: string }
  ) {
    const result = await this.contentManagementService.moveFileOrFolder(
      project,
      body.sourcePath,
      body.destinationPath
    );

    // Sync tags: update file path
    if (this.tagsService) {
      await this.tagsService.renameFile(project, body.sourcePath, body.destinationPath);
    }

    return result;
  }

  @Put(':project/files/rename')
  async renameFile(
    @Param('project') project: string,
    @Body() body: { filepath: string; newName: string }
  ) {
    const result = await this.contentManagementService.renameFileOrFolder(
      project,
      body.filepath,
      body.newName
    );

    // Sync tags: rename file path
    if (this.tagsService && result.newPath) {
      await this.tagsService.renameFile(project, body.filepath, result.newPath);
    }

    return result;
  }

  @Post(':project/files/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('project') project: string,
    @Body() body: { filepath: string },
    @UploadedFile() file: Express.Multer.File
  ) {
    return await this.contentManagementService.uploadFile(
      project,
      body.filepath,
      file.buffer
    );
  }

  @Post(':project/files/create-folder')
  async createFolder(
    @Param('project') project: string,
    @Body() body: { folderPath: string }
  ) {
    return await this.contentManagementService.createFolder(
      project,
      body.folderPath
    );
  }

  @Post(':project/attachments/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('project') project: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    const filepath = `.attachments/${file.originalname}`;
    return await this.contentManagementService.uploadFile(
      project,
      filepath,
      file.buffer
    );
  }

  @Get(':project/user-interface')
  async getUserInterface(@Param('project') project: string, @Res() res: Response) {
    const config = await this.contentManagementService.getUserInterfaceConfig(project);
    return res.json(config);
  }

  @Post(':project/user-interface')
  async saveUserInterface(
    @Param('project') project: string,
    @Body() config: any
  ) {
    return await this.contentManagementService.saveUserInterfaceConfig(project, config);
  }

  @Get('projects-with-ui')
  async getProjectsWithUI() {
    return await this.contentManagementService.listProjectsWithUIConfig();
  }

  @Get(':project/project-history')
  async getProjectHistory(@Param('project') project: string, @Res() res: Response) {
    const content = await this.contentManagementService.getProjectHistory(project);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  }

  @Post(':project/project-history')
  async appendProjectHistory(
    @Param('project') project: string,
    @Body() body: { content: string }
  ) {
    return await this.contentManagementService.appendProjectHistory(project, body.content);
  }

  @Get(':project/search-files')
  async searchFiles(
    @Param('project') project: string,
    @Query('query') query: string
  ) {
    return await this.contentManagementService.searchFiles(project, query || '');
  }

  @Get(':project/workbench')
  async getWorkbench(@Param('project') project: string, @Res() res: Response) {
    const config = await this.contentManagementService.getWorkbenchConfig(project);
    return res.json(config);
  }

  @Post(':project/workbench')
  async saveWorkbench(
    @Param('project') project: string,
    @Body() config: any
  ) {
    return await this.contentManagementService.saveWorkbenchConfig(project, config);
  }
}
