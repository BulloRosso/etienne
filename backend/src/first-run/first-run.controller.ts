import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, from } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { Roles } from '../auth/roles.decorator';
import { DiagnosticsRunnerService } from './diagnostics-runner.service';
import { SupportAgentService } from './support-agent/support-agent.service';
import { DiagnosticsReport } from './types';
import { MessageEvent } from '../claude/types';
import { JwtUser } from '../auth/jwt-auth.guard';

interface SessionCache {
  report: DiagnosticsReport;
  storedAt: number;
}

const REPORT_TTL_MS = 30 * 60 * 1000;

@Controller('api/first-run')
export class FirstRunController {
  private readonly logger = new Logger(FirstRunController.name);
  private readonly reportCache = new Map<string, SessionCache>();

  constructor(
    private readonly runner: DiagnosticsRunnerService,
    private readonly supportAgent: SupportAgentService,
  ) {}

  private get oauthServerUrl(): string {
    return process.env.OAUTH_SERVER_URL || 'http://localhost:5950';
  }

  private extractAuthHeader(req: Request): string | undefined {
    return req.headers.authorization;
  }

  @Get('status')
  async status(@Req() req: Request) {
    const auth = this.extractAuthHeader(req);
    if (!auth) throw new HttpException('Missing token', HttpStatus.UNAUTHORIZED);
    const res = await fetch(`${this.oauthServerUrl}/auth/first-run/status`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new HttpException(text || 'oauth-server error', res.status);
    }
    return res.json();
  }

  @Post('diagnostics')
  async diagnostics(@Req() req: Request): Promise<DiagnosticsReport> {
    const user = (req as any).user as JwtUser | undefined;
    if (!user) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    const report = await this.runner.runAll();
    this.reportCache.set(user.sub, { report, storedAt: Date.now() });
    return report;
  }

  @Sse('diagnostics/stream')
  diagnosticsStream(@Req() req: Request): Observable<MessageEvent> {
    const user = (req as any).user as JwtUser | undefined;
    this.logger.log(`Diagnostics stream opened for user ${user?.sub ?? 'unknown'}`);
    return new Observable((observer) => {
      (async () => {
        const accumulated: any[] = [];
        // Important: emit events WITHOUT `type` so they arrive as default `message`
        // events in the browser's EventSource. The discriminator lives inside `data.kind`.
        for await (const result of this.runner.runAllStreaming()) {
          accumulated.push(result);
          observer.next({ data: { kind: 'check_result', result } } as any);
        }
        const summary = this.summarize(accumulated);
        const report: DiagnosticsReport = {
          ranAt: new Date().toISOString(),
          overall: summary,
          checks: accumulated,
          platform: process.platform,
          nodeVersion: process.version,
          envKeysPresent: Object.keys(process.env)
            .filter((k) => /(KEY|TOKEN|SECRET|PASSWORD|AUTH)/i.test(k))
            .sort(),
        };
        if (user?.sub) this.reportCache.set(user.sub, { report, storedAt: Date.now() });
        observer.next({ data: { kind: 'completed', report } } as any);
        observer.complete();
      })().catch((err) => {
        this.logger.error(`Streaming diagnostics failed: ${err.message}`, err.stack);
        observer.next({ data: { kind: 'error', message: err.message } } as any);
        observer.complete();
      });
      return () => {
        /* unsubscribe noop */
      };
    });
  }

  @Sse('support-session/stream')
  supportSessionStream(
    @Req() req: Request,
    @Query('applyItemId') applyItemId?: string,
    @Query('userPrompt') userPrompt?: string,
  ): Observable<MessageEvent> {
    const user = (req as any).user as JwtUser | undefined;
    if (!user) {
      return new Observable((observer) => {
        observer.next({ data: { kind: 'error', message: 'Unauthorized' } } as any);
        observer.complete();
      });
    }
    const cached = this.reportCache.get(user.sub);
    if (!cached || Date.now() - cached.storedAt > REPORT_TTL_MS) {
      return new Observable((observer) => {
        observer.next({
          data: { kind: 'error', message: 'No recent diagnostics report. Run diagnostics first.' },
        } as any);
        observer.complete();
      });
    }
    return this.supportAgent.startSession(cached.report, { applyItemId, userPrompt });
  }

  @Post('complete')
  async complete(
    @Req() req: Request,
    @Body() body: { summary?: { ranAt: string; overall: 'pass' | 'warn' | 'fail' } },
  ) {
    const auth = this.extractAuthHeader(req);
    if (!auth) throw new HttpException('Missing token', HttpStatus.UNAUTHORIZED);
    const user = (req as any).user as JwtUser | undefined;
    const cached = user ? this.reportCache.get(user.sub) : undefined;
    const summary =
      body?.summary ||
      (cached
        ? {
            ranAt: cached.report.ranAt,
            overall: this.overallToPersistedStatus(cached.report.overall),
          }
        : undefined);

    const res = await fetch(`${this.oauthServerUrl}/auth/first-run/complete`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new HttpException(text || 'oauth-server error', res.status);
    }
    return res.json();
  }

  @Roles('admin')
  @Post('reset/:userId')
  async reset(@Req() req: Request, @Param('userId') userId: string) {
    const auth = this.extractAuthHeader(req);
    if (!auth) throw new HttpException('Missing token', HttpStatus.UNAUTHORIZED);
    const res = await fetch(`${this.oauthServerUrl}/auth/first-run/reset/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new HttpException(text || 'oauth-server error', res.status);
    }
    return res.json();
  }

  private summarize(checks: any[]): 'ok' | 'warn' | 'fail' {
    const hasCriticalFail = checks.some(
      (c) => c.status === 'fail' && (c.severity === 'critical' || c.severity === 'high'),
    );
    if (hasCriticalFail) return 'fail';
    const hasAnyIssue = checks.some((c) => c.status === 'fail' || c.status === 'warn');
    return hasAnyIssue ? 'warn' : 'ok';
  }

  private overallToPersistedStatus(s: 'ok' | 'warn' | 'fail'): 'pass' | 'warn' | 'fail' {
    return s === 'ok' ? 'pass' : s;
  }
}
