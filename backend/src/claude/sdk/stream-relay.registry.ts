import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { MessageEvent } from '../types';

const GRACE_MS = Number(process.env.STREAM_DISCONNECT_GRACE_MS ?? 60_000);
const RETENTION_MS = Number(process.env.STREAM_BUFFER_RETENTION_MS ?? 120_000);
const MAX_BUFFERED_EVENTS = Number(process.env.STREAM_MAX_BUFFERED_EVENTS ?? 5_000);

export interface RelayOptions {
  /** Called when no client has been attached for graceMs while the run is live. */
  onAbandoned: () => void;
  graceMs?: number;
  retentionMs?: number;
  maxEvents?: number;
}

/**
 * Buffers every event of one agent run (with monotonically increasing SSE ids)
 * and forwards live events to whoever is currently attached.
 *
 * Replaces the abort-on-unsubscribe teardown: a page reload, sleeping laptop,
 * or proxy hiccup no longer kills the run. Instead:
 *   detach → grace timer → onAbandoned() (abort) only if nobody comes back.
 *   reattach → replay buffer (optionally after lastSeq) → continue live.
 *
 * Observer-compatible (next/complete/error), so runStreamPrompt needs NO changes.
 */
export class StreamRelay {
  private seq = 0;
  private buffer: Array<MessageEvent & { id: string }> = [];
  private firstSeq = 1; // seq of the oldest buffered event (moves on truncation)
  private subscribers = new Set<Subscriber<MessageEvent>>();
  private completed = false;
  private graceTimer?: ReturnType<typeof setTimeout>;
  private retentionTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly processId: string,
    private readonly opts: Required<RelayOptions>,
    private readonly onDispose: () => void,
    private readonly logger: Logger,
  ) {}

  // ---- observer-compatible surface (orchestrator writes here) -------------

  next(event: MessageEvent): void {
    if (this.completed) return;
    const stamped = { ...event, id: String(++this.seq) };
    this.buffer.push(stamped);
    if (this.buffer.length > this.opts.maxEvents) {
      this.buffer.splice(0, this.buffer.length - this.opts.maxEvents);
      this.firstSeq = Number(this.buffer[0].id);
    }
    for (const sub of this.subscribers) {
      try { sub.next(stamped); } catch { /* subscriber torn down mid-emit */ }
    }
  }

  complete(): void { this.finish((sub) => sub.complete()); }
  error(err: unknown): void { this.finish((sub) => sub.error(err)); }

  private finish(notify: (sub: Subscriber<MessageEvent>) => void): void {
    if (this.completed) return;
    this.completed = true;
    this.clearGrace();
    for (const sub of this.subscribers) { try { notify(sub); } catch { /* ignore */ } }
    this.subscribers.clear();
    // Keep the buffer around briefly so a reload right at completion can still
    // replay the final events, then dispose.
    this.retentionTimer = setTimeout(() => this.onDispose(), this.opts.retentionMs);
    this.retentionTimer.unref?.();
  }

  // ---- client attachment ---------------------------------------------------

  /** Initial subscription of the originating request. */
  asObservable(): Observable<MessageEvent> { return this.createAttachment(undefined); }

  /** Re-attachment after reload/transport error. lastSeq skips already-seen events. */
  attach(lastSeq?: number): Observable<MessageEvent> { return this.createAttachment(lastSeq); }

  private createAttachment(lastSeq?: number): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.clearGrace();

      const from = lastSeq ?? 0;
      if (from > 0 && from + 1 < this.firstSeq) {
        // Client asked to resume past the buffer horizon — tell it so it can
        // fall back to reloading chat history instead of showing a gap.
        subscriber.next({
          type: 'status',
          data: {
            status: 'replay_gap',
            message: `Events ${from + 1}–${this.firstSeq - 1} are no longer buffered`,
          },
        } as MessageEvent);
      }
      for (const ev of this.buffer) {
        if (Number(ev.id) > from) subscriber.next(ev);
      }

      if (this.completed) {
        subscriber.complete();
        return () => void 0;
      }

      this.subscribers.add(subscriber);
      return () => {
        this.subscribers.delete(subscriber);
        if (!this.completed && this.subscribers.size === 0) this.startGrace();
      };
    });
  }

  private startGrace(): void {
    this.clearGrace();
    this.logger.warn(
      `All clients detached from ${this.processId} — ${this.opts.graceMs}ms grace before abort`,
    );
    this.graceTimer = setTimeout(() => this.opts.onAbandoned(), this.opts.graceMs);
    this.graceTimer.unref?.();
  }

  private clearGrace(): void {
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = undefined; }
  }
}

@Injectable()
export class StreamRelayRegistry {
  private readonly logger = new Logger(StreamRelayRegistry.name);
  private readonly relays = new Map<string, StreamRelay>();

  createRelay(processId: string, options: RelayOptions): StreamRelay {
    const relay = new StreamRelay(
      processId,
      {
        onAbandoned: options.onAbandoned,
        graceMs: options.graceMs ?? GRACE_MS,
        retentionMs: options.retentionMs ?? RETENTION_MS,
        maxEvents: options.maxEvents ?? MAX_BUFFERED_EVENTS,
      },
      () => this.relays.delete(processId),
      this.logger,
    );
    this.relays.set(processId, relay);
    return relay;
  }

  attach(processId: string, lastSeq?: number): Observable<MessageEvent> {
    const relay = this.relays.get(processId);
    if (!relay) {
      // Completed past retention, or unknown id: tell the client explicitly so
      // it clears its bookmark and reloads chat history instead of hanging.
      return new Observable<MessageEvent>((subscriber) => {
        subscriber.next({
          type: 'error',
          data: {
            message: 'Stream not found — it may have completed a while ago',
            code: 'stream_not_found',
            recoverable: false,
          },
        } as MessageEvent);
        subscriber.complete();
      });
    }
    return relay.attach(lastSeq);
  }
}
