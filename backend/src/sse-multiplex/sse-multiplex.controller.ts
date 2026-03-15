import { Controller, Get, Param, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { Subscription } from 'rxjs';
import { InterceptorsService } from '../interceptors/interceptors.service';
import { DeepResearchService } from '../deep-research/deep-research.service';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';
import { SSEPublisherService } from '../event-handling/publishers/sse-publisher.service';

/**
 * Multiplexed SSE endpoint that combines all per-project event streams
 * into a single connection, avoiding the browser's 6-connection HTTP/1.1 limit.
 *
 * Each event is wrapped so the frontend can demux:
 *   event: mux
 *   data: {"channel":"interceptor","type":"hook","payload":{...}}
 */
@Controller('api/sse')
export class SseMultiplexController {
  constructor(
    private readonly interceptorsService: InterceptorsService,
    private readonly deepResearchService: DeepResearchService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
    private readonly ssePublisher: SSEPublisherService,
  ) {}

  @Get('stream/:project')
  stream(
    @Param('project') project: string,
    @Query('channels') channels: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const subscriptions: Subscription[] = [];
    let alive = true;

    const send = (channel: string, eventType: string, payload: any) => {
      if (!alive) return;
      try {
        const data = JSON.stringify({ channel, type: eventType, payload });
        res.write(`event: mux\ndata: ${data}\n\n`);
      } catch {
        alive = false;
      }
    };

    // Parse requested channels (default: all)
    const requested = channels
      ? new Set(channels.split(','))
      : new Set(['interceptor', 'interceptor-global', 'research', 'budget', 'events']);

    // 1. Project interceptors
    if (requested.has('interceptor')) {
      const sub = this.interceptorsService
        .getSubject(project)
        .asObservable()
        .subscribe((event) => send('interceptor', event.type, event));
      subscriptions.push(sub);
    }

    // 2. Global interceptors (pairing requests)
    if (requested.has('interceptor-global')) {
      const sub = this.interceptorsService
        .getSubject('__global__')
        .asObservable()
        .subscribe((event) => send('interceptor-global', event.type, event));
      subscriptions.push(sub);
    }

    // 3. Deep research events
    if (requested.has('research')) {
      const sub = this.deepResearchService
        .getEventStream(project)
        .subscribe((event) => send('research', event.type, event.data));
      subscriptions.push(sub);
    }

    // 4. Budget monitoring
    if (requested.has('budget')) {
      const sub = this.budgetMonitoringService
        .getSubject(project)
        .subscribe((event) => send('budget', 'budget-update', event));
      subscriptions.push(sub);
    }

    // 5. Event handling (condition monitoring, prompt/workflow execution)
    // Use a fake Response proxy so SSEPublisherService writes get re-wrapped
    if (requested.has('events')) {
      const clientId = `mux_${project}_${Date.now()}`;
      const closeHandlers: (() => void)[] = [];

      const fakeResponse = {
        write: (message: string) => {
          // SSEPublisherService sends: "event: <type>\ndata: <json>\n\n"
          const match = message.match(/^event:\s*(.+)\ndata:\s*(.+)\n\n$/s);
          if (!match) return;
          const [, eventType, jsonStr] = match;
          // Skip heartbeats from SSEPublisher — we have our own
          if (eventType === 'heartbeat') return;
          try {
            send('events', eventType, JSON.parse(jsonStr));
          } catch {
            send('events', eventType, jsonStr);
          }
        },
        on: (event: string, handler: () => void) => {
          if (event === 'close') closeHandlers.push(handler);
        },
        setHeader: () => {},
      };

      this.ssePublisher.addClient(clientId, project, fakeResponse as any);

      // Wire cleanup: when real response closes, fire fake close handlers
      res.on('close', () => {
        closeHandlers.forEach((h) => h());
      });
    }

    // Heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      if (!alive) {
        clearInterval(heartbeat);
        return;
      }
      send('heartbeat', 'ping', { timestamp: Date.now() });
    }, 30000);

    // Send initial connected event
    send('system', 'connected', { project, channels: [...requested] });

    // Cleanup on disconnect
    res.on('close', () => {
      alive = false;
      clearInterval(heartbeat);
      subscriptions.forEach((s) => s.unsubscribe());
    });
  }
}
