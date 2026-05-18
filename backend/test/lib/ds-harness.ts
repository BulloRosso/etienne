/**
 * Shared harness for the design-support (Engineering Design Support System)
 * integration tests.
 *
 * Same conventions as the other integration-*.test.ts files: HTTP against the
 * live backend (:6060) + OAuth (:5950) + Quadstore (:7000); auto-SKIP (exit 0)
 * when a required service is unreachable; a unique throwaway project per run;
 * `PASS`/`SKIP` logging; process.exit(1) on a failed assertion.
 *
 * These tests prove the SPEC §4 information-flow dependencies propagate. Each
 * test seeds the minimum graph it needs over the live KG, drives one trigger,
 * and asserts the derived state changed.
 */

import { randomUUID } from 'node:crypto';

export const OAUTH_BASE = process.env.OAUTH_BASE || 'http://localhost:5950';
export const BACKEND_BASE = process.env.BACKEND_BASE || 'http://localhost:6060';
export const QUADSTORE_URL = process.env.QUADSTORE_URL || 'http://localhost:7000';

let cachedToken: string | null = null;

async function reachable(url: string, ms = 2000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    return !!r;
  } catch {
    return false;
  }
}

/**
 * Returns false (and logs SKIP) when backend or Quadstore is down, so the
 * caller can `return` early and exit 0.
 */
export async function servicesUp(testName: string): Promise<boolean> {
  const backend = await reachable(`${BACKEND_BASE}/docs`);
  const quad = await reachable(`${QUADSTORE_URL}/health`);
  if (!backend) {
    console.log(`SKIP ${testName} — backend not reachable at ${BACKEND_BASE}`);
    return false;
  }
  if (!quad) {
    console.log(`SKIP ${testName} — Quadstore not reachable at ${QUADSTORE_URL}`);
    return false;
  }
  return true;
}

export async function login(): Promise<string> {
  if (cachedToken) return cachedToken;
  const username = process.env.SEED_USERNAME || 'admin';
  const password = process.env.SEED_PASSWORD || 'admin123';
  const r = await fetch(`${OAUTH_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(`login failed: HTTP ${r.status}`);
  const j = (await r.json()) as { accessToken?: string };
  if (!j.accessToken) throw new Error('login: no accessToken');
  cachedToken = j.accessToken;
  return cachedToken;
}

export async function api<T = any>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const r = await fetch(`${BACKEND_BASE}${path}`, { ...init, headers });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${init.method ?? 'GET'} ${path} → HTTP ${r.status}: ${body.slice(0, 300)}`);
  }
  const text = await r.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export function throwawayProject(prefix = 'int-ds'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Minimal KG helpers (same wire routes the seed uses). */
export async function kgEntity(
  token: string,
  project: string,
  id: string,
  type: string,
  properties: Record<string, string>,
): Promise<void> {
  await api(token, `/api/knowledge-graph/${project}/entities`, {
    method: 'POST',
    body: JSON.stringify({ id, type, properties }),
  });
}

export async function kgEdge(
  token: string,
  project: string,
  subject: string,
  predicate: string,
  object: string,
  properties?: Record<string, string>,
): Promise<void> {
  await api(token, `/api/knowledge-graph/${project}/relationships`, {
    method: 'POST',
    body: JSON.stringify({ subject, predicate, object, properties }),
  });
}

export async function kgFindByType(
  token: string,
  project: string,
  type: string,
): Promise<any[]> {
  // Generic SPARQL via the shared-knowledge / kg query path is not exposed as
  // a plain REST GET; use the entities-by-type endpoint the KG controller
  // provides. Fall back to the raw list endpoint if present.
  try {
    return await api(token, `/api/knowledge-graph/${project}/entities?type=${encodeURIComponent(type)}`);
  } catch {
    return [];
  }
}

let passes = 0;
export function pass(msg: string): void {
  passes += 1;
  console.log(`  PASS  ${msg}`);
}
export function done(testName: string): void {
  console.log(`\n${testName}: all ${passes} assertions passed.`);
}

/** Wrap a test body: handles SKIP, prints failures, sets exit code. */
export async function runTest(
  testName: string,
  body: () => Promise<void>,
): Promise<void> {
  try {
    if (!(await servicesUp(testName))) return;
    console.log(`# ${testName} — services live`);
    await body();
    done(testName);
  } catch (err) {
    console.error(`\nFAILED ${testName}:`, err instanceof Error ? err.stack : err);
    process.exit(1);
  }
}
