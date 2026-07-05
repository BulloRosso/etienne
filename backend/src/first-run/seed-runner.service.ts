import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { MessageEvent } from '../claude/types';

export interface DemoSeed {
  id: string;
  scriptPath: string;       // relative to repo root, posix-style
  displayName: string;
  description: string;
  estimatedDurationLabel: string;
  timeoutMs: number;
}

// Allowlist — never trust client ids; only seeds listed here can be spawned.
export const DEMO_SEEDS: Readonly<DemoSeed[]> = Object.freeze([
  {
    id: 'factory-line-sim',
    scriptPath: 'scripts/seed-factory-line-sim/seed-factory-line-sim.ts',
    displayName: 'Factory line simulation',
    description:
      'Manufacturing line with CNC dashboards, quality reports, event simulator, and insights.',
    estimatedDurationLabel: '~3 min',
    timeoutMs: 8 * 60 * 1000,
  },
  {
    id: 'desalination-devices',
    scriptPath: 'scripts/seed-desalination/seed-desalination.ts',
    displayName: 'Desalination devices',
    description:
      'Water treatment pilot with design-support, hypotheses, scrapbook projection, and curator cron.',
    estimatedDurationLabel: '~4 min',
    timeoutMs: 8 * 60 * 1000,
  },
  {
    id: 'long-horizon-commitments',
    scriptPath: 'scripts/seed-long-horizon-commitments/seed-long-horizon-commitments.ts',
    displayName: 'Long-horizon commitments',
    description:
      'Fleet vessel commitments with quarterly packets, assumptions/gates/drift tracking, and curator heartbeat.',
    estimatedDurationLabel: '~4 min',
    timeoutMs: 8 * 60 * 1000,
  },
  {
    id: 'requirements-hv',
    scriptPath: 'scripts/seed-requirements-hv/seed-requirements-hv.ts',
    displayName: 'HV requirements',
    description:
      'German HVDC grid-connection requirements with coverage dashboard, EARS requirements, and late-clarifications.',
    estimatedDurationLabel: '~3 min',
    timeoutMs: 8 * 60 * 1000,
  },
  {
    id: 'knowledge-transfer',
    scriptPath: 'scripts/seed-knowledge-transfer/seed-knowledge-transfer.ts',
    displayName: 'Knowledge transfer',
    description:
      'Onboarding agent for a junior LED-headlight engineer at a fictional German Tier-1 supplier — role-aware (expert curates / guest learns), progress tracking, quizzes, day-in-the-life scenarios.',
    estimatedDurationLabel: '~4 min',
    timeoutMs: 8 * 60 * 1000,
  },
  {
    id: 'teams-comms-observer',
    scriptPath: 'scripts/seed-teams-comms-observer/seed-teams-comms-observer.ts',
    displayName: 'Teams communication observer',
    description:
      'Silent observer for MS Teams channels diagnosing the "Hyperactive Hive Mind" — pattern knowledge graph, per-person style profiles, hive-analytics metrics, three hyperscreen dashboards, and an evidence-based team-agreement draft. Ships sample transcripts; no Teams tenant required.',
    estimatedDurationLabel: '~3 min',
    timeoutMs: 8 * 60 * 1000,
  },
]);

function findSeed(id: string): DemoSeed | undefined {
  return DEMO_SEEDS.find((s) => s.id === id);
}

interface ActiveRun {
  child: ChildProcess;
  seedId: string;
}

@Injectable()
export class SeedRunnerService {
  private readonly logger = new Logger(SeedRunnerService.name);
  private readonly active = new Map<string, ActiveRun>(); // userId → run

