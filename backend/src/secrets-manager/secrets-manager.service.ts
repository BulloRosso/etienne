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
  private providerDisabled = false;

  constructor(
    private openbaoProvider: OpenBaoProvider,
    private envProvider: EnvProvider,
    private azureKeyVaultProvider: AzureKeyVaultProvider,
    private awsSecretsManagerProvider: AwsSecretsManagerProvider,
  ) {
    const providerType = process.env.CLAUDE_CODE_USE_FOUNDRY
      ? 'azure-keyvault'
      : process.env.SECRET_VAULT_PROVIDER || 'openbao';

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

  private disableProvider(reason: string): void {
    this.providerDisabled = true;
    this.logger.error(
      `Primary provider permanently disabled for this session: ${reason}. ` +
      `Falling back to environment variables.`,
    );
  }

  async getSecret(key: string): Promise<string | null> {
    if (!this.providerDisabled) {
      try {
        if (await this.provider.isAvailable()) {
          const value = await this.provider.get(key);
          if (value !== null) return value;
        } else {
          this.disableProvider('provider reported unavailable');
        }
      } catch (err) {
        this.disableProvider(`${err}`);
      }
    }

    return this.fallback.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    if (this.providerDisabled) {
      await this.fallback.set(key, value);
      return;
    }
    try {
      await this.provider.set(key, value);
    } catch (err) {
      this.disableProvider(`${err}`);
      await this.fallback.set(key, value);
    }
  }

  async deleteSecret(key: string): Promise<void> {
    if (this.providerDisabled) {
      await this.fallback.delete(key);
      return;
    }
    try {
      await this.provider.delete(key);
    } catch (err) {
      this.disableProvider(`${err}`);
      await this.fallback.delete(key);
    }
  }

  async listSecrets(): Promise<string[]> {
    if (!this.providerDisabled) {
      try {
        if (await this.provider.isAvailable()) {
          return await this.provider.list();
        } else {
          this.disableProvider('provider reported unavailable');
        }
      } catch (err) {
        this.disableProvider(`${err}`);
      }
    }
    return this.fallback.list();
  }

  async isVaultAvailable(): Promise<boolean> {
    if (this.providerDisabled) return false;
    return this.provider.isAvailable();
  }
}
