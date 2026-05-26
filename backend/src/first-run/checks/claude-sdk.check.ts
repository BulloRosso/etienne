import { Injectable } from '@nestjs/common';
import { DiagnosticCheck } from '../types';

const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

@Injectable()
export class ClaudeSdkInstalledCheck implements DiagnosticCheck {
  readonly id = 'claude.sdk.installed';
  readonly title = '@anthropic-ai/claude-agent-sdk is resolvable';
  readonly category = 'runtime' as const;

  async run() {
    try {
      const mod = await dynamicImport('@anthropic-ai/claude-agent-sdk');
      const exportsAvailable = mod && (mod.query || mod.default);
      if (!exportsAvailable) {
        return {
          status: 'warn' as const,
          severity: 'high' as const,
          message: '@anthropic-ai/claude-agent-sdk imported but expected exports are missing.',
          evidence: { exports: Object.keys(mod || {}) },
        };
      }
      return {
        status: 'ok' as const,
        severity: 'critical' as const,
        message: '@anthropic-ai/claude-agent-sdk is installed and importable.',
      };
    } catch (err: any) {
      return {
        status: 'fail' as const,
        severity: 'critical' as const,
        message: `Cannot import @anthropic-ai/claude-agent-sdk: ${err?.message || 'unknown error'}`,
        remediation: {
          kind: 'agent-assisted' as const,
          summary: 'Run npm install in the backend/ directory to install missing dependencies.',
        },
      };
    }
  }
}
