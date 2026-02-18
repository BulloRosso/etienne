import { Controller, Get, Post, Delete, Param, Query, Body, Logger } from '@nestjs/common';
import { StatefulWorkflowsService } from './stateful-workflows.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/workspace/:projectName/workflows')
export class StatefulWorkflowsController {
  private readonly logger = new Logger(StatefulWorkflowsController.name);

  constructor(private readonly workflowsService: StatefulWorkflowsService) {}

  @Get()
  async listWorkflows(
    @Param('projectName') projectName: string,
    @Query('tag') tag?: string,
    @Query('state') state?: string,
  ) {
    this.logger.log(`Listing workflows for project: ${projectName}`);
    return this.workflowsService.listWorkflows(projectName, tag, state);
  }

  @Get(':workflowId')
  async getWorkflow(
    @Param('projectName') projectName: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowsService.getDefinition(projectName, workflowId);
  }

  @Get(':workflowId/status')
  async getWorkflowStatus(
    @Param('projectName') projectName: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowsService.getStatus(projectName, workflowId);
  }

  @Get(':workflowId/graph')
  async getWorkflowGraph(
    @Param('projectName') projectName: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowsService.getGraphRepresentation(projectName, workflowId);
  }

  @Roles('user')
  @Post(':workflowId/event')
  async sendEvent(
    @Param('projectName') projectName: string,
    @Param('workflowId') workflowId: string,
    @Body() body: { event: string; data?: any },
  ) {
    if (!body.event) {
      return { error: true, message: 'Missing required field: event' };
    }
    return this.workflowsService.sendEvent(projectName, workflowId, body.event, body.data);
  }

  @Roles('user')
  @Delete(':workflowId')
  async deleteWorkflow(
    @Param('projectName') projectName: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowsService.deleteWorkflow(projectName, workflowId);
  }
}
