import { apiFetch, authSSEUrl, API_BASE } from './api';

export async function getFirstRunStatus() {
  const res = await apiFetch('/api/first-run/status');
  if (!res.ok) {
    throw new Error(`first-run/status failed (${res.status})`);
  }
  return res.json();
}

export async function runDiagnostics() {
  const res = await apiFetch('/api/first-run/diagnostics', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`first-run/diagnostics failed (${res.status})`);
  }
  return res.json();
}

export async function completeFirstRun(summary) {
  const res = await apiFetch('/api/first-run/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`first-run/complete failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function resetFirstRun(userId) {
  const res = await apiFetch(`/api/first-run/reset/${encodeURIComponent(userId)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`first-run/reset failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Returns an EventSource for diagnostics streaming. Caller is responsible for closing.
export function openDiagnosticsStream() {
  const url = authSSEUrl('/api/first-run/diagnostics/stream');
  return new EventSource(url);
}

export function openSupportSessionStream({ applyItemId, userPrompt } = {}) {
  const params = new URLSearchParams();
  if (applyItemId) params.set('applyItemId', applyItemId);
  if (userPrompt) params.set('userPrompt', userPrompt);
  const qs = params.toString();
  const url = authSSEUrl(`/api/first-run/support-session/stream${qs ? `?${qs}` : ''}`);
  return new EventSource(url);
}
