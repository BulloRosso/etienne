import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InterceptorsService } from '../../interceptors/interceptors.service';
import {
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
  PendingPermissionRequest,
  PermissionResponse,
  AskUserQuestionInput,
} from './sdk-permission.types';

/**
 * Service to manage SDK permission requests
 *
 * Handles the canUseTool callback for Claude Agent SDK, including:
 * - Generic tool permission requests
 * - AskUserQuestion tool (multi-choice prompts)
 * - ExitPlanMode tool (plan approval)
 */
@Injectable()
export class SdkPermissionService {
  private readonly logger = new Logger(SdkPermissionService.name);
  private readonly pendingRequests = new Map<string, PendingPermissionRequest>();

  // Timeout for pending requests (5 minutes, matching MCP elicitation)
  private readonly REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(private readonly interceptorsService: InterceptorsService) {}

  /**
   * Create the canUseTool callback for SDK query options
   *
   * @param projectName - The project name for SSE events
   * @param sessionId - Optional session ID
   * @param requireAllPermissions - If true, all tools require permission (plan/acceptEdits modes)
   *                                If false, only AskUserQuestion and ExitPlanMode are handled
   */
  createCanUseToolCallback(
    projectName: string,
    sessionId?: string,
    requireAllPermissions: boolean = false
  ): CanUseTool {
    return async (
      toolName: string,
      input: any,
      options: { signal: AbortSignal; suggestions?: PermissionUpdate[] }
    ): Promise<PermissionResult> => {
      this.logger.log(`canUseTool called: ${toolName} for project ${projectName} (requireAllPermissions: ${requireAllPermissions})`);

      // Handle AskUserQuestion specially - ALWAYS show dialog
      if (toolName === 'AskUserQuestion') {
        return this.handleAskUserQuestion(projectName, input, sessionId);
      }

      // Handle ExitPlanMode specially - ALWAYS show dialog
      if (toolName === 'ExitPlanMode') {
        return this.handleExitPlanMode(projectName, input, sessionId);
      }

      // For other tools, only prompt if requireAllPermissions is true
      if (requireAllPermissions) {
        return this.handlePermissionRequest(
          projectName,
          toolName,
          input,
          options.suggestions,
          sessionId
        );
      }

      // Auto-allow other tools when not in permission-required mode
      this.logger.debug(`Auto-allowing tool ${toolName} (requireAllPermissions is false)`);
      return {
        behavior: 'allow',
        updatedInput: input,
      };
    };
  }

  /**
   * Handle AskUserQuestion tool - show multi-choice dialog
   * Called from canUseTool callback
   */
  private async handleAskUserQuestion(
    projectName: string,
    input: AskUserQuestionInput,
    sessionId?: string
  ): Promise<PermissionResult> {
    return this.handleAskUserQuestionViaHook(projectName, input, sessionId);
  }

  /**
   * Handle AskUserQuestion tool via PreToolUse hook
   * This is the public method called from the orchestrator when the SDK
   * doesn't invoke canUseTool for AskUserQuestion
   */
  async handleAskUserQuestionViaHook(
    projectName: string,
    input: AskUserQuestionInput,
    sessionId?: string
  ): Promise<PermissionResult> {
    const id = randomUUID();
    this.logger.log(`AskUserQuestion request (via hook): ${id} with ${input.questions?.length || 0} questions`);

    return new Promise<PermissionResult>((resolve, reject) => {
      const pending: PendingPermissionRequest = {
        id,
        requestType: 'ask_user_question',
        toolName: 'AskUserQuestion',
        toolInput: input,
        resolve,
        reject,
        createdAt: new Date(),
        sessionId,
        projectName,
      };
      this.pendingRequests.set(id, pending);

      // Emit to frontend via SSE
      this.interceptorsService.emitAskUserQuestion(projectName, {
        id,
        questions: input.questions || [],
      });

      // Timeout handling
      this.setupTimeout(id);
    });
  }

  /**
   * Handle ExitPlanMode tool - show plan approval dialog
   * Called from canUseTool callback
   */
  private async handleExitPlanMode(
    projectName: string,
    input: any,
    sessionId?: string
  ): Promise<PermissionResult> {
    return this.handleExitPlanModeViaHook(projectName, input, sessionId);
  }

