import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InterceptorsService } from '../../interceptors/interceptors.service';
import { OpenAIAgentsConfig } from './openai-agents.config';

/** Pending approval request tracked while waiting for user response */
interface PendingRequest {
  id: string;
  projectName: string;
  resolve: (value: OpenAIAgentsPermissionResponse) => void;
  reject: (error: Error) => void;
  createdAt: Date;
  timer: ReturnType<typeof setTimeout>;
  toolName: string;
}

/** Response from the frontend */
export interface OpenAIAgentsPermissionResponse {
  id: string;
  action: 'allow' | 'deny' | 'cancel';
  updatedInput?: any;
  message?: string;
}

/**
 * Service bridging OpenAI Agents SDK approval requests to the existing SSE
 * eventing infrastructure.
 *
 * Unlike the Codex permission service, this does not send JSON-RPC responses.
 * Instead, it resolves a Promise that the SDK service awaits, allowing it to
 * call state.approve() / state.reject() on the SDK interruption.
 */
@Injectable()
export class OpenAIAgentsPermissionService {
  private readonly logger = new Logger(OpenAIAgentsPermissionService.name);
  private readonly config = new OpenAIAgentsConfig();
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(private readonly interceptorsService: InterceptorsService) {}

  /**
   * Handle an approval request from the SDK stream.
   * Emits an SSE event to the frontend and returns a Promise that resolves
   * when the user responds.
   *
   * @param projectName The project this approval belongs to
   * @param interruption The SDK RunInterruption object
   * @returns Promise resolving to { approved: boolean }
   */
  async handleApprovalRequest(
    projectName: string,
    interruption: any,
  ): Promise<{ approved: boolean }> {
    const id = randomUUID();
    const toolName =
      interruption.name ||
      interruption.rawItem?.name ||
      interruption.type ||
      'unknown';
    const toolArgs = interruption.arguments || '';

    let toolInput: any = {};
    try {
      toolInput = toolArgs ? JSON.parse(toolArgs) : {};
    } catch {
      toolInput = { raw: toolArgs };
    }

    this.interceptorsService.emitPermissionRequest(projectName, {
      id,
      toolName,
      toolInput,
    });

    this.logger.log(
      `Emitted approval request ${id} for tool ${toolName} in project ${projectName}`,
    );

    return new Promise<{ approved: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.logger.warn(
            `Approval request ${id} timed out after ${this.config.permissionTimeoutMs}ms — auto-denying`,
          );
          resolve({ approved: false });
        }
      }, this.config.permissionTimeoutMs);

      this.pendingRequests.set(id, {
        id,
        projectName,
        resolve: (response) => {
          resolve({ approved: response.action === 'allow' });
        },
        reject,
        createdAt: new Date(),
        timer,
        toolName,
      });
    });
  }

  /**
   * Handle a response from the frontend (called by the controller).
   * Returns true if the response matched a pending request.
   */
  handleResponse(response: OpenAIAgentsPermissionResponse): boolean {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return false;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timer);

    this.logger.log(
      `Processing OpenAI Agents permission response: ${response.id}, action: ${response.action}`,
    );
    pending.resolve(response);
    return true;
  }

  /**
   * Get all pending requests (for debugging / monitoring).
   */
  getPendingRequests(): Array<{
    id: string;
    toolName: string;
    projectName: string;
    createdAt: Date;
  }> {
    return Array.from(this.pendingRequests.values()).map((req) => ({
      id: req.id,
      toolName: req.toolName,
      projectName: req.projectName,
      createdAt: req.createdAt,
    }));
  }

  /**
   * Check if there are any pending requests for a project.
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
