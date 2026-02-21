// ─────────────────────────────────────────────────────────
// decision-support.controller.ts
// ─────────────────────────────────────────────────────────
import { Controller, Post, Get, Body, Param, Delete } from '@nestjs/common';
import { DecisionSupportService, ChatTurn, DecisionGraph } from './decision-support.service';

@Controller('api/decision-support')
export class DecisionSupportController {
  constructor(private readonly svc: DecisionSupportService) {}

  /**
   * Core endpoint: derive a decision suggestion from chat context
   */
  @Post('derive')
  async derive(@Body() body: {
    project: string;
    chatHistory: ChatTurn[];
    userMessage: string;
  }) {
    const { suggestion, assistantReply } = await this.svc.deriveDecisionFromChat(
      body.project,
      body.chatHistory || [],
      body.userMessage,
    );
    return { suggestion, assistantReply };
  }

  /**
   * Persist a confirmed decision graph into the ontology
   */
  @Post('graphs')
  async saveGraph(@Body() body: { project: string; graph: DecisionGraph }) {
    const id = this.svc.generateId();
    const graph: DecisionGraph = {
      ...body.graph,
      id,
      project: body.project,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.svc.saveDecisionGraph(body.project, graph);
    return { id, success: true };
  }

  /**
   * List all saved decision graphs in a project
   */
  @Get('graphs/:project')
  async listGraphs(@Param('project') project: string) {
    return this.svc.listDecisionGraphs(project);
  }

  /**
   * Load a single decision graph with full conditions and actions
   */
  @Get('graphs/:project/:graphId')
  async loadGraph(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
  ) {
    return this.svc.loadDecisionGraph(project, graphId);
  }

  /**
   * Export a decision graph as ZeroMQ rule set
   */
  @Get('graphs/:project/:graphId/zmq-rules')
  async exportZmqRules(
    @Param('project') project: string,
    @Param('graphId') graphId: string,
  ) {
    const rules = await this.svc.exportAsZmqRules(project, graphId);
    return { rules };
  }

  /**
   * Get ontology snapshot (for debugging / frontend display)
   */
  @Get('ontology-context/:project')
  async getOntologyContext(@Param('project') project: string) {
    const context = await this.svc.buildOntologyContext(project);
    return { context };
  }
}


// ─────────────────────────────────────────────────────────
// decision-support.module.ts
// ─────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
// import { DecisionSupportController } from './decision-support.controller';
// import { DecisionSupportService } from './decision-support.service';
// import { KnowledgeGraphService } from './knowledge-graph.service';
// import { GraphBuilderService } from './graph-builder.service';

// Uncomment imports above and remove this stub when integrating:
@Module({
  controllers: [DecisionSupportController],
  providers: [DecisionSupportService, /* KnowledgeGraphService, GraphBuilderService */],
  exports: [DecisionSupportService],
})
export class DecisionSupportModule {}
