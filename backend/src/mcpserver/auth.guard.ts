import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * MCP Authentication Guard
 * 
 * Validates the presence and correctness of the MCP access token
 * in the Authorization header
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly VALID_TOKEN = 'test123';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    // Allow unauthenticated requests from localhost (internal SDK calls)
    if (!authHeader) {
      const host = request.hostname || request.headers.host || '';
      if (host === 'localhost' || host.startsWith('127.0.0.1') || host.startsWith('::1')) {
        return true;
      }
      throw new UnauthorizedException('Missing Authorization header');
    }

    // Extract token (support both "Bearer <token>" and plain token)
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;
    // Validate token
    if (token !== this.VALID_TOKEN) {
      throw new UnauthorizedException('Invalid MCP access token');
    }

    return true;
  }
}