  /**
   * Run a list of seeds sequentially as the given user. Emits SSE-shaped events.
   * `userId` is used to prevent concurrent runs for the same user across tabs.
   */
  runSeeds(seedIds: string[], userAccessToken: string, userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      let cancelled = false;
      const repoRoot = path.resolve(__dirname, '../../..'); // backend/src/first-run → repo root

      // Resolve and validate every id first — better to fail loud than half-run.
      const resolved: DemoSeed[] = [];
      for (const id of seedIds) {
        const seed = findSeed(id);
        if (!seed) {
          observer.next({ data: { kind: 'error', message: `Unknown seed id: ${id}` } } as any);
          observer.complete();
          return;
        }
        resolved.push(seed);
      }
      if (resolved.length === 0) {
        observer.next({ data: { kind: 'error', message: 'No seeds selected.' } } as any);
        observer.complete();
        return;
      }

      // Concurrency guard
      if (this.active.has(userId)) {
        observer.next({
          data: { kind: 'error', message: 'A seed run is already in progress for your user.' },
        } as any);
        observer.complete();
        return;
      }

      // Heartbeat every 15s to keep proxies happy.
      const heartbeat = setInterval(() => {
        observer.next({ data: { kind: 'heartbeat' } } as any);
      }, 15_000);

      const cleanup = () => {
        clearInterval(heartbeat);
        const existing = this.active.get(userId);
        if (existing) {
          try {
            existing.child.kill('SIGTERM');
          } catch {
            /* noop */
          }
          this.active.delete(userId);
        }
      };

      const runOne = (seed: DemoSeed): Promise<void> => {
        return new Promise((resolveOne) => {
          if (cancelled) return resolveOne();

          const scriptAbs = path.resolve(repoRoot, seed.scriptPath);
          observer.next({
            data: { kind: 'seed_started', seedId: seed.id, scriptPath: seed.scriptPath },
          } as any);
          this.logger.log(`Spawning seed: ${seed.id} (${scriptAbs})`);

          const startedAt = Date.now();
          const env = {
            ...process.env,
            SEED_ACCESS_TOKEN: userAccessToken,
            OAUTH_BASE: process.env.OAUTH_SERVER_URL || 'http://localhost:5950',
            BACKEND_BASE: process.env.BACKEND_BASE || 'http://localhost:6060',
            // WORKSPACE_ROOT inherited as-is from process.env
          };

          let child: ChildProcess;
          try {
            child = spawn('npx', ['tsx', scriptAbs], {
              cwd: repoRoot,
              env,
              shell: process.platform === 'win32',
            });
          } catch (spawnErr: any) {
            observer.next({
              data: {
                kind: 'seed_failed',
                seedId: seed.id,
                exitCode: -1,
                error: `spawn failed: ${spawnErr?.message || spawnErr}`,
              },
            } as any);
            return resolveOne();
          }

          this.active.set(userId, { child, seedId: seed.id });

          // Per-seed timeout
          const timeoutHandle = setTimeout(() => {
            this.logger.warn(`Seed ${seed.id} timed out after ${seed.timeoutMs}ms — killing`);
            try {
              child.kill('SIGTERM');
            } catch {
              /* noop */
            }
            setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {
                /* noop */
              }
            }, 5000);
          }, seed.timeoutMs);

          // Buffer stdout/stderr lines into ~250ms chunks per stream.
          let stdoutBuf = '';
          let stderrBuf = '';
          let flushTimer: NodeJS.Timeout | null = null;
          const scheduleFlush = () => {
            if (flushTimer) return;
            flushTimer = setTimeout(() => {
              flushTimer = null;
              if (stdoutBuf) {
                observer.next({ data: { kind: 'stdout', seedId: seed.id, chunk: stdoutBuf } } as any);
                stdoutBuf = '';
              }
              if (stderrBuf) {
                observer.next({ data: { kind: 'stderr', seedId: seed.id, chunk: stderrBuf } } as any);
                stderrBuf = '';
              }
            }, 250);
          };
          const flushNow = () => {
            if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            if (stdoutBuf) {
              observer.next({ data: { kind: 'stdout', seedId: seed.id, chunk: stdoutBuf } } as any);
              stdoutBuf = '';
            }
            if (stderrBuf) {
              observer.next({ data: { kind: 'stderr', seedId: seed.id, chunk: stderrBuf } } as any);
              stderrBuf = '';
            }
          };

          child.stdout?.on('data', (b: Buffer) => {
            stdoutBuf += b.toString();
            scheduleFlush();
          });
          child.stderr?.on('data', (b: Buffer) => {
            stderrBuf += b.toString();
            scheduleFlush();
          });

          child.on('error', (err) => {
            clearTimeout(timeoutHandle);
            flushNow();
            observer.next({
              data: {
                kind: 'seed_failed',
                seedId: seed.id,
                exitCode: -1,
                error: err?.message || String(err),
              },
            } as any);
            this.active.delete(userId);
            resolveOne();
          });

          child.on('exit', (code) => {
            clearTimeout(timeoutHandle);
            flushNow();
            this.active.delete(userId);
            const durationMs = Date.now() - startedAt;
            if (code === 0) {
              observer.next({
                data: { kind: 'seed_completed', seedId: seed.id, exitCode: code, durationMs },
              } as any);
            } else {
              observer.next({
                data: {
                  kind: 'seed_failed',
                  seedId: seed.id,
                  exitCode: code,
                  durationMs,
                  error: `seed exited with code ${code}`,
                },
              } as any);
            }
            resolveOne();
          });
        });
      };

      (async () => {
        for (const seed of resolved) {
          if (cancelled) break;
          await runOne(seed);
        }
        if (!cancelled) {
          observer.next({ data: { kind: 'completed' } } as any);
          observer.complete();
        }
      })().catch((err: any) => {
        this.logger.error(`Seed run error: ${err?.message}`, err?.stack);
        observer.next({ data: { kind: 'error', message: err?.message || String(err) } } as any);
        observer.complete();
      });

      return () => {
        // Observable teardown — fired on unsubscribe (client disconnect).
        cancelled = true;
        cleanup();
      };
    });
  }
}
