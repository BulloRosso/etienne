import { Controller, Get, Post, Put, Delete, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { TaskDefinitionDto } from './dto/task-definition.dto';
import { TaskDefinition } from './interfaces/task.interface';

@Controller('api/scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get(':project/tasks')
  async getTasks(@Param('project') project: string) {
    try {
      const tasks = await this.schedulerService.getTasks(project);
      return { tasks };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to retrieve tasks',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/history')
  async getHistory(@Param('project') project: string) {
    try {
      const history = await this.schedulerService.getHistory(project);
      return { history };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to retrieve history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':project/tasks')
  async saveTasks(
    @Param('project') project: string,
    @Body('tasks') tasks: TaskDefinitionDto[],
  ) {
    try {
      await this.schedulerService.saveTasks(project, tasks as TaskDefinition[]);
      return { success: true };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to save tasks',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':project/task/:taskId')
  async getTask(
    @Param('project') project: string,
    @Param('taskId') taskId: string,
  ) {
    try {
      const task = await this.schedulerService.getTask(project, taskId);
      if (!task) {
        throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
      }
      return { task };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to retrieve task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':project/task')
  async createTask(
    @Param('project') project: string,
    @Body() taskDto: TaskDefinitionDto,
  ) {
    try {
      const task = await this.schedulerService.createTask(project, taskDto as TaskDefinition);
      return { task };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to create task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':project/task/:taskId')
  async updateTask(
    @Param('project') project: string,
    @Param('taskId') taskId: string,
    @Body() taskDto: TaskDefinitionDto,
  ) {
    try {
      const task = await this.schedulerService.updateTask(project, taskId, taskDto as TaskDefinition);
      return { task };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to update task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':project/task/:taskId')
  async deleteTask(
    @Param('project') project: string,
    @Param('taskId') taskId: string,
  ) {
    try {
      await this.schedulerService.deleteTask(project, taskId);
      return { success: true };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to delete task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
