import { Injectable } from '@nestjs/common';
import { ISecretProvider } from '../secret-provider.interface';

/**
 * Fallback provider that reads secrets from process.env.
 * Always available — used when the vault is not running.
 */
@Injectable()
export class EnvProvider implements ISecretProvider {
  async get(key: string): Promise<string | null> {
    return process.env[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    process.env[key] = value;
  }

  async delete(key: string): Promise<void> {
    delete process.env[key];
  }

  async list(): Promise<string[]> {
    return Object.keys(process.env);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
