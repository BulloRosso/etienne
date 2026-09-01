import { Injectable } from '@nestjs/common';
import { ClaudeService } from '../../claude/claude.service';
import { DiagnosticCheck } from '../types';

@Injectable()
export class AnthropicKeyCheck implements DiagnosticCheck {
  readonly id = 'anthropic.key.valid';
  readonly title = 'Anthropic API key is set and valid';
  readonly category = 'env' as const;

  constructor(private readonly claudeService: ClaudeService) {}

  async run() {
    const present = !!process.env.ANTHROPIC_API_KEY;
    if (!present) {
      // Keyless is fine when the coding agent runs against a local LM Studio
      // server — don't show a permanent critical failure on local-only setups.
      if (process.env.LMSTUDIO_ENABLED === 'true') {
        return {
          status: 'warn' as const,
          severity: 'low' as const,
          message: 'No Anthropic API key is set, but LM Studio is active — cloud models are unavailable.',
          evidence: { envVar: 'ANTHROPIC_API_KEY', present: false, lmStudioEnabled: true },
        };
      }
      return {
        status: 'fail' as const,
        severity: 'critical' as const,
        message: 'ANTHROPIC_API_KEY is not set in the backend environment.',
        evidence: { envVar: 'ANTHROPIC_API_KEY', present: false },
        remediation: {
          kind: 'agent-assisted' as const,
          summary: 'Add ANTHROPIC_API_KEY=... to backend/.env (the support agent can do this for you).',
        },
      };
    }

    const result = await this.claudeService.checkModelHealth();
    if (result.healthy) {
      return {
        status: 'ok' as const,
        severity: 'critical' as const,
        message: `Anthropic API key is valid (model: ${(result as any).model ?? 'unknown'}).`,
        evidence: {
          provider: (result as any).provider,
          model: (result as any).model,
        },
      };
    }
    return {
      status: 'fail' as const,
      severity: 'critical' as const,
      message: `Anthropic API key check failed: ${(result as any).reason ?? 'unknown'}`,
      evidence: { reason: (result as any).reason },
      remediation: {
        kind: 'agent-assisted' as const,
        summary: 'Verify the API key value in backend/.env and that the account has access to the configured model.',
      },
    };
  }
}
