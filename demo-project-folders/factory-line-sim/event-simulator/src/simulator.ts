/**
 * Factory-line event simulator.
 *
 * Authenticates with the OAuth server once on startup, then either:
 *   - emits one routine event per INTERVAL_MS, or
 *   - emits a coordinated incident burst (--burst <name>) and then
 *     drops back to routine mode.
 */

import 'dotenv/config';
import { runRoutine, runBurst } from './scenarios.js';

interface Env {
  apiBase: string;
  oauthBase: string;
  username: string;
  password: string;
  project: string;
  intervalMs: number;
}

function readEnv(): Env {
  return {
    apiBase:    process.env.API_BASE     || 'http://localhost:6060',
    oauthBase:  process.env.OAUTH_BASE   || 'http://localhost:5950',
    username:   process.env.OAUTH_USERNAME || 'admin',
    password:   process.env.OAUTH_PASSWORD || 'admin123',
    project:    process.env.PROJECT_NAME || 'factory-line-sim',
    intervalMs: Number(process.env.INTERVAL_MS) || 10_000,
  };
}

async function login(env: Env): Promise<string> {
  const r = await fetch(`${env.oauthBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: env.username, password: env.password }),
  });
  if (!r.ok) throw new Error(`login failed: HTTP ${r.status}`);
  const data = await r.json() as { accessToken?: string };
  if (!data.accessToken) throw new Error('login response missing accessToken');
  return data.accessToken;
}

function parseArgs(): { burst?: string } {
  const args = process.argv.slice(2);
  const burstIdx = args.indexOf('--burst');
  if (burstIdx !== -1 && args[burstIdx + 1]) return { burst: args[burstIdx + 1] };
  return {};
}

async function main(): Promise<void> {
  const env = readEnv();
  console.log(`[simulator] target: ${env.apiBase} project=${env.project}`);
  const token = await login(env);
  console.log('[simulator] authenticated');

  const { burst } = parseArgs();
  if (burst) {
    console.log(`[simulator] running burst: ${burst}`);
    await runBurst(burst, { token, ...env });
    console.log('[simulator] burst complete; switching to routine mode');
  }
  console.log('[simulator] routine emission cadence: 0s, +10s, +60s, +5min, +15min, +30min, +60min, then steady at 60min (Ctrl+C to stop)');
  await runRoutine({ token, ...env });
}

main().catch((err) => {
  console.error('[simulator] FAILED:', err);
  process.exit(1);
});
