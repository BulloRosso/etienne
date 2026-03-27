import { Global, Module } from '@nestjs/common';
import { SecretsManagerService } from './secrets-manager.service';
import { SecretsManagerController } from './secrets-manager.controller';
import { OpenBaoProvider } from './providers/openbao.provider';
import { EnvProvider } from './providers/env.provider';
import { AzureKeyVaultProvider } from './providers/azure-keyvault.provider';
import { AwsSecretsManagerProvider } from './providers/aws-secrets-manager.provider';

@Global()
@Module({
  controllers: [SecretsManagerController],
  providers: [SecretsManagerService, OpenBaoProvider, EnvProvider, AzureKeyVaultProvider, AwsSecretsManagerProvider],
  exports: [SecretsManagerService],
})
export class SecretsManagerModule {}
