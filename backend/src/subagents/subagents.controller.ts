import { Controller, Get, Post, Put, Delete, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { SubagentsService, SubagentConfig } from './subagents.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/subagents')
export class SubagentsController {
  constructor(private readonly subagentsService: SubagentsService) {}

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
