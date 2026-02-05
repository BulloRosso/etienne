import jwt from 'jsonwebtoken';
import type { User, AccessTokenPayload, RefreshTokenPayload } from '../types/index.js';
import { userService } from './user.service.js';

export class TokenService {
  private getSecret(): string {
    return userService.getSettings().jwtSecret;
  }

  private getAccessExpiry(): string {
    return userService.getSettings().accessTokenExpiry;
  }

  private getRefreshExpiry(): string {
    return userService.getSettings().refreshTokenExpiry;
  }

  public generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      type: 'access' as const,
    };

    return jwt.sign(payload, this.getSecret(), {
      expiresIn: this.getAccessExpiry(),
    } as jwt.SignOptions);
  }

  public generateRefreshToken(user: User): string {
    const payload = {
      sub: user.id,
      type: 'refresh' as const,
    };

    return jwt.sign(payload, this.getSecret(), {
      expiresIn: this.getRefreshExpiry(),
    } as jwt.SignOptions);
  }

  public verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.getSecret()) as AccessTokenPayload;
      if (decoded.type !== 'access') {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  public verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.getSecret()) as RefreshTokenPayload;
      if (decoded.type !== 'refresh') {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }
}

export const tokenService = new TokenService();
