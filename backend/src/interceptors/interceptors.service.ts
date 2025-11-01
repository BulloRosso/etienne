import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface InterceptorEvent {
  project: string;
  timestamp: string;
  type: 'hook' | 'event';
  data: any;
}

@Injectable()
export class InterceptorsService {
  private readonly logger = new Logger(InterceptorsService.name);

  // In-memory storage per project
  private hooks = new Map<string, any[]>();
  private events = new Map<string, any[]>();

  // SSE subjects per project
  private subjects = new Map<string, Subject<InterceptorEvent>>();

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

  getSubject(project: string): Subject<InterceptorEvent> {
    if (!this.subjects.has(project)) {
      this.subjects.set(project, new Subject<InterceptorEvent>());
    }
    return this.subjects.get(project)!;
  }
}
