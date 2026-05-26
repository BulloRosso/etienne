import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DiagnosticCheck } from '../types';

function workspaceRoot(): string {
  return process.env.WORKSPACE_ROOT ?? process.env.WORKSPACE_HOST_ROOT ?? 'C:/Data/GitHub/claude-multitenant/workspace';
}

@Injectable()
export class WorkspaceCheck implements DiagnosticCheck {
  readonly id = 'workspace.access';
  readonly title = 'WORKSPACE_ROOT exists and is writable';
  readonly category = 'fs' as const;

  async run() {
    const root = workspaceRoot();
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) {
        return {
          status: 'fail' as const,
          severity: 'critical' as const,
          message: `WORKSPACE_ROOT exists but is not a directory: ${root}`,
          evidence: { workspaceRoot: root },
        };
      }
    } catch {
      return {
        status: 'fail' as const,
        severity: 'critical' as const,
        message: `WORKSPACE_ROOT does not exist: ${root}`,
        evidence: { workspaceRoot: root },
        remediation: {
          kind: 'agent-assisted' as const,
          summary: 'Create the workspace directory or update WORKSPACE_ROOT in backend/.env to point to an existing folder.',
        },
      };
    }

    const marker = join(root, `.first-run-write-test-${Date.now()}`);
    try {
      await fs.writeFile(marker, 'ok', 'utf8');
      await fs.unlink(marker);
    } catch (err: any) {
      return {
        status: 'fail' as const,
        severity: 'critical' as const,
        message: `WORKSPACE_ROOT is not writable: ${err?.message || 'permission denied'}`,
        evidence: { workspaceRoot: root, error: err?.message },
        remediation: {
          kind: 'manual' as const,
          summary: 'Adjust filesystem permissions so the backend process can write inside the workspace directory.',
        },
      };
    }

    return {
      status: 'ok' as const,
      severity: 'critical' as const,
      message: `WORKSPACE_ROOT is accessible and writable at ${root}.`,
      evidence: { workspaceRoot: root },
    };
  }
}

@Injectable()
export class DiskFreeCheck implements DiagnosticCheck {
  readonly id = 'workspace.diskFree';
  readonly title = 'Free disk space near workspace';
  readonly category = 'fs' as const;

  async run() {
    const root = workspaceRoot();
    let freeBytes = -1;
    try {
      const sf: any = (fs as any).statfs;
      if (typeof sf === 'function') {
        const result = await sf(root);
        freeBytes = Number(result.bavail) * Number(result.bsize);
      }
    } catch {
      // statfs unavailable on this platform/node combo
    }

    if (freeBytes < 0) {
      return {
        status: 'warn' as const,
        severity: 'low' as const,
        message: 'Could not determine free disk space (statfs unavailable).',
      };
    }
    const freeMb = Math.floor(freeBytes / (1024 * 1024));
    if (freeBytes < 500 * 1024 * 1024) {
      return {
        status: 'fail' as const,
        severity: 'high' as const,
        message: `Very low disk space: ${freeMb} MB free near workspace.`,
        evidence: { freeMb, workspaceRoot: root },
        remediation: {
          kind: 'manual' as const,
          summary: 'Free at least 2 GB of disk space on the volume containing WORKSPACE_ROOT.',
        },
      };
    }
    if (freeBytes < 2 * 1024 * 1024 * 1024) {
      return {
        status: 'warn' as const,
        severity: 'medium' as const,
        message: `Low disk space: ${freeMb} MB free near workspace.`,
        evidence: { freeMb, workspaceRoot: root },
      };
    }
    return {
      status: 'ok' as const,
      severity: 'medium' as const,
      message: `${freeMb} MB free on the workspace volume.`,
      evidence: { freeMb },
    };
  }
}
