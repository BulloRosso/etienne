import { apiAxios } from './api';

export async function listProfiles() {
  const res = await apiAxios.get('/api/packages/profiles');
  return res.data.profiles || [];
}

export async function getProfile(id) {
  const res = await apiAxios.get(`/api/packages/profiles/${encodeURIComponent(id)}`);
  return res.data;
}

export async function saveProfile(id, manifest) {
  const res = await apiAxios.put(
    `/api/packages/profiles/${encodeURIComponent(id)}`,
    manifest,
  );
  return res.data;
}

export async function deleteProfile(id) {
  await apiAxios.delete(`/api/packages/profiles/${encodeURIComponent(id)}`);
}
