import { Controller, Get, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { McpRegistryService } from './core/mcp-registry.service';

@Controller('api/mcp-registry')
export class McpRegistryController {
  constructor(private readonly mcpRegistryService: McpRegistryService) {}

  /**
   * Get all MCP servers from the registry
   */
  @Get()
  async getRegistry() {
    try {
      const servers = await this.mcpRegistryService.loadRegistry();
      const isAvailable = await this.mcpRegistryService.isRegistryAvailable();
      // Back-compat: frontend reads isStandard from the API response
      const serversWithCompat = servers.map(s => ({
        ...s,
        isStandard: s.isStandard ?? (s.metadata?.lifecycle === 'standard' ? true : undefined),
      }));
      return {
        success: true,
        available: isAvailable,
        servers: serversWithCompat,
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

  /**
   * List tools from an MCP server
   */
  @Post('list-tools')
  async listTools(@Body() body: { url: string; headers?: Record<string, string> }) {
    try {
      const tools = await this.mcpRegistryService.listToolsFromServer(
        body.url,
        body.headers,
      );
      return { success: true, tools };
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

  /**
   * Look up a registry server by its URL
   */
  @Post('lookup-by-url')
  async lookupByUrl(@Body() body: { url: string }) {
    try {
      const server = await this.mcpRegistryService.getServerByUrl(body.url);
      const serverWithCompat = server
        ? { ...server, isStandard: server.isStandard ?? (server.metadata?.lifecycle === 'standard' ? true : undefined) }
        : null;
      return {
        success: true,
        server: serverWithCompat,
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

  /**
   * Get a specific MCP server by name
   */
  @Get(':name')
  async getServer(@Param('name') name: string) {
    try {
      const server = await this.mcpRegistryService.getServerByName(name);
      if (!server) {
        throw new HttpException(
          {
            success: false,
            message: `MCP server '${name}' not found in registry`,
          },
          HttpStatus.NOT_FOUND,
        );
      }
      const serverWithCompat = {
        ...server,
        isStandard: server.isStandard ?? (server.metadata?.lifecycle === 'standard' ? true : undefined),
      };
      return {
        success: true,
        server: serverWithCompat,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
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