  /**
   * Handle ExitPlanMode tool via PreToolUse hook
   * This is the public method called from the orchestrator when the SDK
   * doesn't invoke canUseTool for ExitPlanMode
   */
  async handleExitPlanModeViaHook(
    projectName: string,
    input: any,
    sessionId?: string
  ): Promise<PermissionResult> {
    const id = randomUUID();
    this.logger.log(`ExitPlanMode request (via hook): ${id} for project ${projectName}`);

    return new Promise<PermissionResult>((resolve, reject) => {
      const pending: PendingPermissionRequest = {
        id,
        requestType: 'plan_approval',
        toolName: 'ExitPlanMode',
        toolInput: input,
        resolve,
        reject,
        createdAt: new Date(),
        sessionId,
        projectName,
      };
      this.pendingRequests.set(id, pending);

      // Emit to frontend via SSE
      // The plan file path is typically in ~/.claude/plans/<session>.md
      this.interceptorsService.emitPlanApproval(projectName, {
        id,
        planFilePath: input?.planFilePath || '',
      });

      // Timeout handling
      this.setupTimeout(id);
    });
  }

  /**
   * Handle generic tool permission request
   */
  private async handlePermissionRequest(
    projectName: string,
    toolName: string,
    input: any,
    suggestions?: PermissionUpdate[],
    sessionId?: string
  ): Promise<PermissionResult> {
    const id = randomUUID();
    this.logger.log(`Permission request: ${id} for tool ${toolName}`);

    return new Promise<PermissionResult>((resolve, reject) => {
      const pending: PendingPermissionRequest = {
        id,
        requestType: 'permission',
        toolName,
        toolInput: input,
        resolve,
        reject,
        createdAt: new Date(),
        sessionId,
        projectName,
        suggestions,
      };
      this.pendingRequests.set(id, pending);

      // Emit to frontend via SSE
      this.interceptorsService.emitPermissionRequest(projectName, {
        id,
        toolName,
        toolInput: input,
        suggestions,
      });

      // Timeout handling
      this.setupTimeout(id);
    });
  }

  /**
   * Setup timeout for a pending request
   */
  private setupTimeout(id: string): void {
    setTimeout(() => {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.logger.warn(`Permission request ${id} timed out`);
        this.pendingRequests.delete(id);
        pending.resolve({
          behavior: 'deny',
          message: 'Request timed out waiting for user response',
        });
      }
    }, this.REQUEST_TIMEOUT_MS);
  }

  /**
   * Handle response from frontend
   */
  handleResponse(response: PermissionResponse): boolean {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.logger.warn(`No pending request found for id: ${response.id}`);
      return false;
    }

    this.pendingRequests.delete(response.id);
    this.logger.log(`Processing response for ${pending.requestType}: ${response.id}, action: ${response.action}`);

    if (response.action === 'allow') {
      // For AskUserQuestion, the updatedInput contains the answers
      if (pending.requestType === 'ask_user_question') {
        pending.resolve({
          behavior: 'allow',
          updatedInput: {
            ...pending.toolInput,
            answers: response.updatedInput?.answers || {},
          },
        });
      }
      // For ExitPlanMode, the updatedInput contains the approval status
      else if (pending.requestType === 'plan_approval') {
        pending.resolve({
          behavior: 'allow',
          updatedInput: {
            ...pending.toolInput,
            approved: true,
            message: response.message || 'Plan approved',
          },
        });
      }
      // For generic permission
      else {
        pending.resolve({
          behavior: 'allow',
          updatedInput: response.updatedInput || pending.toolInput,
          updatedPermissions: response.updatedPermissions,
        });
      }
    } else {
      // Deny or cancel
      pending.resolve({
        behavior: 'deny',
        message: response.message || 'User denied permission',
        interrupt: response.interrupt,
      });
    }

    return true;
  }

  /**
   * Get all pending requests (for debugging)
   */
  getPendingRequests(): Array<{
    id: string;
    requestType: string;
    toolName: string;
    projectName: string;
    createdAt: Date;
  }> {
    return Array.from(this.pendingRequests.values()).map((req) => ({
      id: req.id,
      requestType: req.requestType,
      toolName: req.toolName,
      projectName: req.projectName,
      createdAt: req.createdAt,
    }));
  }

  /**
   * Check if there are any pending requests for a project
   */
  hasPendingRequests(projectName: string): boolean {
    for (const req of this.pendingRequests.values()) {
      if (req.projectName === projectName) {
        return true;
      }
    }
    return false;
  }
}
