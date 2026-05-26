export type CheckStatus = 'ok' | 'warn' | 'fail';
export type CheckSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CheckCategory = 'connectivity' | 'env' | 'fs' | 'runtime' | 'optional';

export interface RemediationHint {
  kind: 'manual' | 'auto-low-risk' | 'agent-assisted';
  summary: string;
}

export interface CheckResult {
  id: string;
  title: string;
  category: CheckCategory;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  durationMs: number;
  evidence?: Record<string, unknown>;
  remediation?: RemediationHint;
}

export interface DiagnosticCheck {
  id: string;
  title: string;
  category: CheckCategory;
  run(): Promise<Omit<CheckResult, 'id' | 'title' | 'category' | 'durationMs'>>;
}

export interface DiagnosticsReport {
  ranAt: string;
  overall: CheckStatus;
  checks: CheckResult[];
  platform: string;
  nodeVersion: string;
  envKeysPresent: string[];
}
