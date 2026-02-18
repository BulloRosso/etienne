import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as public (no authentication required).
 * Use for health checks, webhooks, machine-to-machine endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
