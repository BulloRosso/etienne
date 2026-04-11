import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, Res,
  HttpException, HttpStatus, StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { access } from 'fs/promises';
import { Response } from 'express';
import { SubagentsService, SubagentConfig } from './subagents.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';

@Controller('api/subagents')
export class SubagentsController {
  constructor(private readonly subagentsService: SubagentsService) {}

  // ── Repository endpoints (MUST be before :project routes) ──────────

  @Get('repository/list')
  async listRepositorySubagents(@Query('includeOptional') includeOptional?: string) {
    try {
      const include = includeOptional === 'true';
      const subagents = await this.subagentsService.listRepositorySubagents(include);
      const available = await this.subagentsService.isRepositoryAvailable();
      return { success: true, available, subagents };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('repository/:name/thumbnail')
  @Public()
  async getRepositoryThumbnail(
    @Param('name') name: string,
    @Query('source') source: 'standard' | 'optional' = 'standard',
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    try {
      const thumbPath = this.subagentsService.getSubagentThumbnailPath(name, source);
      await access(thumbPath);
      res.set({ 'Content-Type': 'image/png' });
      const file = createReadStream(thumbPath);
      return new StreamableFile(file);
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: 'Thumbnail not found' },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // ── Project-scoped endpoints ───────────────────────────────────────

  @Roles('user')
  @Post(':project/provision')
  async provisionSubagents(
    @Param('project') project: string,
    @Body() body: { subagentNames: string[]; source: 'standard' | 'optional' },
  ) {
    try {
      const results = await this.subagentsService.provisionSubagentsFromRepository(
        project,
        body.subagentNames,
        body.source,
      );
      return { success: true, results };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project')
  async listSubagents(@Param('project') project: string) {
    try {
      const subagents = await this.subagentsService.listSubagents(project);
      return {
        success: true,
        subagents,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/:name')
  async getSubagent(
    @Param('project') project: string,
    @Param('name') name: string,
  ) {
    try {
      const subagent = await this.subagentsService.getSubagent(project, name);
      if (!subagent) {
        throw new HttpException('Subagent not found', HttpStatus.NOT_FOUND);
      }
      return {
        success: true,
        subagent,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Roles('user')
  @Post(':project')
  async createSubagent(
    @Param('project') project: string,
    @Body() config: SubagentConfig,
  ) {
    try {
      await this.subagentsService.createSubagent(project, config);
      return {
        success: true,
        message: 'Subagent created successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Roles('user')
  @Put(':project/:name')
  async updateSubagent(
    @Param('project') project: string,
    @Param('name') originalName: string,
    @Body() config: SubagentConfig,
  ) {
    try {
      await this.subagentsService.updateSubagent(project, originalName, config);
      return {
        success: true,
        message: 'Subagent updated successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Roles('user')
  @Delete(':project/:name')
  async deleteSubagent(
    @Param('project') project: string,
    @Param('name') name: string,
  ) {
    try {
      await this.subagentsService.deleteSubagent(project, name);
      return {
        success: true,
        message: 'Subagent deleted successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
