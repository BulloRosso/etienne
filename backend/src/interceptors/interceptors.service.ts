import { Injectable, Logger } from '@nestjs/common';
import { ReplaySubject, Subject } from 'rxjs';

export interface InterceptorEvent {
  project: string;
  timestamp: string;
  type: 'hook' | 'event' | 'elicitation_request' | 'permission_request' | 'ask_user_question' | 'plan_approval';
  data: any;
}

@Injectable()
export class InterceptorsService {
  private readonly logger = new Logger(InterceptorsService.name);

  // In-memory storage per project
  private hooks = new Map<string, any[]>();
  private events = new Map<string, any[]>();

  // SSE subjects per project - using ReplaySubject to buffer recent events
  // This ensures events emitted before a subscriber connects are not lost
  private subjects = new Map<string, ReplaySubject<InterceptorEvent>>();

  addInterceptor(project: string, data: any) {
    const timestamp = new Date().toISOString();
    const item = { ...data, timestamp };

    // Determine if this is a hook or event based on the X-Claude-Event header
    // Events: UserPromptSubmit, Notification, Stop, SubagentStop, PreCompact, SessionStart, file_added, file_changed
    // Hooks: PreToolUse, PostToolUse
    const eventType = data.event_type || '';
    const isHook = ['PreToolUse', 'PostToolUse'].includes(eventType);
    const type = isHook ? 'hook' : 'event';

    this.logger.debug(`Adding interceptor for ${project}: type=${type}, event_type=${eventType}`);

    // Store in appropriate collection
    if (isHook) {
      if (!this.hooks.has(project)) {
        this.hooks.set(project, []);
      }
      this.hooks.get(project)!.push(item);
    } else {
      if (!this.events.has(project)) {
        this.events.set(project, []);
      }
      this.events.get(project)!.push(item);
    }

    // Broadcast via SSE
    const subject = this.getSubject(project);
    subject.next({ project, timestamp, type, data: item });

    return { success: true, type };
  }

  getHooks(project: string) {
    const hooks = this.hooks.get(project) || [];
    return hooks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getEvents(project: string) {
    const events = this.events.get(project) || [];
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getSubject(project: string): ReplaySubject<InterceptorEvent> {
    if (!this.subjects.has(project)) {
      // Buffer up to 10 recent events for 30 seconds
      // This handles race conditions where events are emitted before SSE connects
      this.subjects.set(project, new ReplaySubject<InterceptorEvent>(10, 30000));
    }
    return this.subjects.get(project)!;
  }

  /**
   * Emit an elicitation request to the frontend via SSE
   * This is called by the MCP server when a tool requests user input
   */
  emitElicitationRequest(project: string, elicitationData: {
    id: string;
    message: string;
    requestedSchema: any;
    toolName: string;
  }) {
    const timestamp = new Date().toISOString();
    this.logger.log(`Emitting elicitation request for project "${project}": ${elicitationData.id}`);

    const subject = this.getSubject(project);
    subject.next({
      project,
      timestamp,
      type: 'elicitation_request',
      data: elicitationData
    });
  }

  /**
   * Emit a permission request to the frontend via SSE
   * This is called when the SDK's canUseTool callback needs user approval
   */
  emitPermissionRequest(project: string, data: {
    id: string;
    toolName: string;
    toolInput: any;
    suggestions?: Array<{ toolName: string; permission: 'allow' | 'deny' | 'ask' }>;
  }) {
    const timestamp = new Date().toISOString();
    this.logger.log(`Emitting permission request for project "${project}": ${data.id} (tool: ${data.toolName})`);

    const subject = this.getSubject(project);
    subject.next({
      project,
      timestamp,
      type: 'permission_request',
      data
    });
  }

  /**
   * Emit an AskUserQuestion request to the frontend via SSE
   * This is called when Claude uses the AskUserQuestion tool
   */
  emitAskUserQuestion(project: string, data: {
    id: string;
    questions: Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiSelect: boolean;
    }>;
  }) {
    const timestamp = new Date().toISOString();
    this.logger.log(`Emitting AskUserQuestion for project "${project}": ${data.id} (${data.questions.length} questions)`);

    const subject = this.getSubject(project);
    subject.next({
      project,
      timestamp,
      type: 'ask_user_question',
      data
    });
  }

  /**
   * Emit a plan approval request to the frontend via SSE
   * This is called when Claude uses the ExitPlanMode tool
   */
  emitPlanApproval(project: string, data: {
    id: string;
    planFilePath: string;
  }) {
    const timestamp = new Date().toISOString();
    this.logger.log(`Emitting plan approval request for project "${project}": ${data.id}`);

    const subject = this.getSubject(project);
    subject.next({
      project,
      timestamp,
      type: 'plan_approval',
      data
    });
  }
}
