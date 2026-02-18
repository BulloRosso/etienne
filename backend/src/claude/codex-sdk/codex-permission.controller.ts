import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { CodexPermissionService, CodexPermissionResponse } from './codex-permission.service';
import { Roles } from '../../auth/roles.decorator';

/**
 * Controller for Codex SDK permission/approval requests.
 *
 * Handles responses from the frontend for:
 * - Command execution approvals
 * - File change approvals
 * - Structured user input responses
 * - Free-form user input responses
 */
@Controller('api/codex/permission')
export class CodexPermissionController {
  private readonly logger = new Logger(CodexPermissionController.name);

  constructor(private readonly permissionService: CodexPermissionService) {}

  /**
   * Handle permission/approval response from frontend
   */
  @Roles('user')
  @Post('respond')
  async handlePermissionResponse(
    @Body() response: CodexPermissionResponse,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Received Codex permission response: ${response.id}, action: ${response.action}`);

    try {
      const handled = this.permissionService.handleResponse(response);

      if (handled) {
        return { success: true, message: 'Codex permission response processed' };
      }

      return { success: false, message: 'No pending Codex request found for this ID' };
    } catch (error: any) {
      this.logger.error(`Error handling Codex permission response: ${error.message}`, error.stack);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Get pending Codex permission requests (for debugging)
   */
  @Get('pending')
  getPendingRequests() {
    return this.permissionService.getPendingRequests();
  }
}
