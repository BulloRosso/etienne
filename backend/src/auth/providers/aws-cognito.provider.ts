import { Injectable, Logger } from '@nestjs/common';
import type { IAuthProvider, OIDCUser } from './auth-provider.interface';

@Injectable()
export class AwsCognitoProvider implements IAuthProvider {
  private readonly logger = new Logger(AwsCognitoProvider.name);

  private get domain(): string {
    return process.env.AWS_COGNITO_DOMAIN || '';
  }
  private get clientId(): string {
    return process.env.AWS_COGNITO_CLIENT_ID || '';
  }
  private get clientSecret(): string {
    return process.env.AWS_COGNITO_CLIENT_SECRET || '';
  }
  private get region(): string {
    return process.env.AWS_COGNITO_REGION || '';
  }
  private get redirectUri(): string {
    // Cognito uses the same redirect URI concept; derive from the domain or use explicit env var.
    return process.env.AWS_COGNITO_REDIRECT_URI || process.env.AZURE_ENTRAID_REDIRECT_URI || '';
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: this.redirectUri,
      state,
    });
    return `https://${this.domain}/oauth2/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OIDCUser> {
    const tokenUrl = `https://${this.domain}/oauth2/token`;

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri || this.redirectUri,
      client_id: this.clientId,
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      this.logger.error(`Token exchange failed: ${err}`);
      throw new Error('AWS Cognito token exchange failed');
    }

    const tokenData = await tokenRes.json();
    const idToken: string = tokenData.id_token;

    if (!idToken) {
      throw new Error('No id_token in Cognito response');
    }

    const payload = this.decodeJwtPayload(idToken);

    // Cognito encodes group memberships in the 'cognito:groups' claim
    const groups: string[] = payload['cognito:groups'] || [];

    return {
      id: payload.sub,
      username: payload.email || payload.preferred_username || payload.sub,
      displayName: payload.name || payload.email || 'User',
      email: payload.email || '',
      groups,
    };
  }

  private decodeJwtPayload(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  }
}
