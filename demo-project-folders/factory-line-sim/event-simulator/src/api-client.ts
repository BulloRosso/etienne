import type { MqttEvent } from './events.js';

interface Ctx {
  getToken: () => string;
  refreshToken: () => Promise<string>;
  apiBase: string;
  project: string;
}

async function send(url: string, token: string, evt: MqttEvent): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: evt.type,
      machine: evt.machine,
      ts: evt.ts,
      payload: evt.payload,
    }),
  });
}

export async function post(ctx: Ctx, evt: MqttEvent): Promise<void> {
  const url = `${ctx.apiBase}/api/external-events/${encodeURIComponent(ctx.project)}/messages/${encodeURIComponent(evt.topic)}`;
  let r = await send(url, ctx.getToken(), evt);
  if (r.status === 401) {
    const fresh = await ctx.refreshToken();
    r = await send(url, fresh, evt);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.error(`[api] POST ${url} → HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
}
