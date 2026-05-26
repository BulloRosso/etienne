import { Injectable } from '@nestjs/common';
import * as net from 'net';
import { DiagnosticCheck } from '../types';

interface ExpectedService {
  port: number;
  name: string;
  // a URL we can hit to confirm "yes this is our service, not a foreign process"
  healthUrl?: string;
}

const SERVICES: ExpectedService[] = [
  { port: 3000, name: 'aux-service-3000', healthUrl: 'http://localhost:3000' },
  { port: 4000, name: 'webserver', healthUrl: 'http://localhost:4000' },
  { port: 5000, name: 'frontend', healthUrl: 'http://localhost:5000' },
  { port: 5950, name: 'oauth-server', healthUrl: 'http://localhost:5950/health' },
  { port: 6060, name: 'backend', healthUrl: 'http://localhost:6060/api/claude/health' },
  { port: 7000, name: 'aux-service-7000' },
  { port: 7100, name: 'aux-service-7100' },
];

async function tryListen(port: number): Promise<'free' | 'occupied'> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve('occupied'));
    srv.once('listening', () => {
      srv.close(() => resolve('free'));
    });
    try {
      srv.listen(port, '127.0.0.1');
    } catch {
      resolve('occupied');
    }
  });
}

async function probeOurService(url: string, timeoutMs = 1500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    // Any HTTP response (incl. 401/404) means *something* HTTP is listening.
    // Good enough for distinguishing "our service is up" from a random tcp squatter.
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

@Injectable()
export class PortsCheck implements DiagnosticCheck {
  readonly id = 'ports.availability';
  readonly title = 'Required service ports';
  readonly category = 'runtime' as const;

  async run() {
    const findings: Array<{ port: number; name: string; state: string }> = [];
    let unexpectedConflicts = 0;

    for (const svc of SERVICES) {
      const state = await tryListen(svc.port);
      if (state === 'free') {
        if (svc.port === 6060) {
          // Backend itself runs on 6060; if listen() succeeded the backend should be down — odd context.
          findings.push({ port: svc.port, name: svc.name, state: 'free (unexpected for backend)' });
        } else {
          findings.push({ port: svc.port, name: svc.name, state: 'free' });
        }
        continue;
      }
      // occupied — is it our service?
      if (svc.healthUrl && (await probeOurService(svc.healthUrl))) {
        findings.push({ port: svc.port, name: svc.name, state: 'our-service' });
      } else {
        findings.push({ port: svc.port, name: svc.name, state: 'foreign-process' });
        unexpectedConflicts += 1;
      }
    }

    if (unexpectedConflicts > 0) {
      return {
        status: 'warn' as const,
        severity: 'medium' as const,
        message: `${unexpectedConflicts} port(s) occupied by an unknown process. Service start-up may fail.`,
        evidence: { findings },
        remediation: {
          kind: 'manual' as const,
          summary: 'Identify and stop processes occupying the listed ports, or change the service port configuration.',
        },
      };
    }
    return {
      status: 'ok' as const,
      severity: 'medium' as const,
      message: 'No port conflicts detected.',
      evidence: { findings },
    };
  }
}
