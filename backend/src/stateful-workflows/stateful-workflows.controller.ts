import { Controller, Get, Post, Delete, Param, Query, Body, Logger } from '@nestjs/common';
import { StatefulWorkflowsService, WorkflowMachineConfig } from './stateful-workflows.service';
import { Roles } from '../auth/roles.decorator';
import { DecisionRationale } from '../hitl-protocol/interfaces/hitl-protocol.interface';

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
  @Post()
  async createWorkflow(
    @Param('projectName') projectName: string,
    @Body() body: {
      name: string;
      description?: string;
      machineConfig: WorkflowMachineConfig;
      tags?: string[];
      assumptionWikiSlugs?: string[];
      initialRationale?: DecisionRationale;
    },
  ) {
    if (!body.name || !body.machineConfig) {
      return { error: true, message: 'Missing required fields: name, machineConfig' };
    }
    return this.workflowsService.createWorkflow(
      projectName,
      body.name,
      body.description || '',
      body.machineConfig,
      body.tags,
      {
        assumptionWikiSlugs: body.assumptionWikiSlugs,
        initialRationale: body.initialRationale,
      },
    );
  }

  @Roles('user')
  @Post(':workflowId/event')
  async sendEvent(
    @Param('projectName') projectName: string,
    @Param('workflowId') workflowId: string,
    @Body() body: {
      event: string;
      data?: any;
      rationale?: DecisionRationale;
      decidedBy?: 'agent' | 'human';
    },
  ) {
    if (!body.event) {
      return { error: true, message: 'Missing required field: event' };
    }
    return this.workflowsService.sendEvent(projectName, workflowId, body.event, body.data, {
      rationale: body.rationale,
      decidedBy: body.decidedBy,
    });
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
