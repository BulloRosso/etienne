import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import {
  OpenAIAgentsPermissionService,
  OpenAIAgentsPermissionResponse,
} from './openai-agents-permission.service';
import { Roles } from '../../auth/roles.decorator';

/**
 * Controller for OpenAI Agents SDK permission/approval requests.
 * Handles responses from the frontend for tool approval flows.
 */
@Controller('api/openai-agents/permission')
export class OpenAIAgentsPermissionController {
  private readonly logger = new Logger(OpenAIAgentsPermissionController.name);

  constructor(
    private readonly permissionService: OpenAIAgentsPermissionService,
  ) {}

  /**
   * Handle permission/approval response from frontend
   */
  @Roles('user')
  @Post('respond')
  async handlePermissionResponse(
    @Body() response: OpenAIAgentsPermissionResponse,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Received OpenAI Agents permission response: ${response.id}, action: ${response.action}`,
    );

    try {
      const handled = this.permissionService.handleResponse(response);

      if (handled) {
        return {
          success: true,
          message: 'OpenAI Agents permission response processed',
        };
      }

      return {
        success: false,
        message: 'No pending OpenAI Agents request found for this ID',
      };
    } catch (error: any) {
      this.logger.error(
        `Error handling OpenAI Agents permission response: ${error.message}`,
        error.stack,
      );
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Get pending permission requests (for debugging)
   */
  @Get('pending')
  getPendingRequests() {
    return this.permissionService.getPendingRequests();
  }
}
