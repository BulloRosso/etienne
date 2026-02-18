import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { SdkPermissionService } from './sdk-permission.service';
import { PermissionResponse } from './sdk-permission.types';
import { Roles } from '../../auth/roles.decorator';

/**
 * Controller for SDK permission requests
 *
 * Handles responses from the frontend for:
 * - Tool permission requests (acceptEdits mode)
 * - AskUserQuestion tool responses
 * - ExitPlanMode tool (plan approval) responses
 */
@Controller('api/claude/permission')
export class SdkPermissionController {
  private readonly logger = new Logger(SdkPermissionController.name);

  constructor(private readonly permissionService: SdkPermissionService) {}

  /**
   * Handle permission response from frontend
   */
  @Roles('user')
  @Post('respond')
  async handlePermissionResponse(
    @Body() response: PermissionResponse
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Received permission response: ${response.id}, action: ${response.action}`);

    try {
      const handled = this.permissionService.handleResponse(response);

      if (handled) {
        return { success: true, message: 'Permission response processed' };
      }

      return { success: false, message: 'No pending request found for this ID' };
    } catch (error: any) {
      this.logger.error(`Error handling permission response: ${error.message}`, error.stack);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Get pending permission requests (for debugging)
   */
  @Get('pending')
  getPendingRequests(): Array<{
    id: string;
    requestType: string;
    toolName: string;
    projectName: string;
    createdAt: Date;
  }> {
    return this.permissionService.getPendingRequests();
  }
}
