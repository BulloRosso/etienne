import { apiFetch } from './api';

export async function listApplicationTypes(lng) {
  const url = '/api/application-types' + (lng ? `?lng=${encodeURIComponent(lng)}` : '');
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load application types');
  const data = await res.json();
  return data.applicationTypes || [];
}

export async function getEffectiveApplicationType(project, lng) {
  if (!project) return null;
  const url = `/api/application-types/effective/${encodeURIComponent(project)}` + (lng ? `?lng=${encodeURIComponent(lng)}` : '');
  const res = await apiFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.config || null;
}

export async function setProjectApplicationType(project, id) {
  const res = await apiFetch(`/api/application-types/project/${encodeURIComponent(project)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id || null }),
  });
  if (!res.ok) {
    let msg = 'Failed to set application type';
    try { const j = await res.json(); msg = j?.message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
