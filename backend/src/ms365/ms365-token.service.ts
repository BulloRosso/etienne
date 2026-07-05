import { Injectable, Logger } from '@nestjs/common';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';
import axios from 'axios';
import { ms365Scopes } from './ms365-scopes';

export interface Ms365TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  homeAccountId: string;
  accountEmail?: string;
}

const REFRESH_SKEW_MS = 5 * 60 * 1000;

@Injectable()
export class Ms365TokenService {
  private readonly logger = new Logger(Ms365TokenService.name);
  private readonly inFlightRefresh = new Map<string, Promise<Ms365TokenSet>>();

  constructor(private readonly secrets: SecretsManagerService) {}

  private keys(project: string) {
    return {
      access: `ms365/${project}/access_token`,
      refresh: `ms365/${project}/refresh_token`,
      expires: `ms365/${project}/expires_at`,
      home: `ms365/${project}/home_account_id`,
      email: `ms365/${project}/account_email`,
    };
  }

  async store(project: string, tokens: Ms365TokenSet): Promise<void> {
    const k = this.keys(project);
    await Promise.all([
      this.secrets.setSecret(k.access, tokens.accessToken),
      this.secrets.setSecret(k.refresh, tokens.refreshToken),
      this.secrets.setSecret(k.expires, String(tokens.expiresAt)),
      this.secrets.setSecret(k.home, tokens.homeAccountId),
      tokens.accountEmail ? this.secrets.setSecret(k.email, tokens.accountEmail) : Promise.resolve(),
    ]);
    this.logger.log(`Stored MS365 tokens for project ${project} (account ${tokens.accountEmail || tokens.homeAccountId})`);
  }

  async load(project: string): Promise<Ms365TokenSet | null> {
    const k = this.keys(project);
    const [access, refresh, expires, home, email] = await Promise.all([
      this.secrets.getSecret(k.access),
      this.secrets.getSecret(k.refresh),
      this.secrets.getSecret(k.expires),
      this.secrets.getSecret(k.home),
      this.secrets.getSecret(k.email),
    ]);
    if (!refresh || !home) return null;
    return {
      accessToken: access || '',
      refreshToken: refresh,
      expiresAt: Number(expires || 0),
      homeAccountId: home,
      accountEmail: email || undefined,
    };
  }

  async disconnect(project: string): Promise<void> {
    const k = this.keys(project);
    await Promise.all([
      this.secrets.deleteSecret(k.access),
      this.secrets.deleteSecret(k.refresh),
      this.secrets.deleteSecret(k.expires),
      this.secrets.deleteSecret(k.home),
      this.secrets.deleteSecret(k.email),
    ]);
    this.logger.log(`Disconnected MS365 for project ${project}`);
  }

  async getValidAccessToken(project: string): Promise<string | null> {
    const tokens = await this.load(project);
    if (!tokens) return null;

    if (tokens.accessToken && Date.now() < tokens.expiresAt - REFRESH_SKEW_MS) {
      return tokens.accessToken;
    }

    if (this.inFlightRefresh.has(project)) {
      const refreshed = await this.inFlightRefresh.get(project)!;
      return refreshed.accessToken;
    }

    const promise = this.refreshTokens(project, tokens.refreshToken)
      .finally(() => this.inFlightRefresh.delete(project));
    this.inFlightRefresh.set(project, promise);

    const refreshed = await promise;
    return refreshed.accessToken;
  }

  private async refreshTokens(project: string, refreshToken: string): Promise<Ms365TokenSet> {
    const tenantId = process.env.MS365_MCP_TENANT_ID || 'common';
    const clientId = process.env.MS365_MCP_CLIENT_ID;
    const clientSecret = process.env.MS365_MCP_CLIENT_SECRET;
    if (!clientId) throw new Error('MS365_MCP_CLIENT_ID not configured');

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: ms365Scopes(),
    });
    if (clientSecret) body.set('client_secret', clientSecret);

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const resp = await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const existing = await this.load(project);
    const updated: Ms365TokenSet = {
      accessToken: resp.data.access_token,
      refreshToken: resp.data.refresh_token || refreshToken,
      expiresAt: Date.now() + (resp.data.expires_in || 3600) * 1000,
      homeAccountId: existing?.homeAccountId || '',
      accountEmail: existing?.accountEmail,
    };
    await this.store(project, updated);
    this.logger.log(`Refreshed MS365 access token for project ${project}`);
    return updated;
  }

  async getStatus(project: string): Promise<{ connected: boolean; accountEmail?: string; expiresAt?: number }> {
    const tokens = await this.load(project);
    if (!tokens) return { connected: false };
    return {
      connected: true,
      accountEmail: tokens.accountEmail,
      expiresAt: tokens.expiresAt,
    };
  }
}
