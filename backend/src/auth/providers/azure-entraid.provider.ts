import { Injectable, Logger } from '@nestjs/common';
import type { IAuthProvider, OIDCUser } from './auth-provider.interface';

@Injectable()
export class AzureEntraIdProvider implements IAuthProvider {
  private readonly logger = new Logger(AzureEntraIdProvider.name);

  private get tenantId(): string {
    return process.env.AZURE_ENTRAID_TENANT_ID || '';
  }
  private get clientId(): string {
    return process.env.AZURE_ENTRAID_CLIENT_ID || '';
  }
  private get clientSecret(): string {
    return process.env.AZURE_ENTRAID_CLIENT_SECRET || '';
  }
  private get redirectUri(): string {
    return process.env.AZURE_ENTRAID_REDIRECT_URI || '';
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email',
      state,
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OIDCUser> {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: redirectUri || this.redirectUri,
      grant_type: 'authorization_code',
      scope: 'openid profile email',
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      this.logger.error(`Token exchange failed: ${err}`);
      throw new Error('Azure Entra ID token exchange failed');
    }

    const tokenData = await tokenRes.json();
    const idToken: string = tokenData.id_token;

    if (!idToken) {
      throw new Error('No id_token in Azure Entra ID response');
    }

    // Decode the JWT payload (we trust it because we just received it over TLS
    // from login.microsoftonline.com in exchange for our client_secret).
    const payload = this.decodeJwtPayload(idToken);

    // Fetch group memberships via the access token if available
    let groups: string[] = [];
    if (tokenData.access_token) {
      groups = await this.fetchGroups(tokenData.access_token);
    }

    return {
      id: payload.oid || payload.sub,
      username: payload.preferred_username || payload.email || payload.upn || payload.sub,
      displayName: payload.name || payload.preferred_username || 'User',
      email: payload.email || payload.preferred_username || payload.upn || '',
      groups,
    };
  }

  private async fetchGroups(accessToken: string): Promise<string[]> {
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.value || [])
        .filter((m: any) => m['@odata.type'] === '#microsoft.graph.group')
        .map((m: any) => m.id);
    } catch (err) {
      this.logger.warn(`Failed to fetch Azure AD groups: ${err}`);
      return [];
    }
  }

  private decodeJwtPayload(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  }
}
