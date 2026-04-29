import axios from 'axios';

/**
 * Centralized API client with automatic JWT authentication.
 *
 * Exports:
 *   apiFetch(url, options)  - drop-in replacement for fetch()
 *   apiAxios                - pre-configured axios instance
 *   authSSEUrl(url)         - appends ?token= for EventSource URLs
 *   API_BASE               - base URL for API requests (empty in dev, Foundry endpoint URL in prod)
 */

// In Foundry mode the frontend is hosted externally and API calls must
// be routed through the Foundry agent endpoint URL. Set VITE_API_BASE_URL
// at build time (e.g. VITE_API_BASE_URL=https://<endpoint> npm run build).
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function getAccessToken() {
  return localStorage.getItem('auth_accessToken')
    || sessionStorage.getItem('auth_accessToken');
}

function getRefreshToken() {
  return localStorage.getItem('auth_refreshToken')
    || sessionStorage.getItem('auth_refreshToken');
}

function getStorage() {
  if (localStorage.getItem('auth_accessToken')) return localStorage;
  return sessionStorage;
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      const storage = getStorage();
      storage.setItem('auth_accessToken', data.accessToken);
      return data.accessToken;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }

  return null;
}

function handleAuthFailure() {
  localStorage.removeItem('auth_accessToken');
  localStorage.removeItem('auth_refreshToken');
  sessionStorage.removeItem('auth_accessToken');
  sessionStorage.removeItem('auth_refreshToken');
  window.dispatchEvent(new Event('auth:logout'));
}

// ---------------------------------------------------------------------------
// apiFetch - drop-in replacement for fetch()
// ---------------------------------------------------------------------------

export async function apiFetch(url, options = {}) {
  const token = getAccessToken();
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(fullUrl, { ...options, headers });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(fullUrl, { ...options, headers });
    } else {
      handleAuthFailure();
    }
  }

  return response;
}

// ---------------------------------------------------------------------------
// apiAxios - pre-configured axios instance
// ---------------------------------------------------------------------------

export const apiAxios = axios.create({
  baseURL: API_BASE || undefined,
});

apiAxios.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

apiAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiAxios(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshAccessToken();
        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiAxios(originalRequest);
        } else {
          processQueue(new Error('Refresh failed'));
          handleAuthFailure();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError);
        handleAuthFailure();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// authSSEUrl - for EventSource (which can't set custom headers)
// ---------------------------------------------------------------------------

export function authSSEUrl(url) {
  const token = getAccessToken();
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const separator = fullUrl.includes('?') ? '&' : '?';
  if (token) {
    return `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
  }
  return fullUrl;
}
