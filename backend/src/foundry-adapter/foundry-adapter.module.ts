import { Module, DynamicModule, Logger } from '@nestjs/common';
import { FoundryAdapterService } from './foundry-adapter.service';
import { FoundrySessionService } from './foundry-session.service';
import { FoundryIdentityService } from './foundry-identity.service';

/**
 * Azure Foundry Agent Service protocol adapter.
 *
 * Conditionally activated when `FOUNDRY_ENABLED=true`. Starts a
 * second HTTP server on port 8088 implementing GET /readiness,
 * POST /responses, and POST /invocations.
 */
@Module({})
export class FoundryAdapterModule {
  private static readonly logger = new Logger(FoundryAdapterModule.name);

  static register(): DynamicModule {
    if (process.env.FOUNDRY_ENABLED !== 'true') {
      this.logger.log('FOUNDRY_ENABLED is not set — Foundry adapter disabled');
      return { module: FoundryAdapterModule };
    }

    this.logger.log('Foundry adapter module enabled');
    return {
      module: FoundryAdapterModule,
      providers: [
        FoundryAdapterService,
        FoundrySessionService,
        FoundryIdentityService,
      ],
      exports: [FoundryIdentityService],
    };
  }
}
