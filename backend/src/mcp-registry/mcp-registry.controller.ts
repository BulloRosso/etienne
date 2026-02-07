import { Controller, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { McpRegistryService } from './mcp-registry.service';

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
      return {
        success: true,
        available: isAvailable,
        servers,
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
      return {
        success: true,
        server,
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
