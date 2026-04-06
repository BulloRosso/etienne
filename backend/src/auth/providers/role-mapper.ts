import { Injectable, Logger } from '@nestjs/common';

export type UserRole = 'guest' | 'user' | 'admin';

@Injectable()
export class RoleMapperService {
  private readonly logger = new Logger(RoleMapperService.name);

  /**
   * Map IdP group memberships to a local role.
   *
   * Admin groups are read from:
   *   - AZURE_ENTRAID_ADMIN_GROUPS  (comma-separated Azure AD group IDs)
   *   - AWS_COGNITO_ADMIN_GROUPS    (comma-separated Cognito group names)
   *
   * If the user belongs to any listed admin group they receive the 'admin' role.
   * Otherwise all cloud-authenticated users default to 'user'.
   */
  mapRole(provider: string, groups?: string[]): UserRole {
    if (!groups || groups.length === 0) {
      return 'user';
    }

    const adminGroupsEnv =
      provider === 'azure-entraid'
        ? process.env.AZURE_ENTRAID_ADMIN_GROUPS
        : process.env.AWS_COGNITO_ADMIN_GROUPS;

    if (!adminGroupsEnv) {
      return 'user';
    }

    const adminGroups = adminGroupsEnv
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    const isAdmin = groups.some((g) => adminGroups.includes(g));
    if (isAdmin) {
      this.logger.debug(`User matched admin group — granting admin role`);
      return 'admin';
    }

    return 'user';
  }
}
