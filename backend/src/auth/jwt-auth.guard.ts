import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production-dobt7txrm3u';

export interface JwtUser {
  sub: string;
  username: string;
  role: 'guest' | 'user' | 'admin';
  displayName: string;
  type: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtUser;
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }
      (request as any).user = payload;
      return true;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid token');
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const queryToken = request.query?.token as string;
    if (queryToken) {
      return queryToken;
    }

    return null;
  }
}
