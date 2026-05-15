import type { MqttEvent } from './events.js';

interface Ctx {
  token: string;
  apiBase: string;
  project: string;
}

export async function post(ctx: Ctx, evt: MqttEvent): Promise<void> {
  const url = `${ctx.apiBase}/api/external-events/${encodeURIComponent(ctx.project)}/messages/${encodeURIComponent(evt.topic)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${ctx.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: evt.type,
      machine: evt.machine,
      ts: evt.ts,
      payload: evt.payload,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.error(`[api] POST ${url} → HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
}
