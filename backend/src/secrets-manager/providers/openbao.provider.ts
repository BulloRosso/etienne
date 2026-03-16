import { Injectable, Logger } from '@nestjs/common';
import { ISecretProvider } from '../secret-provider.interface';

@Injectable()
export class OpenBaoProvider implements ISecretProvider {
  private readonly logger = new Logger(OpenBaoProvider.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    this.baseUrl = process.env.OPENBAO_ADDR || 'http://127.0.0.1:8200';
    this.token = process.env.OPENBAO_DEV_ROOT_TOKEN || 'dev-root-token';
  }

  async get(key: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/secret/data/${key}`, {
        headers: { 'X-Vault-Token': this.token },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        this.logger.warn(`Failed to get secret ${key}: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        data?: { data?: { value?: string } };
      };
      return data?.data?.data?.value ?? null;
    } catch (err) {
      this.logger.warn(`Error getting secret ${key}: ${err}`);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/secret/data/${key}`, {
      method: 'POST',
      headers: {
        'X-Vault-Token': this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { value } }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to set secret ${key}: ${response.status} ${body}`);
    }
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/v1/secret/metadata/${key}`,
      {
        method: 'DELETE',
        headers: { 'X-Vault-Token': this.token },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete secret ${key}: ${response.status}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1/secret/metadata?list=true`,
        {
          headers: { 'X-Vault-Token': this.token },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        if (response.status === 404) return [];
        return [];
      }

      const data = (await response.json()) as {
        data?: { keys?: string[] };
      };
      return data?.data?.keys ?? [];
    } catch (err) {
      this.logger.warn(`Error listing secrets: ${err}`);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sys/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok || response.status === 200 || response.status === 501;
    } catch {
      return false;
    }
  }
}
