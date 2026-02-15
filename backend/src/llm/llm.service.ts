import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

export type ModelTier = 'small' | 'regular';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly provider: 'anthropic' | 'openai';
  private readonly models: { small: string; regular: string };
  private readonly providerInstance: ReturnType<typeof createAnthropic> | ReturnType<typeof createOpenAI>;

  constructor() {
    this.provider = (process.env.CODING_AGENT || 'anthropic') as 'anthropic' | 'openai';

    if (this.provider === 'openai') {
      const modelStr = process.env.OPENAI_MODELS || 'gpt-5-mini,gpt-5.2';
      const [small, regular] = modelStr.split(',');
      this.models = { small, regular };
      this.providerInstance = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
      const modelStr = process.env.ANTHROPIC_MODELS || 'claude-haiku-4-5-20251001,claude-sonnet-4-5-20250929';
      const [small, regular] = modelStr.split(',');
      this.models = { small, regular };
      this.providerInstance = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    this.logger.log(`LLM provider: ${this.provider}, models: ${JSON.stringify(this.models)}`);
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

  hasApiKey(): boolean {
    if (this.provider === 'openai') {
      return !!process.env.OPENAI_API_KEY;
    }
    return !!process.env.ANTHROPIC_API_KEY;
  }
}
