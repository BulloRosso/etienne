import { Injectable } from '@nestjs/common';
import { DiagnosticCheck } from '../types';

@Injectable()
export class AnthropicNetworkCheck implements DiagnosticCheck {
  readonly id = 'anthropic.network';
  readonly title = 'Outbound network to api.anthropic.com';
  readonly category = 'connectivity' as const;

  async run() {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch('https://api.anthropic.com/v1/health', {
        method: 'HEAD',
        signal: controller.signal,
      });
      // Anthropic's edge accepts the request even without auth at the HEAD level;
      // any non-5xx response means the network path works.
      if (res.status < 500) {
        return {
          status: 'ok' as const,
          severity: 'critical' as const,
          message: `api.anthropic.com reachable (HTTP ${res.status}).`,
          evidence: { httpStatus: res.status },
        };
      }
      return {
        status: 'warn' as const,
        severity: 'high' as const,
        message: `api.anthropic.com returned HTTP ${res.status}.`,
        evidence: { httpStatus: res.status },
      };
    } catch (err: any) {
      return {
        status: 'fail' as const,
        severity: 'critical' as const,
        message: `Cannot reach api.anthropic.com: ${err?.message || 'unknown error'}`,
        evidence: { error: err?.message },
        remediation: {
          kind: 'manual' as const,
          summary: 'Check internet connectivity, corporate proxy settings, or firewall rules for outbound HTTPS to api.anthropic.com.',
        },
      };
    } finally {
      clearTimeout(t);
    }
  }
}
