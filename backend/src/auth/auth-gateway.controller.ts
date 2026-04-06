import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  Query,
  Logger,
  OnModuleInit,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { Public } from './public.decorator';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';
import { AzureEntraIdProvider } from './providers/azure-entraid.provider';
import { AwsCognitoProvider } from './providers/aws-cognito.provider';
import { RoleMapperService } from './providers/role-mapper';
import type { AuthProviderType, IAuthProvider, OIDCUser } from './providers/auth-provider.interface';

/** One-time callback codes: code → { tokens, expires } */
interface CallbackEntry {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; role: string; displayName: string };
  expires: number;
}

/** OIDC state entries: state → expires timestamp */
const pendingStates = new Map<string, number>();

/** One-time codes issued after callback: code → CallbackEntry */
const callbackCodes = new Map<string, CallbackEntry>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (v < now) pendingStates.delete(k);
  }
  for (const [k, v] of callbackCodes) {
    if (v.expires < now) callbackCodes.delete(k);
  }
}, 60_000);

@Controller('auth')
export class AuthGatewayController implements OnModuleInit {
  private readonly logger = new Logger(AuthGatewayController.name);
  private jwtSecret = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

  constructor(
    private readonly secretsManager: SecretsManagerService,
    private readonly azureProvider: AzureEntraIdProvider,
    private readonly cognitoProvider: AwsCognitoProvider,
    private readonly roleMapper: RoleMapperService,
  ) {}

  async onModuleInit() {
    const secret = await this.secretsManager.getSecret('JWT_SECRET');
    if (secret) this.jwtSecret = secret;
  }

  private get authProvider(): AuthProviderType {
    return (process.env.AUTH_PROVIDER as AuthProviderType) || 'local';
  }

  private get oauthServerUrl(): string {
    return process.env.OAUTH_SERVER_URL || 'http://localhost:5950';
  }

  private getCloudProvider(): IAuthProvider {
    if (this.authProvider === 'azure-entraid') return this.azureProvider;
    if (this.authProvider === 'aws-cognito') return this.cognitoProvider;
    throw new Error('No cloud provider for local auth');
  }

  // ─── Public: which provider is active? ───────────────────────────────

  @Public()
  @Get('provider')
  getProvider() {
    return { provider: this.authProvider };
  }

  // ─── Local-mode proxy helpers ────────────────────────────────────────

