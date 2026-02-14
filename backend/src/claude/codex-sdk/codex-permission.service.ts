import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InterceptorsService } from '../../interceptors/interceptors.service';
import { CodexSdkService, AppServerRequest } from './codex-sdk.service';
import { CodexConfig } from './codex.config';

/** Pending approval request tracked while waiting for user response */
interface PendingCodexRequest {
  /** UUID used as the key in the pending map and sent to the frontend */
  id: string;
  /** Original JSON-RPC request id from the app-server (needed for the response) */
  jsonRpcId: number;
  /** The Codex method that initiated this request */
  method: string;
  /** The full params from the server request */
  params: any;
  /** Project name for SSE routing */
  projectName: string;
  /** Promise resolution */
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  createdAt: Date;
  /** Timer handle for cleanup */
  timer: ReturnType<typeof setTimeout>;
}

/** Response from the frontend (matches PermissionResponse shape) */
export interface CodexPermissionResponse {
  id: string;
  action: 'allow' | 'deny' | 'cancel';
  updatedInput?: any;
  message?: string;
}

/**
 * Service bridging Codex app-server approval/elicitation requests to the
 * existing SSE eventing infrastructure.
 *
 * Maps Codex JSON-RPC server-initiated requests to InterceptorsService SSE
 * events, waits for frontend responses, then sends JSON-RPC responses back
 * to the app-server.
 */
@Injectable()
export class CodexPermissionService {
  private readonly logger = new Logger(CodexPermissionService.name);
  private readonly config = new CodexConfig();
  private readonly pendingRequests = new Map<string, PendingCodexRequest>();

  constructor(
    private readonly interceptorsService: InterceptorsService,
    private readonly codexSdkService: CodexSdkService,
  ) {}

  /**
   * Handle a server-initiated request from the app-server.
   * Maps the Codex method to the appropriate SSE event, waits for the user
   * response, then sends the JSON-RPC response back.
   *
   * This method is async — the orchestrator should call it fire-and-forget
   * since the response goes directly back to the app-server via stdin.
   */
  async handleServerRequest(projectName: string, request: AppServerRequest): Promise<void> {
    switch (request.method) {
      case 'item/commandExecution/requestApproval':
        await this.handleCommandApproval(projectName, request);
        break;
      case 'item/fileChange/requestApproval':
        await this.handleFileChangeApproval(projectName, request);
        break;
      case 'tool/requestUserInput':
        await this.handleStructuredUserInput(projectName, request);
        break;
      case 'agent/requestUserInput':
        await this.handleFreeFormUserInput(projectName, request);
        break;
      case 'agent/askUserQuestion':
        await this.handleAskUserQuestion(projectName, request);
        break;
      default:
        this.logger.warn(`Unknown server request method: ${request.method}, auto-declining`);
        this.codexSdkService.sendResponse(request.id, undefined, {
          code: -32601,
          message: `Unsupported method: ${request.method}`,
        });
    }
  }

  /**
   * Handle command execution approval.
   * Maps to emitPermissionRequest with toolName='Bash'.
   */
  private async handleCommandApproval(projectName: string, request: AppServerRequest): Promise<void> {
    const params = request.params;
    const parsedCmd = params.parsedCmd || {};
    const commandStr = [parsedCmd.command, ...(parsedCmd.args || [])].join(' ');

    const id = randomUUID();

    this.interceptorsService.emitPermissionRequest(projectName, {
      id,
      toolName: 'Bash',
      toolInput: {
        command: commandStr,
        cwd: parsedCmd.cwd,
        reason: params.reason,
        risk: params.risk,
        itemId: params.itemId,
      },
    });

    try {
      const response = await this.waitForResponse(id, request.id, request.method, params, projectName);

      if (response.action === 'allow') {
        this.codexSdkService.sendResponse(request.id, {
          decision: 'accept',
          acceptSettings: { forSession: false },
        });
      } else {
        this.codexSdkService.sendResponse(request.id, {
          decision: 'decline',
        });
      }
    } catch (err: any) {
      this.logger.error(`Command approval error: ${err.message}`);
      this.codexSdkService.sendResponse(request.id, { decision: 'decline' });
    }
  }

  /**
   * Handle file change approval.
   * Maps to emitPermissionRequest with toolName='Edit'.
   */
  private async handleFileChangeApproval(projectName: string, request: AppServerRequest): Promise<void> {
    const params = request.params;
    const changes = params.changes || [];
    const primaryPath = changes[0]?.path || '';
    const description = changes.map((c: any) => `${c.type}: ${c.path} - ${c.summary || ''}`).join('\n');

    const id = randomUUID();

    this.interceptorsService.emitPermissionRequest(projectName, {
      id,
      toolName: 'Edit',
      toolInput: {
        file_path: primaryPath,
        changes,
        reason: params.reason,
        description,
        itemId: params.itemId,
      },
    });

    try {
      const response = await this.waitForResponse(id, request.id, request.method, params, projectName);

      if (response.action === 'allow') {
        this.codexSdkService.sendResponse(request.id, {
          decision: 'accept',
          acceptSettings: { forSession: false },
        });
      } else {
        this.codexSdkService.sendResponse(request.id, { decision: 'decline' });
      }
    } catch (err: any) {
      this.logger.error(`File change approval error: ${err.message}`);
      this.codexSdkService.sendResponse(request.id, { decision: 'decline' });
    }
  }

