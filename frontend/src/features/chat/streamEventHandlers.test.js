import { describe, it, expect, vi } from 'vitest';
import { streamEventHandlers } from './streamEventHandlers';

// Minimal stand-in for the `api` capability object. updateStructuredMessages
// applies the updater against a local array so we can assert the result.
function makeApi(overrides = {}) {
  const state = { structured: [], messages: [] };
  return {
    state,
    ctx: { targetRef: { current: 'state' }, streamMsg: { role: 'assistant', text: '' }, textBuffer: '' },
    updateStructuredMessages: vi.fn(updater => { state.structured = updater(state.structured); }),
    updateMessages: vi.fn(updater => { state.messages = updater(state.messages); }),
    pushSystemEvent: vi.fn(),
    ensureAssistantMessage: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

describe('thinking coalescing', () => {
  it('appends consecutive thinking deltas into one structured item', () => {
    const api = makeApi();
    streamEventHandlers.thinking({ content: 'Let me ' }, api);
    streamEventHandlers.thinking({ content: 'think about ' }, api);
    streamEventHandlers.thinking({ content: 'this.' }, api);

    expect(api.state.structured).toHaveLength(1);
    expect(api.state.structured[0]).toMatchObject({
      type: 'thinking',
      content: 'Let me think about this.',
    });
  });

  it('starts a new thinking block when a non-thinking item intervenes', () => {
    const api = makeApi();
    streamEventHandlers.thinking({ content: 'first block' }, api);
    // A tool/text item lands in between.
    api.updateStructuredMessages(prev => [...prev, { id: 't1', type: 'tool_call' }]);
    streamEventHandlers.thinking({ content: 'second block' }, api);

    const thinkings = api.state.structured.filter(m => m.type === 'thinking');
    expect(thinkings).toHaveLength(2);
    expect(thinkings[0].content).toBe('first block');
    expect(thinkings[1].content).toBe('second block');
  });

  it('ignores empty thinking content', () => {
    const api = makeApi();
    streamEventHandlers.thinking({ content: '' }, api);
    expect(api.state.structured).toHaveLength(0);
  });
});

describe('error handler', () => {
  it('keeps streaming on a recoverable application error (no stop)', () => {
    const api = makeApi();
    streamEventHandlers.error({ recoverable: true, message: 'transient hiccup' }, api);
    expect(api.pushSystemEvent).toHaveBeenCalledWith('error', 'transient hiccup', expect.any(Object));
    expect(api.stop).not.toHaveBeenCalled();
  });

  it('surfaces and stops on a fatal application error (data with message)', () => {
    const api = makeApi();
    streamEventHandlers.error({ message: 'fatal boom' }, api);
    expect(api.pushSystemEvent).toHaveBeenCalledWith('error', 'fatal boom', expect.any(Object));
    expect(api.stop).toHaveBeenCalledTimes(1);
  });

  it('stops silently on a native transport error with no active processId', () => {
    const api = makeApi();
    streamEventHandlers.error(null, api, { target: { close: vi.fn() } });
    expect(api.stop).toHaveBeenCalledTimes(1);
  });

  it('reattaches (does not stop) on a transport error while a run is live', () => {
    vi.useFakeTimers();
    try {
      const close = vi.fn();
      const api = makeApi({
        currentProject: 'p',
        reattachToStream: vi.fn(),
        ctx: { targetRef: { current: 'state' }, stopped: false, processId: 'sdk_1', lastEventId: '42', reconnectAttempts: 0 },
      });
      streamEventHandlers.error(null, api, { target: { close } });

      expect(close).toHaveBeenCalledTimes(1); // closes immediately (no auto-resubmit)
      expect(api.stop).not.toHaveBeenCalled();
      expect(api.ctx.reconnectAttempts).toBe(1);

      vi.runOnlyPendingTimers();
      expect(api.reattachToStream).toHaveBeenCalledWith('sdk_1', expect.objectContaining({
        existingCtx: api.ctx,
        lastEventId: '42',
        currentProject: 'p',
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up (stops) after 3 reconnect attempts', () => {
    const api = makeApi({
      reattachToStream: vi.fn(),
      ctx: { targetRef: { current: 'state' }, stopped: false, processId: 'sdk_1', reconnectAttempts: 3 },
    });
    streamEventHandlers.error(null, api, { target: { close: vi.fn() } });
    expect(api.reattachToStream).not.toHaveBeenCalled();
    expect(api.stop).toHaveBeenCalledTimes(1);
  });

  it('clears the bookmark and stops on stream_not_found', () => {
    const removeItem = vi.fn();
    const orig = globalThis.sessionStorage;
    globalThis.sessionStorage = { removeItem, getItem: vi.fn(), setItem: vi.fn() };
    try {
      const api = makeApi({ currentProject: 'proj' });
      streamEventHandlers.error({ code: 'stream_not_found', message: 'gone' }, api);
      expect(removeItem).toHaveBeenCalledWith('etienne.activeStream.proj');
      expect(api.stop).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.sessionStorage = orig;
    }
  });

  it('arms the Retry affordance on a fatal application error', () => {
    const setRetryAvailable = vi.fn();
    const api = makeApi({ setRetryAvailable });
    streamEventHandlers.error({ message: 'boom' }, api);
    expect(setRetryAvailable).toHaveBeenCalledWith({ reason: 'boom' });
  });
});

describe('api_error handler', () => {
  it('carries the retryable flag and arms Retry', () => {
    const setRetryAvailable = vi.fn();
    const api = makeApi({ setRetryAvailable });
    streamEventHandlers.api_error({ message: 'overloaded', fullError: 'x', retryable: true }, api);
    expect(api.state.structured[0]).toMatchObject({ type: 'api_error', retryable: true });
    expect(setRetryAvailable).toHaveBeenCalledWith({ reason: 'overloaded' });
  });
});

describe('completed handler', () => {
  it('finalizes via stop()', () => {
    const api = makeApi();
    streamEventHandlers.completed({}, api);
    expect(api.stop).toHaveBeenCalledTimes(1);
  });
});

describe('status handler', () => {
  it('creates the assistant message when queued so the typing indicator runs', () => {
    const api = makeApi();
    streamEventHandlers.status({ status: 'queued', message: 'Waiting' }, api);
    expect(api.ensureAssistantMessage).toHaveBeenCalledTimes(1);
    expect(api.pushSystemEvent).toHaveBeenCalledWith('status', 'queued · Waiting', expect.any(Object));
  });

  it('does not create an assistant message for non-queued statuses', () => {
    const api = makeApi();
    streamEventHandlers.status({ status: 'thinking' }, api);
    expect(api.ensureAssistantMessage).not.toHaveBeenCalled();
  });
});
