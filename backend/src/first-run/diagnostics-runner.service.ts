import { Injectable, Logger } from '@nestjs/common';
import {
  CheckResult,
  CheckStatus,
  DiagnosticCheck,
  DiagnosticsReport,
} from './types';
import { CHECK_REGISTRY } from './checks';

const PER_CHECK_TIMEOUT_MS = 5000;
const SECRET_KEY_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|AUTH)/i;

@Injectable()
export class DiagnosticsRunnerService {
  private readonly logger = new Logger(DiagnosticsRunnerService.name);

  constructor(private readonly checks: DiagnosticCheck[]) {
    if (!checks || checks.length === 0) {
      this.logger.warn('DiagnosticsRunnerService instantiated with no checks');
    }
  }

  async runAll(): Promise<DiagnosticsReport> {
    const results = await Promise.all(this.checks.map((c) => this.runOne(c)));
    const overall = this.aggregate(results);
    return {
      ranAt: new Date().toISOString(),
      overall,
      checks: results,
      platform: process.platform,
      nodeVersion: process.version,
      envKeysPresent: this.collectEnvKeyNames(),
    };
  }

  async *runAllStreaming(): AsyncGenerator<CheckResult> {
    const pending = this.checks.map((c) => this.runOne(c));
    for (const p of pending) {
      yield await p;
    }
  }

  private async runOne(check: DiagnosticCheck): Promise<CheckResult> {
    const started = Date.now();
    try {
      const partial = await this.withTimeout(check.run(), PER_CHECK_TIMEOUT_MS, check.id);
      return {
        id: check.id,
        title: check.title,
        category: check.category,
        ...partial,
        evidence: this.redactEvidence(partial.evidence),
        durationMs: Date.now() - started,
      };
    } catch (err: any) {
      const isTimeout = err?.message === '__timeout__';
      this.logger.warn(`Check ${check.id} ${isTimeout ? 'timed out' : 'errored'}: ${err?.message}`);
      return {
        id: check.id,
        title: check.title,
        category: check.category,
        status: isTimeout ? 'warn' : 'fail',
        severity: isTimeout ? 'low' : 'medium',
        message: isTimeout
          ? `Check timed out after ${PER_CHECK_TIMEOUT_MS}ms`
          : `Check failed: ${err?.message || 'unknown error'}`,
        durationMs: Date.now() - started,
      };
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number, id: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('__timeout__')), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  private aggregate(results: CheckResult[]): CheckStatus {
    const hasCriticalFail = results.some(
      (r) => r.status === 'fail' && (r.severity === 'critical' || r.severity === 'high'),
    );
    if (hasCriticalFail) return 'fail';
    const hasAnyFailOrWarn = results.some((r) => r.status === 'fail' || r.status === 'warn');
    return hasAnyFailOrWarn ? 'warn' : 'ok';
  }

  private collectEnvKeyNames(): string[] {
    return Object.keys(process.env)
      .filter((k) => SECRET_KEY_PATTERN.test(k))
      .sort();
  }

  private redactEvidence(evidence?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!evidence) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(evidence)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        out[k] = typeof v === 'string' && v.length > 0 ? '[redacted]' : v;
      } else if (typeof v === 'string') {
        out[k] = this.redactString(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private redactString(s: string): string {
    if (s.length > 24 && /^[A-Za-z0-9_\-]+$/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s)) {
      return '[redacted]';
    }
    return s;
  }
}

export const DIAGNOSTIC_CHECKS_TOKEN = 'FIRST_RUN_DIAGNOSTIC_CHECKS';

export { CHECK_REGISTRY };
