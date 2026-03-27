import { Injectable, Logger } from '@nestjs/common';
import { ISecretProvider } from './secret-provider.interface';
import { OpenBaoProvider } from './providers/openbao.provider';
import { EnvProvider } from './providers/env.provider';
import { AzureKeyVaultProvider } from './providers/azure-keyvault.provider';
import { AwsSecretsManagerProvider } from './providers/aws-secrets-manager.provider';

@Injectable()
export class SecretsManagerService {
  private readonly logger = new Logger(SecretsManagerService.name);
  private provider: ISecretProvider;
  private fallback: ISecretProvider;

  constructor(
    private openbaoProvider: OpenBaoProvider,
    private envProvider: EnvProvider,
    private azureKeyVaultProvider: AzureKeyVaultProvider,
    private awsSecretsManagerProvider: AwsSecretsManagerProvider,
  ) {
    const providerType = process.env.SECRET_VAULT_PROVIDER || 'openbao';

    if (providerType === 'env') {
      this.provider = envProvider;
      this.logger.log('Using environment variable secret provider');
    } else if (providerType === 'azure-keyvault') {
      this.provider = azureKeyVaultProvider;
      this.logger.log('Using Azure Key Vault secret provider');
    } else if (providerType === 'aws') {
      this.provider = awsSecretsManagerProvider;
      this.logger.log('Using AWS Secrets Manager provider');
    } else {
      this.provider = openbaoProvider;
      this.logger.log('Using OpenBao secret provider');
    }

    this.fallback = envProvider;
  }

  async getSecret(key: string): Promise<string | null> {
    try {
      if (await this.provider.isAvailable()) {
        const value = await this.provider.get(key);
        if (value !== null) return value;
      }
    } catch (err) {
      this.logger.warn(`Primary provider failed for ${key}, falling back to env: ${err}`);
    }

    return this.fallback.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.provider.set(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    await this.provider.delete(key);
  }

  async listSecrets(): Promise<string[]> {
    try {
      if (await this.provider.isAvailable()) {
        return await this.provider.list();
      }
    } catch {
      // fall through
    }
    return [];
  }

  async isVaultAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }
}
