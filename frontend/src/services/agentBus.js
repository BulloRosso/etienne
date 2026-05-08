// AgentBus: a tiny pub/sub for "the user just did X in a viewer" events.
//
// Viewers opt in by attaching a static `agentbusEventsOut()` method to their
// React component. The method returns an array of event descriptors:
//
//   { id, description, payloadSchema, chatTemplate, autoSubmit }
//
// When the viewer dispatches an event via `agentBus.emit(viewerName, eventId,
// payload, { filename })`, the bus:
//   - merges the reserved fields `filename` and `viewerInstanceId` into the
//     payload (so they're always available to templates and to the agent),
//   - records the event in a per-(viewer, filename) ring buffer of size 20
//     so two simultaneously-open viewers of the same kind don't collide,
//   - if the descriptor has `autoSubmit: true` and a `chatTemplate`, dispatches
//     a `viewer-auto-prompt` window event with the rendered message — App.jsx
//     listens for this and routes it through `handleSendMessage`.
//
// Non-auto events are still recorded; `drainRecent(viewerName, filename)`
// returns and clears the buffer for one viewer instance, so the orchestrator
// can include recent events in the next prompt's <agentbus-events-out> block.

const RING_BUFFER_SIZE = 20;

const catalogs = new Map();      // viewerName → catalog array
const recentEvents = new Map();  // `${viewerName}::${filename}` → ring buffer

function renderTemplate(tpl, payload) {
  return tpl.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const v = key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), payload);
    return v == null ? '' : String(v);
  });
}

export const agentBus = {
  registerCatalog(viewerName, component) {
    if (component?.agentbusEventsOut) {
      try {
        catalogs.set(viewerName, component.agentbusEventsOut());
      } catch (e) {
        console.warn(`[agentBus] catalog registration failed for ${viewerName}:`, e);
      }
    }
  },

  registerCatalogDirect(viewerName, catalog) {
    if (Array.isArray(catalog)) {
      catalogs.set(viewerName, catalog);
    }
  },

  getCatalog(viewerName) {
    return catalogs.get(viewerName) || [];
  },

  emit(viewerName, eventId, payload, opts = {}) {
    const filename = opts.filename;
    const viewerInstanceId = opts.viewerInstanceId || filename;
    if (!filename) {
      console.warn(`[agentBus] emit ${viewerName}/${eventId} without filename — dropping`);
      return;
    }
    const cat = catalogs.get(viewerName) || [];
    const spec = cat.find(e => e.id === eventId);
    if (!spec) {
      console.warn(`[agentBus] unknown event ${viewerName}/${eventId}`);
      return;
    }

    const fullPayload = { ...payload, filename, viewerInstanceId };

    const bufferKey = `${viewerName}::${filename}`;
    const buf = recentEvents.get(bufferKey) || [];
    buf.push({ eventId, payload: fullPayload, timestamp: new Date().toISOString() });
    recentEvents.set(bufferKey, buf.slice(-RING_BUFFER_SIZE));

    if (spec.autoSubmit && spec.chatTemplate) {
      const message = renderTemplate(spec.chatTemplate, fullPayload);
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('viewer-auto-prompt', {
          detail: { source: viewerName, filename, viewerInstanceId, eventId, message },
        }));
      });
    }
  },

  drainRecent(viewerName, filename) {
    const bufferKey = `${viewerName}::${filename}`;
    const buf = recentEvents.get(bufferKey) || [];
    recentEvents.set(bufferKey, []);
    return buf;
  },
};

if (typeof window !== 'undefined') {
  window.agentBus = agentBus;
}