  /**
   * Handle structured user input (tool/requestUserInput).
   * Maps Codex question format to emitAskUserQuestion.
   */
  private async handleStructuredUserInput(projectName: string, request: AppServerRequest): Promise<void> {
    const params = request.params;
    const codexQuestions = params.questions || [];

    const mappedQuestions = codexQuestions.map((q: any) => ({
      question: q.text,
      header: (q.text || '').substring(0, 12),
      options: (q.options || []).map((opt: string) => ({
        label: opt,
        description: opt,
      })),
      multiSelect: false,
    }));

    const id = randomUUID();

    this.interceptorsService.emitAskUserQuestion(projectName, {
      id,
      questions: mappedQuestions,
    });

    try {
      const response = await this.waitForResponse(id, request.id, request.method, params, projectName);

      if (response.action === 'allow') {
        const answers = response.updatedInput?.answers || {};
        const codexAnswers = codexQuestions.map((q: any, idx: number) => ({
          questionIndex: idx,
          selected: answers[`q${idx}`] || answers[q.text] || Object.values(answers)[idx] || '',
        }));

        this.codexSdkService.sendResponse(request.id, { answers: codexAnswers });
      } else {
        this.codexSdkService.sendResponse(request.id, undefined, {
          code: -32000,
          message: 'User cancelled input',
        });
      }
    } catch (err: any) {
      this.logger.error(`Structured input error: ${err.message}`);
      this.codexSdkService.sendResponse(request.id, undefined, {
        code: -32000,
        message: 'User input timed out',
      });
    }
  }

  /**
   * Handle free-form user input (agent/requestUserInput).
   * Wraps the prompt as a single AskUserQuestion with no predefined options.
   */
  private async handleFreeFormUserInput(projectName: string, request: AppServerRequest): Promise<void> {
    const params = request.params;

    const id = randomUUID();

    this.interceptorsService.emitAskUserQuestion(projectName, {
      id,
      questions: [{
        question: params.prompt || 'Please provide input:',
        header: 'Input',
        options: [],
        multiSelect: false,
      }],
    });

    try {
      const response = await this.waitForResponse(id, request.id, request.method, params, projectName);

      if (response.action === 'allow') {
        const userInput = response.message
          || response.updatedInput?.answers?.q0
          || response.updatedInput?.text
          || Object.values(response.updatedInput?.answers || {})[0]
          || '';

        this.codexSdkService.sendResponse(request.id, { userInput });
      } else {
        this.codexSdkService.sendResponse(request.id, undefined, {
          code: -32000,
          message: 'User cancelled input',
        });
      }
    } catch (err: any) {
      this.logger.error(`Free-form input error: ${err.message}`);
      this.codexSdkService.sendResponse(request.id, undefined, {
        code: -32000,
        message: 'User input timed out',
      });
    }
  }

  /**
   * Handle constrained-answer questionnaire (agent/askUserQuestion).
   * Maps directly to emitAskUserQuestion with multi-choice support.
   */
  private async handleAskUserQuestion(projectName: string, request: AppServerRequest): Promise<void> {
    const params = request.params;
    const codexQuestions = params.questions || [];

    const mappedQuestions = codexQuestions.map((q: any) => ({
      question: q.text,
      header: (q.text || '').substring(0, 12),
      options: (q.options || []).map((opt: string) => ({
        label: opt,
        description: opt,
      })),
      multiSelect: q.type === 'multi_choice',
    }));

    const id = randomUUID();

    this.interceptorsService.emitAskUserQuestion(projectName, {
      id,
      questions: mappedQuestions,
    });

    try {
      const response = await this.waitForResponse(id, request.id, request.method, params, projectName);

      if (response.action === 'allow') {
        const answers = response.updatedInput?.answers || {};
        const codexAnswers = codexQuestions.map((q: any, idx: number) => ({
          questionIndex: idx,
          selected: answers[`q${idx}`] || answers[q.text] || Object.values(answers)[idx] || '',
        }));

        this.codexSdkService.sendResponse(request.id, { answers: codexAnswers });
      } else {
        this.codexSdkService.sendResponse(request.id, undefined, {
          code: -32000,
          message: 'User cancelled',
        });
      }
    } catch (err: any) {
      this.logger.error(`Ask user question error: ${err.message}`);
      this.codexSdkService.sendResponse(request.id, undefined, {
        code: -32000,
        message: 'Timed out waiting for answer',
      });
    }
  }

  /**
   * Create a pending request and return a promise that resolves when the
   * frontend responds (or rejects on timeout).
   */
  private waitForResponse(
    id: string,
    jsonRpcId: number,
    method: string,
    params: any,
    projectName: string,
  ): Promise<CodexPermissionResponse> {
    return new Promise<CodexPermissionResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.logger.warn(`Codex permission request ${id} timed out after ${this.config.permissionTimeoutMs}ms`);
          reject(new Error('Permission request timed out'));
        }
      }, this.config.permissionTimeoutMs);

      this.pendingRequests.set(id, {
        id,
        jsonRpcId,
        method,
        params,
        projectName,
        resolve,
        reject,
        createdAt: new Date(),
        timer,
      });
    });
  }

  /**
   * Handle a response from the frontend (called by the controller).
   * Returns true if the response matched a pending request.
   */
  handleResponse(response: CodexPermissionResponse): boolean {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return false;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timer);

    this.logger.log(`Processing Codex permission response: ${response.id}, action: ${response.action}`);
    pending.resolve(response);
    return true;
  }

  /**
   * Get all pending requests (for debugging).
   */
  getPendingRequests(): Array<{
    id: string;
    method: string;
    projectName: string;
    createdAt: Date;
  }> {
    return Array.from(this.pendingRequests.values()).map((req) => ({
      id: req.id,
      method: req.method,
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
