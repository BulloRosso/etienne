import EventSource from 'eventsource';
import { ProviderEvent } from '../types';

type EventCallback = (event: ProviderEvent) => void;

export class SSEListenerService {
  private eventSource: EventSource | null = null;
  private callbacks: EventCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  constructor(private readonly backendUrl: string) {}

  /**
   * Subscribe to provider events
   */
  subscribe(callback: EventCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Start listening for events
   */
  start(): void {
    this.connect();
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private connect(): void {
    const url = `${this.backendUrl}/api/remote-sessions/events/telegram`;
    console.log(`[SSE] Connecting to ${url}...`);

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('[SSE] Connected to backend');
      this.reconnectAttempts = 0;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data: ProviderEvent = JSON.parse(event.data);
        console.log('[SSE] Received event:', data.type, data.data?.chatId);

        // Notify all callbacks
        for (const callback of this.callbacks) {
          try {
            callback(data);
          } catch (error) {
            console.error('[SSE] Error in callback:', error);
          }
        }
      } catch (error) {
        console.error('[SSE] Error parsing event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);

      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.attemptReconnect();
      }
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SSE] Max reconnect attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[SSE] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }
}
