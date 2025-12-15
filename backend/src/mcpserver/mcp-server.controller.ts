import { Controller, Get, Post, Req, Res, UseGuards, Logger, All } from '@nestjs/common';
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServerService } from './mcp-server.service';
import { McpAuthGuard } from './auth.guard';
import { randomUUID } from 'crypto';

/**
 * MCP Server Controller
 *
 * Supports both SSE (Server-Sent Events) and HTTP Streaming transports.
 *
 * Endpoints:
 * - /mcp - Streamable HTTP transport (recommended) - handles GET, POST, DELETE
 * - /sse - Legacy SSE transport (for backwards compatibility) - handles GET, POST
 *
 * The Streamable HTTP transport (/mcp) is recommended as it supports:
 * - Session management
 * - Resumability
 * - Both SSE streaming and direct HTTP responses
 * - DELETE requests to terminate sessions
 *
 * Authentication: Authorization header with token "test123"
 *
 * Project Context: Pass the project name via:
 * - Header: X-Project-Name
 * - Query parameter: project
 * This is required for A2A dynamic tools to work properly.
 */
@Controller()
@UseGuards(McpAuthGuard)
export class McpServerController {
  private readonly logger = new Logger(McpServerController.name);
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(private readonly mcpService: McpServerService) {}

  /**
   * Extract project root from request headers or query params
   */
  private getProjectRoot(req: Request): string | null {
    const projectName = (req.headers['x-project-name'] as string) || (req.query.project as string);
    if (projectName) {
      // Use path.join equivalent for safety
      return `${this.workspaceRoot}/${projectName}`;
    }
    return null;
  }

  /**
   * Handle Streamable HTTP transport (GET, POST, DELETE)
   * This is the recommended endpoint for MCP connections.
   *
   * Supports:
   * - GET: Establishes SSE connection for server-to-client messages
   * - POST: Receives client-to-server messages
   * - DELETE: Terminates sessions
   */
  @All('mcp')
  async handleStreamableHttp(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      this.logger.log(`Handling ${req.method} request to /mcp`);

      // Set project context for A2A tools
      const projectRoot = this.getProjectRoot(req);
      this.mcpService.setProjectContext(projectRoot);
      if (projectRoot) {
        this.logger.log(`Project context set to: ${projectRoot}`);
      }

      // Get or create transport for this connection
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport for this session
        transport = this.transports.get(sessionId)!;
        this.logger.log(`Reusing transport for session: ${sessionId}`);
      } else {
        // Create new transport with session management
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            this.logger.log(`Session initialized: ${newSessionId}`);
            this.transports.set(newSessionId, transport);
          },
          onsessionclosed: (closedSessionId) => {
            this.logger.log(`Session closed: ${closedSessionId}`);
            this.transports.delete(closedSessionId);
          },
        });

        // Connect the MCP server to the transport
        await this.mcpService.server.connect(transport);
        this.logger.log('New transport connected to MCP server');
      }

      // Handle the request (GET for SSE, POST for messages, DELETE for session termination)
      await transport.handleRequest(req as any, res as any, req.body);
    } catch (error) {
      this.logger.error(`Error handling streamable HTTP request: ${error.message}`, error.stack);

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to handle MCP request',
          message: error.message,
        });
      }
    }
  }

  /**
   * Handle legacy SSE transport (GET, POST)
   * Maintained for backwards compatibility.
   *
   * This is equivalent to the Streamable HTTP transport but on a different path.
   * New implementations should use /mcp instead.
   */
  @All('sse')
  async handleSse(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      this.logger.log(`Handling ${req.method} request to /sse (legacy endpoint)`);

      // Set project context for A2A tools
      const projectRoot = this.getProjectRoot(req);
      this.mcpService.setProjectContext(projectRoot);
      if (projectRoot) {
        this.logger.log(`Project context set to: ${projectRoot}`);
      }

      // Get or create transport for this connection
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport for this session
        transport = this.transports.get(sessionId)!;
        this.logger.log(`Reusing transport for session: ${sessionId}`);
      } else {
        // Create new transport with session management
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            this.logger.log(`Session initialized: ${newSessionId}`);
            this.transports.set(newSessionId, transport);
          },
          onsessionclosed: (closedSessionId) => {
            this.logger.log(`Session closed: ${closedSessionId}`);
            this.transports.delete(closedSessionId);
          },
        });

        // Connect the MCP server to the transport
        await this.mcpService.server.connect(transport);
        this.logger.log('New transport connected to MCP server');
      }

      // Handle the request
      await transport.handleRequest(req as any, res as any, req.body);
    } catch (error) {
      this.logger.error(`Error handling SSE request: ${error.message}`, error.stack);

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to handle SSE request',
          message: error.message,
        });
      }
    }
  }
}
