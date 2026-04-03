import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { SecretsManagerService } from '../secrets-manager/secrets-manager.service';

export type ModelTier = 'small' | 'regular';

@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private readonly provider: 'anthropic' | 'openai';
  private readonly models: { small: string; regular: string };
  private providerInstance: ReturnType<typeof createAnthropic> | ReturnType<typeof createOpenAI>;

  constructor(private readonly secretsManager: SecretsManagerService) {
    this.provider = (process.env.CODING_AGENT || 'anthropic') as 'anthropic' | 'openai';

    if (this.provider === 'openai') {
      const modelStr = process.env.OPENAI_MODELS || 'gpt-5-mini,gpt-5.2';
      const [small, regular] = modelStr.split(',');
      this.models = { small, regular };
      this.providerInstance = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    return createAnthropic({ apiKey: directApiKey });
  }

  async onModuleInit() {
    // Re-initialize provider with secrets from vault.
    // SecretsManagerService.onModuleInit runs first (NestJS dependency order) and
    // has already written ANTHROPIC_FOUNDRY_API_KEY into process.env when applicable.
    if (this.provider === 'openai') {
      const key = await this.secretsManager.getSecret('OPENAI_API_KEY');
      if (key) this.providerInstance = createOpenAI({ apiKey: key });
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

  async generateText(opts: {
    tier: ModelTier;
    prompt: string;
    maxOutputTokens?: number;
  }): Promise<string> {
    const modelId = this.models[opts.tier];
    const result = await generateText({
      model: this.providerInstance(modelId),
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      prompt: opts.prompt,
    });
    return result.text;
  }

  async generateTextWithMessages(opts: {
    tier: ModelTier;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>;
    maxOutputTokens?: number;
  }): Promise<string> {
    const modelId = this.models[opts.tier];
    const result = await generateText({
      model: this.providerInstance(modelId),
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      messages: opts.messages,
    });
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
    if (process.env.CLAUDE_CODE_USE_FOUNDRY) {
      const foundryKey = process.env.ANTHROPIC_FOUNDRY_API_KEY
        || await this.secretsManager.getSecret('ANTHROPIC_FOUNDRY_API_KEY');
      return !!foundryKey;
    }
    const key = await this.secretsManager.getSecret('ANTHROPIC_API_KEY');
    return !!key;
  }
}
