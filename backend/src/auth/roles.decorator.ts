import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Sets the minimum role required for an endpoint.
 * Role hierarchy: guest < user < admin
 *
 * @param role - Minimum role: 'guest', 'user', or 'admin'
 *
 * Usage:
 *   @Roles('admin')   - Only admin can access
 *   @Roles('user')    - user and admin can access
 *   (no decorator)    - any authenticated user (guest+)
 */
export const Roles = (role: 'guest' | 'user' | 'admin') => SetMetadata(ROLES_KEY, role);
