import { Injectable } from '@nestjs/common';
import { DiagnosticCheck } from '../types';

@Injectable()
export class FrontendReachableCheck implements DiagnosticCheck {
  readonly id = 'frontend.reachable';
  readonly title = 'Frontend dev server is reachable';
  readonly category = 'connectivity' as const;

  async run() {
    const url = process.env.FRONTEND_URL || 'http://localhost:5000';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      if (res.status < 500) {
        return {
          status: 'ok' as const,
          severity: 'low' as const,
          message: `Frontend reachable at ${url} (HTTP ${res.status}).`,
          evidence: { url, httpStatus: res.status },
        };
      }
      return {
        status: 'warn' as const,
        severity: 'low' as const,
        message: `Frontend at ${url} returned HTTP ${res.status}.`,
        evidence: { url, httpStatus: res.status },
      };
    } catch (err: any) {
      return {
        status: 'warn' as const,
        severity: 'low' as const,
        message: `Frontend not reachable at ${url}: ${err?.message || 'unknown error'}`,
        evidence: { url, error: err?.message },
      };
    } finally {
      clearTimeout(t);
    }
  }
}
