import { Controller, Get, Post, Param, Query, Req, Res, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Ms365TokenService } from './ms365-token.service';
import { ms365Scopes } from './ms365-scopes';
import { randomBytes } from 'crypto';
import axios from 'axios';

const stateStore = new Map<string, { project: string; createdAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

function purgeOldStates() {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [k, v] of stateStore) {
    if (v.createdAt < cutoff) stateStore.delete(k);
  }
}

@Controller('api/ms365')
@Public()
export class Ms365OAuthController {
  private readonly logger = new Logger(Ms365OAuthController.name);

  constructor(private readonly tokens: Ms365TokenService) {}

  private get tenantId(): string {
    return process.env.MS365_MCP_TENANT_ID || 'common';
  }

  private get clientId(): string | undefined {
    return process.env.MS365_MCP_CLIENT_ID;
  }

  private get redirectUri(): string {
    return process.env.MS365_REDIRECT_URI || 'http://localhost:6060/api/ms365/oauth/callback';
  }

  private get scopes(): string {
    return ms365Scopes();
  }

  @Get(':project/connect')
  async connect(@Param('project') project: string, @Res() res: Response): Promise<void> {
    if (!this.clientId) {
      res.status(500).send('MS365_MCP_CLIENT_ID not configured');
      return;
    }
    purgeOldStates();
    const state = randomBytes(16).toString('hex');
    stateStore.set(state, { project, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: this.scopes,
      state,
      prompt: 'select_account',
    });
    const url = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    this.logger.log(`Initiating MS365 OAuth for project ${project}`);
    res.redirect(url);
  }

  @Get('oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      this.logger.error(`MS365 OAuth error: ${error} - ${errorDescription}`);
      res.status(400).send(this.popupHtml(false, `${error}: ${errorDescription || ''}`));
      return;
    }
    if (!code || !state) {
      res.status(400).send(this.popupHtml(false, 'Missing code or state'));
      return;
    }
    const entry = stateStore.get(state);
    if (!entry) {
      res.status(400).send(this.popupHtml(false, 'Invalid or expired state'));
      return;
    }
    stateStore.delete(state);

    try {
      const body = new URLSearchParams({
        client_id: this.clientId!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        scope: this.scopes,
      });
      const clientSecret = process.env.MS365_MCP_CLIENT_SECRET;
      if (clientSecret) body.set('client_secret', clientSecret);

      const tokenResp = await axios.post(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const accessToken: string = tokenResp.data.access_token;
      const refreshToken: string = tokenResp.data.refresh_token;
      const expiresIn: number = tokenResp.data.expires_in || 3600;

      const meResp = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const accountEmail: string | undefined = meResp.data.mail || meResp.data.userPrincipalName;
      const homeAccountId: string = meResp.data.id;

      await this.tokens.store(entry.project, {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
        homeAccountId,
        accountEmail,
      });
      this.logger.log(`MS365 connected for project ${entry.project} as ${accountEmail}`);
      res.send(this.popupHtml(true, accountEmail || homeAccountId));
    } catch (err: any) {
      const msg = err?.response?.data?.error_description || err.message || 'unknown error';
      this.logger.error(`Token exchange failed: ${msg}`);
      res.status(500).send(this.popupHtml(false, msg));
    }
  }

  @Get(':project/status')
  async status(@Param('project') project: string): Promise<{ connected: boolean; accountEmail?: string; expiresAt?: number }> {
    return this.tokens.getStatus(project);
  }

  @Post(':project/disconnect')
  async disconnect(@Param('project') project: string): Promise<{ ok: true }> {
    await this.tokens.disconnect(project);
    return { ok: true };
  }

  private popupHtml(success: boolean, detail: string): string {
    const safeDetail = detail.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
    return `<!doctype html><html><head><meta charset="utf-8"><title>${success ? 'Connected' : 'Failed'}</title>
<style>body{font-family:system-ui;margin:40px;text-align:center}h2{color:${success ? '#1a7' : '#c33'}}</style>
</head><body>
<h2>${success ? 'Microsoft 365 connected' : 'Connection failed'}</h2>
<p>${safeDetail}</p>
<p>You can close this window.</p>
<script>
  try { window.opener && window.opener.postMessage({ type: 'ms365-oauth', success: ${success ? 'true' : 'false'}, detail: ${JSON.stringify(safeDetail)} }, '*'); } catch (e) {}
  setTimeout(() => window.close(), 1500);
</script>
</body></html>`;
  }
}
