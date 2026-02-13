import { Controller, Post, Get, Delete, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CheckpointsService } from './checkpoints.service';

class CreateCheckpointDto {
  @IsString()
  message!: string;
}

class RestoreCheckpointDto {
  @IsString()
  commitHash!: string;
}

class DiscardFileDto {
  @IsString()
  path!: string;
}

@Controller('api/checkpoints')
export class CheckpointsController {
  constructor(private readonly checkpointsService: CheckpointsService) {}

  @Get('connection-check')
  async checkConnection() {
    try {
      const status = await this.checkpointsService.checkConnection();
      return { success: true, ...status };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':project/create')
  async createCheckpoint(
    @Param('project') project: string,
    @Body() dto: CreateCheckpointDto,
  ) {
    try {
      console.log('Received checkpoint create request:', { project, dto, message: dto?.message });
      const commitHash = await this.checkpointsService.createCheckpoint(
        project,
        dto.message,
      );
      return {
        success: true,
        message: 'Checkpoint created successfully',
        project,
        commitMessage: dto.message,
        commitHash,
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

  @Post(':project/restore')
  async restoreCheckpoint(
    @Param('project') project: string,
    @Body() dto: RestoreCheckpointDto,
  ) {
    try {
      await this.checkpointsService.restoreCheckpoint(
        project,
        dto.commitHash,
      );
      return {
        success: true,
        message: 'Project restored successfully',
        project,
        commitHash: dto.commitHash,
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

  @Get(':project/list')
  async listCheckpoints(@Param('project') project: string) {
    try {
      const checkpoints = await this.checkpointsService.listCheckpoints(project);
      return {
        success: true,
        project,
        checkpoints,
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

  @Delete(':project/:hash')
  async deleteCheckpoint(
    @Param('project') project: string,
    @Param('hash') hash: string,
  ) {
    try {
      await this.checkpointsService.deleteCheckpoint(project, hash);
      return {
        success: true,
        message: 'Checkpoint deleted successfully',
        project,
        commitHash: hash,
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

  @Get(':project/changes')
  async getChanges(@Param('project') project: string) {
    try {
      const changes = await this.checkpointsService.getChanges(project);
      return { success: true, project, changes };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':project/discard')
  async discardFile(
    @Param('project') project: string,
    @Body() dto: DiscardFileDto,
  ) {
    try {
      await this.checkpointsService.discardFile(project, dto.path);
      return { success: true, message: 'File changes discarded', project, path: dto.path };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/commit-files/:hash')
  async getCommitFiles(
    @Param('project') project: string,
    @Param('hash') hash: string,
  ) {
    try {
      const files = await this.checkpointsService.getCommitFiles(project, hash);
      return { success: true, project, files };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/tags')
  async listTags(@Param('project') project: string) {
    try {
      const tags = await this.checkpointsService.listTags(project);
      return { success: true, project, tags };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