  private async proxyToOAuthServer(req: Request, res: Response) {
    const path = req.originalUrl; // e.g. /auth/login
    const url = `${this.oauthServerUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
    };
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    try {
      const fetchOpts: RequestInit = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(10_000),
      };
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOpts.body = JSON.stringify(req.body);
      }

      const upstream = await fetch(url, fetchOpts);
      const body = await upstream.text();

      res.status(upstream.status);
      for (const [k, v] of upstream.headers.entries()) {
        if (k.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(k, v);
        }
      }
      res.send(body);
    } catch (err: any) {
      this.logger.error(`Proxy to oauth-server failed: ${err.message}`);
      res.status(502).json({ error: 'OAuth server unavailable' });
    }
  }

  // ─── POST /auth/login ────────────────────────────────────────────────

  @Public()
  @Post('login')
  async login(@Req() req: Request, @Res() res: Response) {
    if (this.authProvider !== 'local') {
      return res.status(404).json({ error: 'Local authentication is disabled. Use the cloud provider login.' });
    }
    return this.proxyToOAuthServer(req, res);
  }

  // ─── POST /auth/refresh ──────────────────────────────────────────────

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    if (this.authProvider === 'local') {
      return this.proxyToOAuthServer(req, res);
    }

    // Cloud mode: refresh tokens are locally minted
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
      if (decoded.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid token type' });
      }

      const accessToken = jwt.sign(
        {
          sub: decoded.sub,
          username: decoded.username,
          role: decoded.role,
          displayName: decoded.displayName,
          type: 'access',
        },
        this.jwtSecret,
        { expiresIn: '15m' },
      );

      return res.json({ accessToken });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  // ─── GET /auth/me ────────────────────────────────────────────────────

  @Public()
  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    if (this.authProvider === 'local') {
      return this.proxyToOAuthServer(req, res);
    }

    const token = this.extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    try {
      const payload = jwt.verify(token, this.jwtSecret) as any;
      if (payload.type !== 'access') {
        return res.status(401).json({ error: 'Invalid token type' });
      }
      return res.json({
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        displayName: payload.displayName,
      });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // ─── GET /auth/validate ──────────────────────────────────────────────

  @Public()
  @Get('validate')
  async validate(@Req() req: Request, @Res() res: Response) {
    if (this.authProvider === 'local') {
      return this.proxyToOAuthServer(req, res);
    }

    const token = this.extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ valid: false, error: 'Authorization header required' });
    }

    try {
      const payload = jwt.verify(token, this.jwtSecret) as any;
      if (payload.type !== 'access') {
        return res.status(401).json({ valid: false, error: 'Invalid token type' });
      }
      return res.json({
        valid: true,
        user: {
          id: payload.sub,
          username: payload.username,
          role: payload.role,
          displayName: payload.displayName,
        },
      });
    } catch {
      return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
    }
  }

  // ─── POST /auth/change-password ──────────────────────────────────────

  @Public()
  @Post('change-password')
  async changePassword(@Req() req: Request, @Res() res: Response) {
    if (this.authProvider !== 'local') {
      return res.status(404).json({ error: 'Password management is handled by the cloud identity provider.' });
    }
    return this.proxyToOAuthServer(req, res);
  }

  // ─── GET /auth/authorize (cloud only) ────────────────────────────────

  @Public()
  @Get('authorize')
  authorize() {
    if (this.authProvider === 'local') {
      throw new HttpException('Not applicable for local auth', HttpStatus.NOT_FOUND);
    }

    const state = crypto.randomBytes(32).toString('hex');
    pendingStates.set(state, Date.now() + 5 * 60 * 1000); // 5-minute TTL

    const provider = this.getCloudProvider();
    const url = provider.getAuthorizationUrl(state);

    return { url, state };
  }

  // ─── GET /auth/callback (cloud only) ─────────────────────────────────

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (this.authProvider === 'local') {
      return res.status(404).json({ error: 'Not applicable for local auth' });
    }

    // Validate state
    if (!state || !pendingStates.has(state)) {
      return res.status(400).json({ error: 'Invalid or expired state parameter' });
    }
    if (pendingStates.get(state)! < Date.now()) {
      pendingStates.delete(state);
      return res.status(400).json({ error: 'State parameter expired' });
    }
    pendingStates.delete(state);

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    try {
      const provider = this.getCloudProvider();
      const redirectUri =
        this.authProvider === 'azure-entraid'
          ? process.env.AZURE_ENTRAID_REDIRECT_URI || ''
          : process.env.AWS_COGNITO_REDIRECT_URI || process.env.AZURE_ENTRAID_REDIRECT_URI || '';

      const idpUser: OIDCUser = await provider.exchangeCode(code, redirectUri);

      // Map role from IdP groups
      const role = this.roleMapper.mapRole(this.authProvider, idpUser.groups);

      // Mint local JWTs
      const user = {
        id: idpUser.id,
        username: idpUser.username,
        role,
        displayName: idpUser.displayName,
      };

      const accessToken = jwt.sign(
        { sub: user.id, username: user.username, role: user.role, displayName: user.displayName, type: 'access' },
        this.jwtSecret,
        { expiresIn: '15m' },
      );

      const refreshToken = jwt.sign(
        { sub: user.id, username: user.username, role: user.role, displayName: user.displayName, type: 'refresh' },
        this.jwtSecret,
        { expiresIn: '7d' },
      );

      // Store tokens under a one-time code (avoids tokens in URL)
      const callbackCode = crypto.randomBytes(32).toString('hex');
      callbackCodes.set(callbackCode, {
        accessToken,
        refreshToken,
        user,
        expires: Date.now() + 2 * 60 * 1000, // 2-minute TTL
      });

      // Redirect to frontend with the one-time code
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
      return res.redirect(`${frontendUrl}/?auth_code=${callbackCode}`);
    } catch (err: any) {
      this.logger.error(`OIDC callback failed: ${err.message}`);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
      return res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('Authentication failed')}`);
    }
  }

  // ─── POST /auth/exchange-callback-code ───────────────────────────────

  @Public()
  @Post('exchange-callback-code')
  exchangeCallbackCode(@Body() body: { code: string }) {
    if (!body.code) {
      throw new HttpException('Code is required', HttpStatus.BAD_REQUEST);
    }

    const entry = callbackCodes.get(body.code);
    if (!entry) {
      throw new HttpException('Invalid or expired code', HttpStatus.UNAUTHORIZED);
    }
    if (entry.expires < Date.now()) {
      callbackCodes.delete(body.code);
      throw new HttpException('Code expired', HttpStatus.UNAUTHORIZED);
    }

    // One-time use: delete immediately
    callbackCodes.delete(body.code);

    return {
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
      user: entry.user,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private extractBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }
}
