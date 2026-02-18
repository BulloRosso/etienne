import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { JwtUser } from './jwt-auth.guard';

const ROLE_HIERARCHY: Record<string, number> = {
  guest: 1,
  user: 2,
  admin: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRole = this.reflector.getAllAndOverride<string>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator = any authenticated user
    if (!requiredRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtUser = request.user;

    if (!user) {
      throw new ForbiddenException('No user information available');
    }

    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRole}, Current: ${user.role}`,
      );
    }

    return true;
  }
}
