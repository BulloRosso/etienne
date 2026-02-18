import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TagsService, TagInfo } from './tags.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/workspace/:projectName/tags')
export class TagsController {
  private readonly logger = new Logger(TagsController.name);

  constructor(private readonly tagsService: TagsService) {}

  /**
   * GET /api/workspace/:project/tags
   * Get all tags for a project with usage counts
   */
  @Get()
  async getAllTags(@Param('projectName') projectName: string): Promise<TagInfo[]> {
    this.logger.log(`Getting all tags for project: ${projectName}`);
    return this.tagsService.getAllTags(projectName);
  }

  /**
   * GET /api/workspace/:project/tags/file
   * Get tags for a specific file
   * Query param: path (file path)
   */
  @Get('file')
  async getFileTags(
    @Param('projectName') projectName: string,
    @Query('path') filePath: string,
  ): Promise<{ path: string; tags: string[] }> {
    this.logger.log(`Getting tags for file: ${filePath} in project: ${projectName}`);
    const tags = await this.tagsService.getFileTags(projectName, filePath);
    return { path: filePath, tags };
  }

  /**
   * GET /api/workspace/:project/tags/files
   * Get all files that have a specific tag
   * Query param: tag
   */
  @Get('files')
  async getFilesByTag(
    @Param('projectName') projectName: string,
    @Query('tag') tag: string,
  ): Promise<{ tag: string; files: string[] }> {
    this.logger.log(`Getting files with tag: ${tag} in project: ${projectName}`);
    const files = await this.tagsService.getFilesByTag(projectName, tag);
    return { tag, files };
  }

  /**
   * POST /api/workspace/:project/tags/file
   * Add tags to a file
   * Body: { path: string, tags: string[] }
   */
  @Roles('user')
  @Post('file')
  @HttpCode(HttpStatus.OK)
  async addTagsToFile(
    @Param('projectName') projectName: string,
    @Body() body: { path: string; tags: string[] },
  ): Promise<{ path: string; tags: string[] }> {
    this.logger.log(`Adding tags to file: ${body.path} in project: ${projectName}`);
    const tags = await this.tagsService.addTagsToFile(projectName, body.path, body.tags);
    return { path: body.path, tags };
  }

  /**
   * DELETE /api/workspace/:project/tags/file
   * Remove tags from a file
   * Body: { path: string, tags: string[] }
   */
  @Roles('user')
  @Delete('file')
  @HttpCode(HttpStatus.OK)
  async removeTagsFromFile(
    @Param('projectName') projectName: string,
    @Body() body: { path: string; tags: string[] },
  ): Promise<{ path: string; tags: string[] }> {
    this.logger.log(`Removing tags from file: ${body.path} in project: ${projectName}`);
    const tags = await this.tagsService.removeTagsFromFile(projectName, body.path, body.tags);
    return { path: body.path, tags };
  }

  /**
   * POST /api/workspace/:project/tags/rename
   * Rename a tag across all files
   * Body: { oldTag: string, newTag: string }
   */
  @Roles('user')
  @Post('rename')
  @HttpCode(HttpStatus.OK)
  async renameTag(
    @Param('projectName') projectName: string,
    @Body() body: { oldTag: string; newTag: string },
  ): Promise<{ renamed: number }> {
    this.logger.log(`Renaming tag ${body.oldTag} -> ${body.newTag} in project: ${projectName}`);
    const count = await this.tagsService.renameTag(projectName, body.oldTag, body.newTag);
    return { renamed: count };
  }

  /**
   * DELETE /api/workspace/:project/tags/:tag
   * Delete a tag from all files
   */
  @Roles('user')
  @Delete(':tag')
  @HttpCode(HttpStatus.OK)
  async deleteTag(
    @Param('projectName') projectName: string,
    @Param('tag') tag: string,
  ): Promise<{ deleted: number }> {
    this.logger.log(`Deleting tag ${tag} from project: ${projectName}`);
    const count = await this.tagsService.deleteTag(projectName, tag);
    return { deleted: count };
  }

  /**
   * GET /api/workspace/:project/tags/:tag/color
   * Get the color for a tag
   */
  @Get(':tag/color')
  async getTagColor(@Param('tag') tag: string): Promise<{ tag: string; color: string }> {
    const color = this.tagsService.getTagColor(tag);
    return { tag, color };
  }
}
