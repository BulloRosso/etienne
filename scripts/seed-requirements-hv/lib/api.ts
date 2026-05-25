/**
 * Thin authenticated-fetch wrapper for the seed script.
 *
 * Targets the backend on :6060 (env BACKEND_BASE override). Injects the
 * Bearer token captured at login and surfaces non-2xx responses as
 * readable errors with the response body included.
 */

const BACKEND_BASE = process.env.BACKEND_BASE || 'http://localhost:6060';

export interface ApiContext {
  accessToken: string;
}

export async function apiFetch<T = unknown>(
  ctx: ApiContext,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${BACKEND_BASE}${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set('authorization', `Bearer ${ctx.accessToken}`);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const resp = await fetch(url, { ...init, headers });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new ApiError(
      `${init.method ?? 'GET'} ${path} → HTTP ${resp.status}: ${body.slice(0, 400)}`,
      resp.status,
      body,
    );
  }
  const text = await resp.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: string) {
    super(message);
    this.name = 'ApiError';
  }
}
