import { Controller, Get, Param, Res, Query, Headers } from '@nestjs/common';
import { Response } from 'express';
import { Subscription } from 'rxjs';
import { InterceptorsService } from '../interceptors/interceptors.service';
import { DeepResearchService } from '../deep-research/deep-research.service';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';
import { SSEPublisherService } from '../event-handling/publishers/sse-publisher.service';
import { MuxChannel, MuxEventType, MuxEnvelope } from './sse-mux.types';

/**
 * Multiplexed SSE endpoint that combines all per-project event streams
 * into a single connection, avoiding the browser's 6-connection HTTP/1.1 limit.
 *
 * Each event is wrapped with a sequence ID for reliable reconnection:
 *   id: 42
 *   event: mux
 *   data: {"channel":"interceptor","type":"hook","payload":{...}}
 *
 * Clients can send Last-Event-Id header on reconnection to replay missed events.
 */
@Controller('api/sse')
export class SseMultiplexController {
  /** Per-project ring buffer of recent events for replay on reconnection */
  private replayBuffers = new Map<string, { seq: number; events: Array<{ id: number; data: string }> }>();

  /** Max events to retain per project for replay */
  private readonly REPLAY_BUFFER_SIZE = 100;

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
    @Headers('last-event-id') lastEventId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const subscriptions: Subscription[] = [];
    let alive = true;

    // Initialize replay buffer for this project
    if (!this.replayBuffers.has(project)) {
      this.replayBuffers.set(project, { seq: 0, events: [] });
    }
    const buffer = this.replayBuffers.get(project)!;

    // Replay missed events if Last-Event-Id is provided
    if (lastEventId) {
      const lastSeq = parseInt(lastEventId, 10);
      if (!isNaN(lastSeq)) {
        const missed = buffer.events.filter((e) => e.id > lastSeq);
        for (const event of missed) {
          if (!alive) break;
          try {
            res.write(`id: ${event.id}\nevent: mux\ndata: ${event.data}\n\n`);
          } catch {
            alive = false;
          }
        }
      }
    }

    const send = (channel: MuxChannel, eventType: MuxEventType, payload: any) => {
      if (!alive) return;
      try {
        const envelope: MuxEnvelope = { channel, type: eventType, payload };
        const data = JSON.stringify(envelope);
        const seq = ++buffer.seq;

        // Store in ring buffer for replay
        buffer.events.push({ id: seq, data });
        if (buffer.events.length > this.REPLAY_BUFFER_SIZE) {
          buffer.events.shift();
        }

        res.write(`id: ${seq}\nevent: mux\ndata: ${data}\n\n`);
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
        .subscribe((event) => send('interceptor', event.type as MuxEventType, event));
      subscriptions.push(sub);
    }

    // 2. Global interceptors (pairing requests)
    if (requested.has('interceptor-global')) {
      const sub = this.interceptorsService
        .getSubject('__global__')
        .asObservable()
        .subscribe((event) => send('interceptor-global', event.type as MuxEventType, event));
      subscriptions.push(sub);
    }

    // 3. Deep research events
    if (requested.has('research')) {
      const sub = this.deepResearchService
        .getEventStream(project)
        .subscribe((event) => send('research', event.type as MuxEventType, event.data));
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
            send('events', eventType as MuxEventType, JSON.parse(jsonStr));
          } catch {
            send('events', eventType as MuxEventType, jsonStr);
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

    // Heartbeat every 30 seconds (not sequenced — heartbeats are ephemeral)
    const heartbeat = setInterval(() => {
      if (!alive) {
        clearInterval(heartbeat);
        return;
      }
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
      } catch {
        alive = false;
        clearInterval(heartbeat);
      }
    }, 30000);

    // Send initial connected event (sequenced so client knows starting point)
    send('system', 'connected', { project, channels: [...requested] });

    // Cleanup on disconnect
    res.on('close', () => {
      alive = false;
      clearInterval(heartbeat);
      subscriptions.forEach((s) => s.unsubscribe());
    });
  }
}
