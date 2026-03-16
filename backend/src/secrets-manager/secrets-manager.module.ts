import { Global, Module } from '@nestjs/common';
import { SecretsManagerService } from './secrets-manager.service';
import { SecretsManagerController } from './secrets-manager.controller';
import { OpenBaoProvider } from './providers/openbao.provider';
import { EnvProvider } from './providers/env.provider';

@Global()
@Module({
  controllers: [SecretsManagerController],
  providers: [SecretsManagerService, OpenBaoProvider, EnvProvider],
  exports: [SecretsManagerService],
})
export class SecretsManagerModule {}
