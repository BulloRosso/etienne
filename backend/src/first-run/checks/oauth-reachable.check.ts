import { Injectable } from '@nestjs/common';
import { DiagnosticCheck } from '../types';

@Injectable()
export class OauthReachableCheck implements DiagnosticCheck {
  readonly id = 'oauth.reachable';
  readonly title = 'oauth-server is reachable';
  readonly category = 'connectivity' as const;

  async run() {
    const url = process.env.OAUTH_SERVER_URL || 'http://localhost:5950';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(`${url}/auth/health`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      if (res.ok) {
        return {
          status: 'ok' as const,
          severity: 'high' as const,
          message: `oauth-server reachable at ${url}.`,
          evidence: { url },
        };
      }
      return {
        status: 'warn' as const,
        severity: 'high' as const,
        message: `oauth-server returned HTTP ${res.status}.`,
        evidence: { url, httpStatus: res.status },
      };
    } catch (err: any) {
      return {
        status: 'fail' as const,
        severity: 'high' as const,
        message: `oauth-server not reachable at ${url}: ${err?.message || 'unknown error'}`,
        evidence: { url, error: err?.message },
        remediation: {
          kind: 'manual' as const,
          summary: 'Start the oauth-server service (npm run dev in oauth-server/) and confirm it binds to port 5950.',
        },
      };
    } finally {
      clearTimeout(t);
    }
  }
}
