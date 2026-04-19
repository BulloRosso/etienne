import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InterceptorsService } from '../../interceptors/interceptors.service';
import { OpenCodeSdkService } from './opencode-sdk.service';
import { OpenCodeConfig } from './opencode.config';
import {
  OpenCodePermissionRequest,
  OpenCodeQuestionRequest,
} from './opencode-event-adapter';

/**
 * Permission & elicitation bridge for OpenCode.
 *
 * Handles two OpenCode event types:
 * - `permission.asked`  -> Tool approval dialog (allow/always/reject)
 * - `question.asked`    -> User question dialog (multi-select, custom text)
 *
 * Both map to the existing frontend dialogs via InterceptorsService.
 * The bridge waits for frontend responses and replies via the SDK.
 */

interface PendingPermission {
  id: string;
  openCodeRequestId: string;
  type: 'permission' | 'question';
  resolve: (action: 'allow' | 'deny' | 'allow_always') => void;
  reject: (err: Error) => void;
  createdAt: Date;
  projectName: string;
}

interface PendingQuestion {
  id: string;
  openCodeRequestId: string;
  type: 'question';
  resolve: (answers: string[]) => void;
  reject: (err: Error) => void;
  createdAt: Date;
  projectName: string;
}

type PendingRequest = PendingPermission | PendingQuestion;

@Injectable()
export class OpenCodePermissionService {
  private readonly logger = new Logger(OpenCodePermissionService.name);
  private readonly config = new OpenCodeConfig();
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(
    private readonly interceptorsService: InterceptorsService,
    private readonly openCodeSdkService: OpenCodeSdkService,
  ) {}

  /**
   * Handle a permission.asked event from OpenCode.
   * Emits SSE to frontend and waits for response.
   */
  async handlePermissionAsked(
    projectName: string,
    permission: OpenCodePermissionRequest,
  ): Promise<void> {
    const id = randomUUID();
    this.logger.log(`OpenCode permission request: ${id} for tool ${permission.toolName}`);

    return new Promise<void>((resolve, reject) => {
      const pending: PendingRequest = {
        id,
        openCodeRequestId: permission.id,
        type: 'permission',
        resolve: async (action: 'allow' | 'deny' | 'allow_always') => {
          try {
            const reply = action === 'allow' ? 'once'
              : action === 'allow_always' ? 'always'
              : 'reject';
            await this.openCodeSdkService.replyPermission(permission.id, reply as any);
            resolve();
          } catch (err: any) {
            this.logger.error(`Failed to reply permission: ${err?.message}`);
            resolve(); // Don't block on reply failure
          }
        },
        reject,
        createdAt: new Date(),
        projectName,
      } as any;

      this.pendingRequests.set(id, pending);

      // Emit to frontend via SSE
      this.interceptorsService.emitPermissionRequest(projectName, {
        id,
        toolName: permission.toolName ?? 'unknown',
        toolInput: permission.args,
      });

      // Timeout handling
      this.setupTimeout(id);
    });
  }

  /**
   * Handle a question.asked event from OpenCode (elicitation).
   * Emits AskUserQuestion SSE to frontend and waits for response.
   */
  async handleQuestionAsked(
    projectName: string,
    question: OpenCodeQuestionRequest,
  ): Promise<void> {
    const id = randomUUID();
    this.logger.log(`OpenCode question request: ${id} — "${question.header}"`);

    return new Promise<void>((resolve, reject) => {
      const pending: PendingRequest = {
        id,
        openCodeRequestId: question.id,
        type: 'question',
        resolve: async (answers: string[]) => {
          try {
            await this.openCodeSdkService.replyQuestion(question.id, answers);
            resolve();
          } catch (err: any) {
            this.logger.error(`Failed to reply question: ${err?.message}`);
            resolve();
          }
        },
        reject,
        createdAt: new Date(),
        projectName,
      } as any;

      this.pendingRequests.set(id, pending);

      // Map OpenCode question format to our AskUserQuestion format
      this.interceptorsService.emitAskUserQuestion(projectName, {
        id,
        questions: [{
          question: question.text ?? question.header ?? 'Please answer:',
          header: (question.header ?? 'Input').slice(0, 12),
          options: (question.options ?? []).map((opt) => ({
            label: opt.label,
            description: opt.value ?? opt.label,
          })),
          multiSelect: question.multiSelect ?? false,
        }],
      });

      // Timeout handling
      this.setupTimeout(id);
    });
  }

  /**
   * Handle response from frontend (called by controller or orchestrator).
   */
  handleResponse(response: {
    id: string;
    action: 'allow' | 'deny' | 'cancel';
    answers?: string[] | Record<string, string>;
  }): boolean {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.logger.warn(`No pending OpenCode request for id: ${response.id}`);
      return false;
    }

    this.pendingRequests.delete(response.id);

    if (pending.type === 'permission') {
      const action = response.action === 'allow' ? 'allow' : 'deny';
      (pending as PendingPermission).resolve(action);
    } else {
      // Question type
      if (response.action === 'allow' && response.answers) {
        const answers = Array.isArray(response.answers)
          ? response.answers
          : Object.values(response.answers);
        (pending as PendingQuestion).resolve(answers);
      } else {
        // Rejected — dismiss the question
        this.openCodeSdkService.rejectQuestion(pending.openCodeRequestId).catch((err: any) =>
          this.logger.debug(`OpenCode question reject failed: ${err?.message}`),
        );
        (pending as PendingQuestion).resolve([]);
      }
    }

    return true;
  }

  /**
   * Setup timeout for a pending request.
   */
  private setupTimeout(id: string): void {
    setTimeout(() => {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.logger.warn(`OpenCode request ${id} timed out`);
        this.pendingRequests.delete(id);

        if (pending.type === 'permission') {
          // Auto-deny on timeout
          this.openCodeSdkService.replyPermission(pending.openCodeRequestId, 'reject').catch(() => {});
          (pending as PendingPermission).resolve('deny');
        } else {
          // Auto-reject question on timeout
          this.openCodeSdkService.rejectQuestion(pending.openCodeRequestId).catch(() => {});
          (pending as PendingQuestion).resolve([]);
        }
      }
    }, this.config.permissionTimeoutMs);
  }

  /**
   * Get all pending requests (for debugging).
   */
  getPendingRequests(): Array<{
    id: string;
    type: string;
    projectName: string;
    createdAt: Date;
  }> {
    return Array.from(this.pendingRequests.values()).map((req) => ({
      id: req.id,
      type: req.type,
      projectName: req.projectName,
      createdAt: req.createdAt,
    }));
  }
}
