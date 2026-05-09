import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';

export type ModelTier = 'small' | 'regular';
export type LlmProvider = 'anthropic' | 'openai' | 'deepseek';

const DEEPSEEK_ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';

/**
 * Decide which provider this service should use. Honours `CODING_AGENT` for
 * `anthropic`/`openai`, plus the OpenCode + DeepSeek combo (`CODING_AGENT=open-code`
 * with `OPENCODE_PROVIDER=deepseek`) so background LLM calls inherit the
 * coding-agent's model choice automatically.
 */
function resolveLlmProvider(): LlmProvider {
  const coding = (process.env.CODING_AGENT || 'anthropic').toLowerCase();
  if (coding === 'openai' || coding === 'openai-agents') return 'openai';
  if (coding === 'open-code') {
    const openCodeProvider = (process.env.OPENCODE_PROVIDER || 'anthropic').toLowerCase();
    if (openCodeProvider === 'deepseek') return 'deepseek';
    if (openCodeProvider === 'openai' || openCodeProvider === 'openai-compatible') return 'openai';
    return 'anthropic';
  }
  return 'anthropic';
}

@Injectable()
export class LlmService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LlmService.name);
  private readonly provider: LlmProvider;
  private readonly models: { small: string; regular: string };
  private providerInstance: ReturnType<typeof createAnthropic> | ReturnType<typeof createOpenAI>;
  private managedIdentityToken: string | null = null;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly secretsManager: SecretsManagerService,
    @Optional() private readonly budgetMonitoringService?: BudgetMonitoringService,
  ) {
    this.provider = resolveLlmProvider();

    if (this.provider === 'openai') {
      const modelStr = process.env.OPENAI_MODELS || 'gpt-5-mini,gpt-5.2';
      const [small, regular] = modelStr.split(',');
      this.models = { small, regular };
      this.providerInstance = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else if (this.provider === 'deepseek') {
      // DeepSeek exposes an Anthropic-compatible endpoint at /anthropic, so we
      // can reuse the Anthropic SDK with a custom baseURL + key. Tool use,
      // system prompts, etc. travel on the Anthropic wire format unchanged.
      const modelStr = process.env.DEEPSEEK_MODELS || 'deepseek-v4-flash,deepseek-v4-pro';
      const [small, regular] = modelStr.split(',');
      this.models = { small, regular };
      this.providerInstance = createAnthropic({
        baseURL: DEEPSEEK_ANTHROPIC_BASE_URL,
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
    } else {
      const modelStr = process.env.ANTHROPIC_MODELS || 'claude-haiku-4-5,claude-sonnet-4-6';
      const [small, regular] = modelStr.split(',');
      this.models = { small, regular };
      this.providerInstance = this.createAnthropicProvider(
        process.env.ANTHROPIC_FOUNDRY_RESOURCE,
        process.env.ANTHROPIC_FOUNDRY_API_KEY,
        process.env.ANTHROPIC_API_KEY,
      );
    }

    this.logger.log(`LLM provider: ${this.provider}, models: ${JSON.stringify(this.models)}`);
  }

  private createAnthropicProvider(
    foundryResource?: string,
    foundryApiKey?: string,
    directApiKey?: string,
  ): ReturnType<typeof createAnthropic> {
    // Path 1: Foundry hosted agent — managed identity via DefaultAzureCredential
    if (process.env.AZURE_FOUNDRY_AGENT_ID && this.managedIdentityToken) {
      const endpoint = process.env.AZURE_AI_ENDPOINT || foundryResource;
      const baseURL = endpoint?.startsWith('http')
        ? endpoint.replace(/\/messages$/, '')
        : `https://${endpoint}.services.ai.azure.com/anthropic/v1`;
      this.logger.log(`Using Foundry managed identity endpoint: ${baseURL}`);
      return createAnthropic({
        baseURL,
        apiKey: 'unused',
        headers: { Authorization: `Bearer ${this.managedIdentityToken}` },
      });
    }

    // Path 2: Azure AI Services with static API key
    if (process.env.CLAUDE_CODE_USE_FOUNDRY && foundryResource && foundryApiKey) {
      const baseURL = foundryResource.startsWith('http')
        ? foundryResource.replace(/\/messages$/, '')
        : `https://${foundryResource}.services.ai.azure.com/anthropic/v1`;
      this.logger.log(`Using Foundry endpoint: ${baseURL}`);
      return createAnthropic({
        baseURL,
        apiKey: 'unused',
        headers: { Authorization: `Bearer ${foundryApiKey}` },
      });
    }

    // Path 3: Direct Anthropic API
    return createAnthropic({ apiKey: directApiKey });
  }

  async onModuleInit() {
    // Re-initialize provider with secrets from vault.
    // SecretsManagerService.onModuleInit runs first (NestJS dependency order) and
    // has already written ANTHROPIC_FOUNDRY_API_KEY into process.env when applicable.
    if (this.provider === 'openai') {
      const key = await this.secretsManager.getSecret('OPENAI_API_KEY');
      if (key) this.providerInstance = createOpenAI({ apiKey: key });
    } else if (this.provider === 'deepseek') {
      const key = await this.secretsManager.getSecret('DEEPSEEK_API_KEY')
        || process.env.DEEPSEEK_API_KEY;
      if (key) {
        this.providerInstance = createAnthropic({
          baseURL: DEEPSEEK_ANTHROPIC_BASE_URL,
          apiKey: key,
        });
      }
    } else if (process.env.AZURE_FOUNDRY_AGENT_ID) {
      // Foundry hosted agent — acquire token via managed identity
      await this.acquireManagedIdentityToken();
      this.providerInstance = this.createAnthropicProvider(
        process.env.ANTHROPIC_FOUNDRY_RESOURCE,
      );
      // Refresh the token periodically (tokens expire after ~1 hour).
      // Track the handle so OnModuleDestroy can clear it on shutdown / hot reload.
      this.tokenRefreshInterval = setInterval(() => this.acquireManagedIdentityToken().then(() => {
        this.providerInstance = this.createAnthropicProvider(
          process.env.ANTHROPIC_FOUNDRY_RESOURCE,
        );
      }).catch(e => this.logger.warn(`Token refresh failed: ${e.message}`)),
        45 * 60 * 1000, // every 45 minutes
      );
    } else if (process.env.CLAUDE_CODE_USE_FOUNDRY) {
      const foundryResource = process.env.ANTHROPIC_FOUNDRY_RESOURCE;
      const foundryApiKey = process.env.ANTHROPIC_FOUNDRY_API_KEY
        || (await this.secretsManager.getSecret('ANTHROPIC_FOUNDRY_API_KEY') ?? undefined);
      if (!foundryApiKey) {
        this.logger.warn('CLAUDE_CODE_USE_FOUNDRY is set but ANTHROPIC_FOUNDRY_API_KEY could not be resolved');
      }
      this.providerInstance = this.createAnthropicProvider(foundryResource, foundryApiKey);
    } else {
      const directApiKey = await this.secretsManager.getSecret('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;
      this.providerInstance = this.createAnthropicProvider(undefined, undefined, directApiKey);
    }
  }

  onModuleDestroy() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
  }

  private async acquireManagedIdentityToken(): Promise<void> {
    try {
      const { DefaultAzureCredential } = await import('@azure/identity');
      const credential = new DefaultAzureCredential();
      const result = await credential.getToken('https://cognitiveservices.azure.com/.default');
      this.managedIdentityToken = result.token;
      // Make token available to Claude SDK subprocess via env passthrough
      process.env._FOUNDRY_MODEL_TOKEN = result.token;
      this.logger.log('Acquired managed identity token for Cognitive Services');
    } catch (err: any) {
      this.logger.error(`Failed to acquire managed identity token: ${err.message}`);
    }
  }

  private trackUsage(usage: { inputTokens?: number; outputTokens?: number }, projectDir?: string): void {
    if (projectDir && this.budgetMonitoringService && (usage.inputTokens || usage.outputTokens)) {
      this.budgetMonitoringService
        .trackCosts(projectDir, usage.inputTokens ?? 0, usage.outputTokens ?? 0)
        .catch((err) => this.logger.warn(`Failed to track LLM costs for ${projectDir}: ${err.message}`));
    }
  }

  async generateText(opts: {
    tier: ModelTier;
    prompt: string;
    maxOutputTokens?: number;
    projectDir?: string;
  }): Promise<string> {
    const modelId = this.models[opts.tier];
    const result = await generateText({
      model: this.providerInstance(modelId),
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      prompt: opts.prompt,
    });
    this.trackUsage(result.usage, opts.projectDir);
    return result.text;
  }

  async generateTextWithMessages(opts: {
    tier: ModelTier;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>;
    maxOutputTokens?: number;
    projectDir?: string;
  }): Promise<string> {
    const modelId = this.models[opts.tier];
    const result = await generateText({
      model: this.providerInstance(modelId),
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      messages: opts.messages,
    });
    this.trackUsage(result.usage, opts.projectDir);
    return result.text;
  }

  getProvider(): string {
    return this.provider;
  }

  getModelId(tier: ModelTier): string {
    return this.models[tier];
  }

  async hasApiKey(): Promise<boolean> {
    if (this.provider === 'openai') {
      const key = await this.secretsManager.getSecret('OPENAI_API_KEY');
      return !!key;
    }
    if (this.provider === 'deepseek') {
      const key = (await this.secretsManager.getSecret('DEEPSEEK_API_KEY'))
        || process.env.DEEPSEEK_API_KEY;
      return !!key;
    }
    if (process.env.AZURE_FOUNDRY_AGENT_ID) {
      return !!this.managedIdentityToken;
    }
    if (process.env.CLAUDE_CODE_USE_FOUNDRY) {
      const foundryKey = process.env.ANTHROPIC_FOUNDRY_API_KEY
        || await this.secretsManager.getSecret('ANTHROPIC_FOUNDRY_API_KEY');
      return !!foundryKey;
    }
    const key = await this.secretsManager.getSecret('ANTHROPIC_API_KEY');
    return !!key;
  }

  /** Env var name expected for the active provider (used for human-readable error messages). */
  getKeyEnvName(): string {
    if (this.provider === 'openai') return 'OPENAI_API_KEY';
    if (this.provider === 'deepseek') return 'DEEPSEEK_API_KEY';
    if (process.env.CLAUDE_CODE_USE_FOUNDRY) return 'ANTHROPIC_FOUNDRY_API_KEY';
    return 'ANTHROPIC_API_KEY';
  }
}
