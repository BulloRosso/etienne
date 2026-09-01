import { Controller, Get, Post, Req, Res, UseGuards, Logger, All, Body, Param } from '@nestjs/common';
import { Request, Response } from 'express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, NodeMcpRequestHandler } from '@modelcontextprotocol/node';
import { McpServerFactoryService } from './mcp-server-factory.service';
import { McpAuthGuard } from './auth.guard';
import { Public } from '../auth/public.decorator';
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

  // One MCP HTTP handler per tool group. createMcpHandler serves 2026-07-28
  // (per-request envelope) traffic natively and 2025-era clients through its
  // stateless legacy fallback, building a fresh Server per exchange.
  private readonly groupHandlers = new Map<string, NodeMcpRequestHandler>();

  constructor(private readonly factory: McpServerFactoryService) {}

  private getGroupHandler(group: string): NodeMcpRequestHandler | null {
    const cached = this.groupHandlers.get(group);
    if (cached) return cached;

    const instance = this.factory.getGroupInstance(group);
    if (!instance) return null;

    // The factory runs per exchange (modern era and legacy stateless alike),
    // so each Server instance captures its own request's project root and
    // scopes tool execution to it via the factory service's ALS.
    const handler = createMcpHandler(
      (mcpCtx) => instance.createServer(this.getProjectRootFromWebRequest(mcpCtx.requestInfo)),
      {
        legacy: 'stateless',
        onerror: (error) =>
          this.logger.warn(`[${group}] MCP handler error: ${error.message}`),
      },
    );
    const nodeHandler = toNodeHandler(handler, {
      onerror: (error) =>
        this.logger.error(`[${group}] MCP transport error: ${error.message}`),
    });
    this.groupHandlers.set(group, nodeHandler);
    return nodeHandler;
  }

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

  /**
   * Same extraction from the web-standard Request that createMcpHandler
   * passes to the per-request server factory.
   */
  private getProjectRootFromWebRequest(requestInfo: globalThis.Request | undefined): string | null {
    if (!requestInfo) return null;
    const projectName =
      requestInfo.headers.get('x-project-name') ||
      new URL(requestInfo.url).searchParams.get('project');
    return projectName ? `${this.workspaceRoot}/${projectName}` : null;
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

      const elicitationType = body?.type || 'multi';
      this.logger.log(`Testing elicitation (${elicitationType}) for project: ${projectName}`);

      const result = await this.factory.runWithProjectContext(`/workspace/${projectName}`, async () => {
        const elicit = this.factory.createElicitationCallback('test_elicitation');

        if (elicitationType === 'simple') {
          return elicit(
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
        }

        return elicit(
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
      });

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
  // Tool metadata endpoint (for MCP App detection)
  // ============================================

  @Get('mcp/tool-app-meta')
  async getToolAppMeta(@Res() res: Response): Promise<void> {
    try {
      const meta = this.factory.getToolAppMeta();
      res.json(meta);
    } catch (error) {
      this.logger.error(`Error getting tool app meta: ${error.message}`, error.stack);
      res.status(500).json({ error: 'Failed to get tool metadata' });
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
      // Validate group exists (also lazily builds the group's MCP handler)
      const handler = this.getGroupHandler(group);
      if (!handler) {
        res.status(404).json({
          error: 'Unknown tool group',
          message: `Tool group '${group}' not found. Available groups: ${this.factory.getAvailableGroups().join(', ')}`,
        });
        return;
      }

      this.logger.log(`Handling ${req.method} request to /mcp/${group}`);

      // Project context travels via the server factory (see getGroupHandler):
      // each per-exchange Server captures its request's project root.
      const projectRoot = this.getProjectRoot(req);
      if (projectRoot) {
        this.logger.log(`Project context: ${projectRoot}`);
      }

      await handler(req, res, req.body);
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
