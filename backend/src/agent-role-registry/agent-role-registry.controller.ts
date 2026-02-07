import { Controller, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { AgentRoleRegistryService } from './agent-role-registry.service';

@Controller('api/agent-role-registry')
export class AgentRoleRegistryController {
  constructor(private readonly service: AgentRoleRegistryService) {}

  /**
   * Get all agent roles from the registry
   */
  @Get()
  async getRegistry() {
    try {
      const roles = await this.service.loadRegistry();
      const isAvailable = await this.service.isRegistryAvailable();
      return {
        success: true,
        available: isAvailable,
        roles,
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
   * Get a specific agent role by ID
   */
  @Get(':roleId')
  async getRole(@Param('roleId') roleId: string) {
    try {
      const role = await this.service.getRoleById(roleId);
      if (!role) {
        throw new HttpException(
          {
            success: false,
            message: `Agent role '${roleId}' not found in registry`,
          },
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        role,
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
