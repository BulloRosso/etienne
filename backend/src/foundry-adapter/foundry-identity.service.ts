import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Manages the Foundry agent's Entra identity for authenticating to
 * Azure AI Services (Claude models) and the Toolbox MCP endpoint.
 *
 * When running inside a Foundry hosted-agent microVM, the agent gets
 * a Microsoft Entra Agent ID (service principal) automatically.
 * `DefaultAzureCredential` picks up this managed identity without
 * any client secret or certificate.
 */
@Injectable()
export class FoundryIdentityService implements OnModuleInit {
  private readonly logger = new Logger(FoundryIdentityService.name);

  /** Lazy-loaded @azure/identity module. */
  private credential: any = null;

  /** Cached tokens keyed by scope. */
  private tokenCache = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  /** Cache buffer — refresh 5 minutes before expiry. */
  private static readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  async onModuleInit() {
    if (!process.env.AZURE_FOUNDRY_AGENT_ID) {
      this.logger.log(
        'AZURE_FOUNDRY_AGENT_ID not set — Foundry identity disabled',
      );
      return;
    }

    try {
      const { DefaultAzureCredential } = await import('@azure/identity');
      this.credential = new DefaultAzureCredential();
      this.logger.log(
        `Foundry identity initialized (agent ID: ${process.env.AZURE_FOUNDRY_AGENT_ID})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `@azure/identity not available — Foundry identity disabled: ${err.message}`,
      );
    }
  }

  /** Whether Foundry managed identity is active. */
  get isAvailable(): boolean {
    return this.credential !== null;
  }

  /**
   * Get a bearer token for the Azure Cognitive Services scope.
   * Used to authenticate to Foundry-hosted Claude models.
   */
  async getModelToken(): Promise<string> {
    return this.getToken('https://cognitiveservices.azure.com/.default');
  }

  /**
   * Get a bearer token for the Foundry Toolbox MCP endpoint.
   */
  async getToolboxToken(): Promise<string> {
    return this.getToken('https://management.azure.com/.default');
  }

  private async getToken(scope: string): Promise<string> {
    if (!this.credential) {
      throw new Error('Foundry identity not initialized');
    }

    const cached = this.tokenCache.get(scope);
    if (
      cached &&
      cached.expiresAt > Date.now() + FoundryIdentityService.REFRESH_BUFFER_MS
    ) {
      return cached.token;
    }

    const result = await this.credential.getToken(scope);
    this.tokenCache.set(scope, {
      token: result.token,
      expiresAt: result.expiresOnTimestamp,
    });
    return result.token;
  }
}
