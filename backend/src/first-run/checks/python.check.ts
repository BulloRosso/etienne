import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DiagnosticCheck } from '../types';

const MIN_MAJOR = 3;
const MIN_MINOR = 13;

function runVersion(
  cmd: string,
  args: string[],
  timeoutMs = 3000,
  cwd?: string,
): Promise<{ ok: boolean; out: string; code: number | null }> {
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(cmd, args, { shell: false, cwd });
    let out = '';
    const t = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* noop */
      }
    }, timeoutMs);
    child.stdout?.on('data', (b) => (out += b.toString()));
    child.stderr?.on('data', (b) => (out += b.toString()));
    child.on('error', () => {
      clearTimeout(t);
      resolve({ ok: false, out, code: null });
    });
    child.on('exit', (code) => {
      clearTimeout(t);
      if (timedOut) resolve({ ok: false, out, code: null });
      else resolve({ ok: code === 0, out, code });
    });
  });
}

function parsePythonVersion(s: string): { major: number; minor: number } | null {
  const m = s.match(/Python\s+(\d+)\.(\d+)/i);
  if (!m) return null;
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
}

function meetsMinimum(v: { major: number; minor: number }): boolean {
  return v.major > MIN_MAJOR || (v.major === MIN_MAJOR && v.minor >= MIN_MINOR);
}

function repoRoot(): string {
  // backend/src/first-run/checks → repo root
  return path.resolve(__dirname, '../../../..');
}

async function readPythonVersionFile(): Promise<string | null> {
  try {
    const p = path.join(repoRoot(), '.python-version');
    const content = await fs.readFile(p, 'utf8');
    const first = content.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

@Injectable()
export class PythonCheck implements DiagnosticCheck {
  readonly id = 'python.installed';
  readonly title = 'Python 3.13+ is installed';
  readonly category = 'runtime' as const;

  async run() {
    // Probe order matches how the services actually launch Python:
    //   1. `uv run python --version` from repo root — honors .python-version, uv-managed installs
    //   2. `python` and `python3` on PATH — fallback for environments without uv
    const pinned = await readPythonVersionFile();
    const attempts: Array<{ label: string; cmd: string; args: string[]; cwd?: string }> = [
      { label: 'uv run python --version (repo root)', cmd: 'uv', args: ['run', 'python', '--version'], cwd: repoRoot() },
      { label: 'python --version', cmd: 'python', args: ['--version'] },
      { label: 'python3 --version', cmd: 'python3', args: ['--version'] },
      { label: 'py --version', cmd: 'py', args: ['--version'] },
    ];

    const findings: Array<{ probe: string; version?: string; raw?: string; error?: string }> = [];

    for (const a of attempts) {
      const res = await runVersion(a.cmd, a.args, 3000, a.cwd);
      if (!res.ok) {
        findings.push({ probe: a.label, error: res.out.trim().slice(0, 120) || 'not available' });
        continue;
      }
      const version = parsePythonVersion(res.out);
      if (!version) {
        findings.push({ probe: a.label, raw: res.out.trim().slice(0, 120) });
        continue;
      }
      findings.push({ probe: a.label, version: `${version.major}.${version.minor}` });
      if (meetsMinimum(version)) {
        return {
          status: 'ok' as const,
          severity: 'high' as const,
          message: `Python ${version.major}.${version.minor} resolved via \`${a.label}\`${pinned ? ` (.python-version pin: ${pinned})` : ''}.`,
          evidence: { version: `${version.major}.${version.minor}`, probe: a.label, pinned, findings },
        };
      }
      // Older version found via this probe — keep searching in case a later probe finds a newer one.
    }

    // No probe found a sufficient version. Decide between "older Python found" and "no Python at all".
    const anyVersion = findings.find((f) => f.version);
    if (anyVersion) {
      const note = pinned
        ? ` .python-version pins ${pinned}, but it isn't being resolved — try \`uv sync\` in the repo root, or open a new terminal so PATH refreshes.`
        : '';
      return {
        status: 'fail' as const,
        severity: 'high' as const,
        message: `Python ${anyVersion.version} found via \`${anyVersion.probe}\` is older than the required ${MIN_MAJOR}.${MIN_MINOR}.${note}`,
        evidence: { found: anyVersion.version, required: `${MIN_MAJOR}.${MIN_MINOR}`, pinned, findings },
        remediation: {
          kind: 'agent-assisted' as const,
          summary: `Install and pin Python ${MIN_MAJOR}.${MIN_MINOR}+ (uv python install 3.14 && uv python pin 3.14).`,
        },
      };
    }
    return {
      status: 'fail' as const,
      severity: 'high' as const,
      message: 'Python is not available via uv or on PATH. Required for webserver and vector-store services.',
      evidence: { pinned, findings },
      remediation: {
        kind: 'agent-assisted' as const,
        summary:
          process.platform === 'win32'
            ? 'Install Python via uv (uv python install 3.14 && uv python pin 3.14) or from python.org.'
            : process.platform === 'darwin'
              ? 'Install Python via uv (uv python install 3.14) or via Homebrew (brew install python@3.13).'
              : 'Install Python via uv (uv python install 3.14) or your package manager.',
      },
    };
  }
}
