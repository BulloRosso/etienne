import { Injectable, Logger } from '@nestjs/common';
import { ClientSecretCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { ISecretProvider } from '../secret-provider.interface';

@Injectable()
export class AzureKeyVaultProvider implements ISecretProvider {
  private readonly logger = new Logger(AzureKeyVaultProvider.name);
  private readonly client: SecretClient | null;

  constructor() {
    const tenantId = process.env.AZURE_TENANT_ID || '';
    const clientId = process.env.AZURE_CLIENT_ID || '';
    const clientSecret = process.env.AZURE_CLIENT_SECRET || '';
    const vaultUrl = process.env.AZURE_VAULT_URL || '';

    if (tenantId && clientId && clientSecret && vaultUrl) {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      this.client = new SecretClient(vaultUrl, credential);
      this.logger.log(`Azure Key Vault provider configured for ${vaultUrl}`);
    } else {
      this.client = null;
      this.logger.warn('Azure Key Vault provider not configured — missing env vars');
    }
  }

  private toAzureName(key: string): string {
    return key.replace(/_/g, '-');
  }

  private fromAzureName(name: string): string {
    return name.replace(/-/g, '_');
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const secret = await this.client.getSecret(this.toAzureName(key), {
        abortSignal: AbortSignal.timeout(5000),
      });
      return secret.value ?? null;
    } catch (err: any) {
      if (err.statusCode === 404) return null;
      this.logger.warn(`Failed to get secret ${key}: ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Azure Key Vault client not configured');
    const response = await this.client.setSecret(this.toAzureName(key), value, {
      abortSignal: AbortSignal.timeout(5000),
    });
    if (!response.name) {
      throw new Error(`Failed to set secret ${key}`);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) throw new Error('Azure Key Vault client not configured');
    try {
      await this.client.beginDeleteSecret(this.toAzureName(key), {
        abortSignal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      if (err.statusCode === 404) return;
      throw new Error(`Failed to delete secret ${key}: ${err.message}`);
    }
  }

  async list(): Promise<string[]> {
    if (!this.client) return [];
    try {
      const keys: string[] = [];
      for await (const properties of this.client.listPropertiesOfSecrets()) {
        if (properties.name) {
          keys.push(this.fromAzureName(properties.name));
        }
      }
      return keys;
    } catch (err: any) {
      this.logger.warn(`Error listing secrets: ${err.message}`);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const iter = this.client.listPropertiesOfSecrets();
      await iter.next();
      return true;
    } catch {
      return false;
    }
  }
}
