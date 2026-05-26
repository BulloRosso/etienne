import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { DiagnosticCheck } from '../types';

@Injectable()
export class SofficeCheck implements DiagnosticCheck {
  readonly id = 'soffice.present';
  readonly title = 'LibreOffice (soffice) installed';
  readonly category = 'optional' as const;

  async run() {
    return new Promise<any>((resolve) => {
      let timedOut = false;
      const child = spawn('soffice', ['--version'], { shell: false });
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
      child.on('error', () => {
        clearTimeout(t);
        resolve({
          status: 'warn',
          severity: 'low',
          message: 'LibreOffice (soffice) not found. Office document parsing (.docx/.pptx/.xlsx) will be unavailable.',
          remediation: {
            kind: 'agent-assisted',
            summary:
              process.platform === 'win32'
                ? 'Install LibreOffice via Chocolatey: choco install libreoffice-still'
                : process.platform === 'darwin'
                  ? 'Install LibreOffice via Homebrew: brew install --cask libreoffice'
                  : 'Install LibreOffice via your package manager (e.g. sudo apt-get install libreoffice).',
          },
        });
      });
      child.on('exit', (code) => {
        clearTimeout(t);
        if (timedOut) {
          resolve({
            status: 'warn',
            severity: 'low',
            message: 'soffice --version timed out.',
          });
          return;
        }
        if (code === 0) {
          resolve({
            status: 'ok',
            severity: 'low',
            message: `LibreOffice present: ${out.trim().split('\n')[0]}`,
            evidence: { version: out.trim().split('\n')[0] },
          });
        } else {
          resolve({
            status: 'warn',
            severity: 'low',
            message: `soffice exited with code ${code}.`,
          });
        }
      });
    });
  }
}
