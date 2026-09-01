import { Injectable } from '@nestjs/common';
import { LmStudioService } from '../../lmstudio/lmstudio.service';
import { DiagnosticCheck } from '../types';

/**
 * Detects a local LM Studio server so the first-run wizard can offer it as a
 * local alternative to the Anthropic API. Absence is 'ok' — LM Studio is
 * optional and a warn here would pollute the overall wizard status for every
 * user without it. The only warn is config drift: enabled but unreachable.
 */
@Injectable()
export class LmStudioCheck implements DiagnosticCheck {
  readonly id = 'lmstudio.detect';
  readonly title = 'LM Studio local server';
  readonly category = 'optional' as const;

  constructor(private readonly lmStudioService: LmStudioService) {}

  async run() {
    if ((process.env.CODING_AGENT || 'anthropic') !== 'anthropic') {
      return {
        status: 'ok' as const,
        severity: 'low' as const,
        message: 'Not applicable (coding agent is not anthropic).',
        evidence: { applicable: false },
      };
    }

    const enabled = process.env.LMSTUDIO_ENABLED === 'true';
    const probe = await this.lmStudioService.probe();

    if (probe.reachable && probe.authRequired) {
      return {
        status: 'ok' as const,
        severity: 'low' as const,
        message: `LM Studio detected at ${probe.baseUrl} (authentication required).`,
        evidence: { applicable: true, baseUrl: probe.baseUrl, models: [], authRequired: true, alreadyEnabled: enabled },
      };
    }

    if (probe.reachable) {
      return {
        status: 'ok' as const,
        severity: 'low' as const,
        message: `LM Studio detected at ${probe.baseUrl} (${probe.models?.length ?? 0} models).`,
        evidence: { applicable: true, baseUrl: probe.baseUrl, models: probe.models ?? [], alreadyEnabled: enabled },
      };
    }

    if (enabled) {
      return {
        status: 'warn' as const,
        severity: 'medium' as const,
        message: `LM Studio is enabled in configuration but ${process.env.LMSTUDIO_BASE_URL || 'the server'} is unreachable.`,
        evidence: { applicable: true, configuredBaseUrl: process.env.LMSTUDIO_BASE_URL },
        remediation: {
          kind: 'manual' as const,
          summary: 'Start LM Studio and enable its local server (lms server start), or disable LM Studio in Settings.',
        },
      };
    }

    return {
      status: 'ok' as const,
      severity: 'low' as const,
      message: 'No LM Studio server detected (optional).',
      evidence: { applicable: true },
    };
  }
}
