import { Injectable } from '@nestjs/common';
import { DiagnosticCheck } from '../types';

const MIN_MAJOR = 20;

@Injectable()
export class NodeVersionCheck implements DiagnosticCheck {
  readonly id = 'node.version';
  readonly title = 'Node.js version meets minimum requirement';
  readonly category = 'runtime' as const;

  async run() {
    const version = process.version;
    const major = parseInt(version.replace(/^v/, '').split('.')[0], 10);
    if (Number.isNaN(major)) {
      return {
        status: 'warn' as const,
        severity: 'medium' as const,
        message: `Could not parse Node.js version: ${version}`,
        evidence: { version },
      };
    }
    if (major < MIN_MAJOR) {
      return {
        status: 'fail' as const,
        severity: 'high' as const,
        message: `Node.js ${version} is older than the required v${MIN_MAJOR}.`,
        evidence: { version, requiredMajor: MIN_MAJOR },
        remediation: {
          kind: 'manual' as const,
          summary: `Upgrade Node.js to v${MIN_MAJOR} or newer.`,
        },
      };
    }
    return {
      status: 'ok' as const,
      severity: 'high' as const,
      message: `Node.js ${version} OK.`,
      evidence: { version },
    };
  }
}
