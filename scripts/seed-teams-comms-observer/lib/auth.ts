/**
 * /auth/login wrapper for the seed script.
 *
 * The OAuth server runs on :5950 and accepts `{username, password}` → `{accessToken, ...}`.
 * Dev credentials live in oauth-server/config/users.json; we default to admin/admin123
 * matching the project's documented defaults and let env vars override.
 */

const OAUTH_BASE = process.env.OAUTH_BASE || 'http://localhost:5950';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; role: string; displayName: string };
}

export async function login(opts?: {
  username?: string;
  password?: string;
}): Promise<AuthResult> {
  // If a pre-issued access token is available (e.g. spawned from the backend's
  // first-run wizard), use it instead of POST /auth/login. Avoids the seed
  // script needing the user's password.
  const preIssued = process.env.SEED_ACCESS_TOKEN;
  if (preIssued) {
    const meResp = await fetch(`${OAUTH_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${preIssued}` },
    });
    if (!meResp.ok) {
      const body = await meResp.text().catch(() => '');
      throw new Error(
        `SEED_ACCESS_TOKEN is set but /auth/me failed: HTTP ${meResp.status} ${body.slice(0, 200)}`,
      );
    }
    const user = (await meResp.json()) as AuthResult['user'];
    return { accessToken: preIssued, refreshToken: '', user };
  }

  const username = opts?.username ?? process.env.SEED_USERNAME ?? 'admin';
  const password = opts?.password ?? process.env.SEED_PASSWORD ?? 'admin123';
  const resp = await fetch(`${OAUTH_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(
      `login failed for ${username}: HTTP ${resp.status} ${body.slice(0, 200)}`,
    );
  }
  const result = (await resp.json()) as AuthResult;
  if (!result.accessToken) {
    throw new Error(`login succeeded but no accessToken in response`);
  }
  return result;
}
