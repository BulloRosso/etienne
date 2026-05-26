import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { DiagnosticCheck } from '../types';

@Injectable()
export class UvCheck implements DiagnosticCheck {
  readonly id = 'uv.installed';
  readonly title = 'uv (Python package manager) is installed';
  readonly category = 'runtime' as const;

  async run() {
    return new Promise<any>((resolve) => {
      let timedOut = false;
      const child = spawn('uv', ['--version'], { shell: false });
      let out = '';
      const t = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {
          /* noop */
        }
      }, 2500);
      child.stdout?.on('data', (b) => (out += b.toString()));
      child.stderr?.on('data', (b) => (out += b.toString()));
      child.on('error', () => {
        clearTimeout(t);
        resolve({
          status: 'fail',
          severity: 'high',
          message: 'uv is not installed or not on PATH. Required for installing Python service dependencies.',
          remediation: {
            kind: 'agent-assisted',
            summary:
              process.platform === 'win32'
                ? 'Install uv via PowerShell: irm https://astral.sh/uv/install.ps1 | iex'
                : 'Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh',
          },
        });
      });
      child.on('exit', (code) => {
        clearTimeout(t);
        if (timedOut) {
          resolve({
            status: 'warn',
            severity: 'medium',
            message: '`uv --version` timed out.',
          });
          return;
        }
        if (code === 0) {
          resolve({
            status: 'ok',
            severity: 'high',
            message: `uv present: ${out.trim().split('\n')[0]}`,
            evidence: { version: out.trim().split('\n')[0] },
          });
        } else {
          resolve({
            status: 'fail',
            severity: 'high',
            message: `\`uv --version\` exited with code ${code}.`,
            evidence: { exitCode: code, output: out.trim().slice(0, 200) },
          });
        }
      });
    });
  }
}
