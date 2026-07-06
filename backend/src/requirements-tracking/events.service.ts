import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { TtFilesService } from './store/files.service';
import { FeedEvent } from './types/tendertrace-types';

/**
 * Activity/event feed for TenderTrace.
 *
 * Two consumers:
 *  - the host frontend via the SSE multiplexer (channel 'reqtrack', wired in
 *    sse-multiplex.controller.ts) — gets live pushes;
 *  - the sandboxed MCP-app iframe, which cannot open SSE (opaque origin, no JWT)
 *    and therefore polls rt_get_events {sinceSeq} against the persisted feed.
 *
 * Events are appended to requirements-tracking/events.jsonl (survives restarts,
 * powers the P-02 activity feed) and mirrored in an in-memory ring buffer.
 */
@Injectable()
export class TtEventsService {
  private readonly logger = new Logger(TtEventsService.name);
  private readonly ringSize = 500;
  private readonly rings = new Map<string, FeedEvent[]>();
  private readonly seqs = new Map<string, number>();
  private readonly subjects = new Map<string, Subject<FeedEvent>>();
  private readonly initialized = new Set<string>();

  constructor(private readonly files: TtFilesService) {}

  /** RxJS stream for the SSE multiplexer. */
  stream(project: string): Subject<FeedEvent> {
    let subject = this.subjects.get(project);
    if (!subject) {
      subject = new Subject<FeedEvent>();
      this.subjects.set(project, subject);
    }
    return subject;
  }

  private async ensureLoaded(project: string): Promise<void> {
    if (this.initialized.has(project)) return;
    this.initialized.add(project);
    const lines = await this.files.readLines(project, 'events.jsonl');
    const events: FeedEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // skip corrupt lines
      }
    }
    const tail = events.slice(-this.ringSize);
    this.rings.set(project, tail);
    this.seqs.set(project, events.length > 0 ? events[events.length - 1].seq : 0);
  }

  async emit(project: string, type: string, payload: any = {}): Promise<FeedEvent> {
    await this.ensureLoaded(project);
    const seq = (this.seqs.get(project) ?? 0) + 1;
    this.seqs.set(project, seq);
    const event: FeedEvent = { seq, ts: new Date().toISOString(), type, payload };

    const ring = this.rings.get(project) ?? [];
    ring.push(event);
    if (ring.length > this.ringSize) ring.splice(0, ring.length - this.ringSize);
    this.rings.set(project, ring);

    try {
      await this.files.appendLine(project, 'events.jsonl', JSON.stringify(event));
    } catch (error: any) {
      this.logger.warn(`Failed to persist event for ${project}: ${error.message}`);
    }
    this.stream(project).next(event);
    return event;
  }

  /** Poll API for the iframe: events with seq > sinceSeq (ring buffer, then file fallback). */
  async since(project: string, sinceSeq = 0, limit = 200): Promise<{ events: FeedEvent[]; lastSeq: number }> {
    await this.ensureLoaded(project);
    const ring = this.rings.get(project) ?? [];
    const lastSeq = this.seqs.get(project) ?? 0;

    let events: FeedEvent[];
    if (ring.length > 0 && (ring[0].seq <= sinceSeq + 1 || sinceSeq >= ring[0].seq - 1)) {
      events = ring.filter((event) => event.seq > sinceSeq);
    } else {
      // requested range predates the ring — read from file
      const lines = await this.files.readLines(project, 'events.jsonl');
      events = [];
      for (const line of lines) {
        try {
          const event: FeedEvent = JSON.parse(line);
          if (event.seq > sinceSeq) events.push(event);
        } catch {
          // skip
        }
      }
    }
    return { events: events.slice(-limit), lastSeq };
  }
}
