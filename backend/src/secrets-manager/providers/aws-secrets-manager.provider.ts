import { Injectable, Logger } from '@nestjs/common';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';
import { ISecretProvider } from '../secret-provider.interface';

@Injectable()
export class AwsSecretsManagerProvider implements ISecretProvider {
  private readonly logger = new Logger(AwsSecretsManagerProvider.name);
  private readonly client: SecretsManagerClient | null;
  private readonly prefix: string;

  constructor() {
    const region = process.env.AWS_REGION || '';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    this.prefix = process.env.AWS_SECRETS_PREFIX || '';

    if (region && accessKeyId && secretAccessKey) {
      this.client = new SecretsManagerClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(`AWS Secrets Manager provider configured (region: ${region})`);
    } else {
      this.client = null;
      this.logger.warn('AWS Secrets Manager provider not configured — missing env vars');
    }
  }

  private toAwsName(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  private fromAwsName(name: string): string {
    return this.prefix ? name.replace(`${this.prefix}/`, '') : name;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({ SecretId: this.toAwsName(key) }),
      );
      return result.SecretString ?? null;
    } catch (err: any) {
      if (err instanceof ResourceNotFoundException) return null;
      this.logger.warn(`Failed to get secret ${key}: ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) throw new Error('AWS Secrets Manager client not configured');
    const name = this.toAwsName(key);
    try {
      await this.client.send(
        new UpdateSecretCommand({ SecretId: name, SecretString: value }),
      );
    } catch (err: any) {
      if (err instanceof ResourceNotFoundException) {
        await this.client.send(
          new CreateSecretCommand({ Name: name, SecretString: value }),
        );
        return;
      }
      throw new Error(`Failed to set secret ${key}: ${err.message}`);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) throw new Error('AWS Secrets Manager client not configured');
    try {
      await this.client.send(
        new DeleteSecretCommand({
          SecretId: this.toAwsName(key),
          ForceDeleteWithoutRecovery: true,
        }),
      );
    } catch (err: any) {
      if (err instanceof ResourceNotFoundException) return;
      throw new Error(`Failed to delete secret ${key}: ${err.message}`);
    }
  }

  async list(): Promise<string[]> {
    if (!this.client) return [];
    try {
      const keys: string[] = [];
      let nextToken: string | undefined;
      do {
        const result = await this.client.send(
          new ListSecretsCommand({
            NextToken: nextToken,
            Filters: this.prefix
              ? [{ Key: 'name', Values: [this.prefix] }]
              : undefined,
          }),
        );
        for (const secret of result.SecretList ?? []) {
          if (secret.Name) {
            keys.push(this.fromAwsName(secret.Name));
          }
        }
        nextToken = result.NextToken;
      } while (nextToken);
      return keys;
    } catch (err: any) {
      this.logger.warn(`Error listing secrets: ${err.message}`);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.send(new ListSecretsCommand({ MaxResults: 1 }));
      return true;
    } catch {
      return false;
    }
  }
}
