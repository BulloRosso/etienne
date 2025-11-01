import { Injectable, Logger } from '@nestjs/common';
import { InterceptorsService } from '../../interceptors/interceptors.service';

/**
 * Service to emit Claude Code hooks and events for SDK-based conversations
 * This replicates the hook system that works automatically with the CLI approach
 */
@Injectable()
export class SdkHookEmitterService {
  private readonly logger = new Logger(SdkHookEmitterService.name);

  constructor(private readonly interceptorsService: InterceptorsService) {}

  /**
   * Emit UserPromptSubmit event
   */
  emitUserPromptSubmit(projectName: string, data: {
    prompt: string;
    timestamp?: string;
    session_id?: string;
  }) {
    const event = {
      event_type: 'UserPromptSubmit',
      timestamp: data.timestamp || new Date().toISOString(),
      prompt: data.prompt,
      session_id: data.session_id,
    };

    this.logger.debug(`Emitting UserPromptSubmit for ${projectName}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }

  /**
   * Emit SessionStart event
   */
  emitSessionStart(projectName: string, data: {
    session_id: string;
    model?: string;
    timestamp?: string;
  }) {
    const event = {
      event_type: 'SessionStart',
      timestamp: data.timestamp || new Date().toISOString(),
      session_id: data.session_id,
      model: data.model,
    };

    this.logger.debug(`Emitting SessionStart for ${projectName}: ${data.session_id}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }

  /**
   * Emit PreToolUse hook
   */
  emitPreToolUse(projectName: string, data: {
    tool_name: string;
    tool_input?: any;
    call_id?: string;
    timestamp?: string;
    session_id?: string;
  }) {
    const event = {
      event_type: 'PreToolUse',
      timestamp: data.timestamp || new Date().toISOString(),
      tool_name: data.tool_name,
      tool_input: data.tool_input,
      call_id: data.call_id,
      session_id: data.session_id,
    };

    this.logger.debug(`Emitting PreToolUse for ${projectName}: ${data.tool_name}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }

  /**
   * Emit PostToolUse hook
   */
  emitPostToolUse(projectName: string, data: {
    tool_name: string;
    tool_output?: any;
    call_id?: string;
    timestamp?: string;
    session_id?: string;
    error?: string;
  }) {
    const event = {
      event_type: 'PostToolUse',
      timestamp: data.timestamp || new Date().toISOString(),
      tool_name: data.tool_name,
      tool_output: data.tool_output,
      call_id: data.call_id,
      session_id: data.session_id,
      error: data.error,
    };

    this.logger.debug(`Emitting PostToolUse for ${projectName}: ${data.tool_name}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }

  /**
   * Emit Notification event
   */
  emitNotification(projectName: string, data: {
    message: string;
    level?: 'info' | 'warning' | 'error';
    timestamp?: string;
    session_id?: string;
  }) {
    const event = {
      event_type: 'Notification',
      timestamp: data.timestamp || new Date().toISOString(),
      message: data.message,
      level: data.level || 'info',
      session_id: data.session_id,
    };

    this.logger.debug(`Emitting Notification for ${projectName}: ${data.message}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }

  /**
   * Emit Stop event (conversation completed)
   */
  emitStop(projectName: string, data: {
    reason?: string;
    timestamp?: string;
    session_id?: string;
    usage?: any;
  }) {
    const event = {
      event_type: 'Stop',
      timestamp: data.timestamp || new Date().toISOString(),
      reason: data.reason || 'completed',
      session_id: data.session_id,
      usage: data.usage,
    };

    this.logger.debug(`Emitting Stop for ${projectName}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }

  /**
   * Emit SubagentStop event
   */
  emitSubagentStop(projectName: string, data: {
    subagent_name?: string;
    timestamp?: string;
    session_id?: string;
  }) {
    const event = {
      event_type: 'SubagentStop',
      timestamp: data.timestamp || new Date().toISOString(),
      subagent_name: data.subagent_name,
      session_id: data.session_id,
    };

    this.logger.debug(`Emitting SubagentStop for ${projectName}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }

  /**
   * Emit PreCompact event
   */
  emitPreCompact(projectName: string, data: {
    timestamp?: string;
    session_id?: string;
    message_count?: number;
  }) {
    const event = {
      event_type: 'PreCompact',
      timestamp: data.timestamp || new Date().toISOString(),
      session_id: data.session_id,
      message_count: data.message_count,
    };

    this.logger.debug(`Emitting PreCompact for ${projectName}`);
    this.interceptorsService.addInterceptor(projectName, event);
  }
}
