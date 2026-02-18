import { Controller, Get, Post, Req, Res, UseGuards, Logger, All, Body, Param } from '@nestjs/common';
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServerFactoryService } from './mcp-server-factory.service';
import { McpAuthGuard } from './auth.guard';
import { Public } from '../auth/public.decorator';
import { randomUUID } from 'crypto';
import { ElicitationResponse } from './types';

/**
 * MCP Server Controller
 *
 * Each tool group is exposed as a separate MCP server at /mcp/:group.
 * Available groups: demo, diffbot, deep-research, knowledge-graph, email,
 * scrapbook, a2a, project-tools, confirmation.
 *
 * Authentication: Authorization header with token "test123"
 *
 * Project Context: Pass the project name via:
 * - Header: X-Project-Name
 * - Query parameter: project
 */
@Controller()
@Public()
@UseGuards(McpAuthGuard)
export class McpServerController {
  private readonly logger = new Logger(McpServerController.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(private readonly factory: McpServerFactoryService) {}

  /**
   * Extract project root from request headers or query params
   */
  private getProjectRoot(req: Request): string | null {
    const projectName = (req.headers['x-project-name'] as string) || (req.query.project as string);
    if (projectName) {
      return `${this.workspaceRoot}/${projectName}`;
    }
    return null;
  }

  // ============================================
  // Elicitation endpoints (must be declared BEFORE :group wildcard)
  // ============================================

  @Post('mcp/elicitation/respond')
  async handleElicitationResponse(
    @Body() response: ElicitationResponse,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.logger.log(`Received elicitation response for id: ${response.id}`);

      if (!response.id || !response.action) {
        res.status(400).json({
          error: 'Invalid elicitation response',
          message: 'Missing required fields: id, action',
        });
        return;
      }

      const handled = this.factory.handleElicitationResponse(response);

      if (handled) {
        res.json({ success: true, message: 'Elicitation response processed' });
      } else {
        res.status(404).json({
          error: 'Elicitation not found',
          message: `No pending elicitation found for id: ${response.id}`,
        });
      }
    } catch (error) {
      this.logger.error(`Error handling elicitation response: ${error.message}`, error.stack);
      res.status(500).json({
        error: 'Failed to process elicitation response',
        message: error.message,
      });
    }
  }

  @Get('mcp/elicitation/pending')
  async getPendingElicitations(@Res() res: Response): Promise<void> {
    try {
      const pending = this.factory.getPendingElicitations();

      res.json({
        count: pending.length,
        elicitations: pending.map(p => ({
          id: p.id,
          toolName: p.toolName,
          message: p.message,
          createdAt: p.createdAt,
          requestedSchema: p.requestedSchema,
        })),
      });
    } catch (error) {
      this.logger.error(`Error getting pending elicitations: ${error.message}`, error.stack);
      res.status(500).json({
        error: 'Failed to get pending elicitations',
        message: error.message,
      });
    }
  }

  @Post('mcp/elicitation/test')
  async testElicitation(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { type?: 'simple' | 'multi' },
  ): Promise<void> {
    try {
      const projectName = req.headers['x-project-name'] as string || req.query.project as string;

      if (!projectName) {
        res.status(400).json({
          error: 'Missing project name',
          message: 'Provide project name via X-Project-Name header or ?project= query param',
        });
        return;
      }

      this.factory.setProjectContext(`/workspace/${projectName}`);

      const elicitationType = body?.type || 'multi';
      this.logger.log(`Testing elicitation (${elicitationType}) for project: ${projectName}`);

      const elicit = this.factory.createElicitationCallback('test_elicitation');

      let result;
      if (elicitationType === 'simple') {
        result = await elicit(
          'Test Confirmation\n\nThis is a test of the elicitation system. Please confirm to proceed.',
          {
            type: 'object',
            properties: {
              confirm: {
                type: 'boolean',
                title: 'Confirm',
                description: 'Check this box to confirm',
              },
            },
            required: ['confirm'],
          },
        );
      } else {
        result = await elicit(
          'Test Multi-Field Form\n\nThis is a test of the elicitation system with multiple form fields.',
          {
            type: 'object',
            properties: {
              priority: {
                type: 'string',
                title: 'Priority Level',
                description: 'Select a priority',
                enum: ['low', 'medium', 'high', 'critical'],
                enumNames: ['Low', 'Medium', 'High', 'Critical'],
              },
              count: {
                type: 'integer',
                title: 'Count',
                description: 'Enter a number between 1 and 10',
                minimum: 1,
                maximum: 10,
              },
              notify: {
                type: 'boolean',
                title: 'Send Notification',
                description: 'Enable email notification',
              },
              notes: {
                type: 'string',
                title: 'Notes',
                description: 'Add optional notes',
                maxLength: 200,
              },
            },
            required: ['priority', 'count'],
          },
        );
      }

      res.json({ success: true, elicitationResult: result });
    } catch (error) {
      this.logger.error(`Error in test elicitation: ${error.message}`, error.stack);
      res.status(500).json({
        error: 'Test elicitation failed',
        message: error.message,
      });
    }
  }

  // ============================================
  // Tool group endpoint (parameterized)
  // ============================================

  @All('mcp/:group')
  async handleGroupRequest(
    @Param('group') group: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Validate group exists
      const instance = this.factory.getGroupInstance(group);
      if (!instance) {
        res.status(404).json({
          error: 'Unknown tool group',
          message: `Tool group '${group}' not found. Available groups: ${this.factory.getAvailableGroups().join(', ')}`,
        });
        return;
      }

      this.logger.log(`Handling ${req.method} request to /mcp/${group}`);

      // Set project context for dynamic tools
      const projectRoot = this.getProjectRoot(req);
      this.factory.setProjectContext(projectRoot);
      if (projectRoot) {
        this.logger.log(`Project context set to: ${projectRoot}`);
      }

      // Get or create transport for this session within this group
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && instance.transports.has(sessionId)) {
        transport = instance.transports.get(sessionId)!;
        this.logger.log(`[${group}] Reusing transport for session: ${sessionId}`);
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            this.logger.log(`[${group}] Session initialized: ${newSessionId}`);
            instance.transports.set(newSessionId, transport);
          },
          onsessionclosed: (closedSessionId) => {
            this.logger.log(`[${group}] Session closed: ${closedSessionId}`);
            instance.transports.delete(closedSessionId);
          },
        });

        await instance.server.connect(transport);
        this.logger.log(`[${group}] New transport connected to MCP server`);
      }

      await transport.handleRequest(req as any, res as any, req.body);
    } catch (error) {
      this.logger.error(`Error handling /mcp/${group} request: ${error.message}`, error.stack);

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to handle MCP request',
          message: error.message,
        });
      }
    }
  }
}
