import { Injectable, Logger } from '@nestjs/common';
import {
  AnthropicMessage,
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  AnthropicTool,
  AnthropicToolChoice,
  AnthropicUsage,
  ContentBlock,
  ContentBlockText,
  ContentBlockToolResult,
  ContentBlockToolUse,
} from './types/anthropic.types';

@Injectable()
export class ModelProxyService {
  private readonly logger = new Logger(ModelProxyService.name);
  private readonly openaiApiKey: string;
  private readonly openaiBaseUrl: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  /**
   * Converts Anthropic messages to OpenAI format
   */
  convertAnthropicToOpenAIMessages(
    anthropicMessages: AnthropicMessage[],
    systemPrompt?: string | Array<{ type: 'text'; text: string }>,
  ): any[] {
    const openaiMessages: any[] = [];

    // Handle system prompt
    let systemText = '';
    if (typeof systemPrompt === 'string') {
      systemText = systemPrompt;
    } else if (Array.isArray(systemPrompt)) {
      systemText = systemPrompt
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    }

    if (systemText) {
      openaiMessages.push({ role: 'system', content: systemText });
    }

    // Convert messages
    for (const msg of anthropicMessages) {
      const role = msg.role;
      const content = msg.content;

      if (typeof content === 'string') {
        openaiMessages.push({ role, content });
        continue;
      }

      if (Array.isArray(content)) {
        const userParts: any[] = [];
        const assistantToolCalls: any[] = [];
        const assistantTextParts: string[] = [];

        for (const block of content) {
          if (block.type === 'text') {
            const textBlock = block as ContentBlockText;
            if (role === 'user') {
              userParts.push({ type: 'text', text: textBlock.text });
            } else if (role === 'assistant') {
              assistantTextParts.push(textBlock.text);
            }
          } else if (block.type === 'image' && role === 'user') {
            const imageBlock = block as any;
            if (imageBlock.source.type === 'base64') {
              userParts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${imageBlock.source.media_type};base64,${imageBlock.source.data}`,
                },
              });
            }
          } else if (block.type === 'tool_use' && role === 'assistant') {
            const toolBlock = block as ContentBlockToolUse;
            assistantToolCalls.push({
              id: toolBlock.id,
              type: 'function',
              function: {
                name: toolBlock.name,
                arguments: JSON.stringify(toolBlock.input),
              },
            });
          } else if (block.type === 'tool_result' && role === 'user') {
            const toolResultBlock = block as ContentBlockToolResult;
            let serializedContent = '';
            if (typeof toolResultBlock.content === 'string') {
              serializedContent = toolResultBlock.content;
            } else {
              serializedContent = JSON.stringify(toolResultBlock.content);
            }
            openaiMessages.push({
              role: 'tool',
              tool_call_id: toolResultBlock.tool_use_id,
              content: serializedContent,
            });
          }
        }

        // Add user message if there are parts
        if (role === 'user' && userParts.length > 0) {
          if (userParts.length === 1 && userParts[0].type === 'text') {
            openaiMessages.push({ role: 'user', content: userParts[0].text });
          } else {
            openaiMessages.push({ role: 'user', content: userParts });
          }
        }

        // Add assistant message
        if (role === 'assistant') {
          const assistantText = assistantTextParts.join('\n');
          if (assistantText) {
            openaiMessages.push({ role: 'assistant', content: assistantText });
          }
          if (assistantToolCalls.length > 0) {
            openaiMessages.push({
              role: 'assistant',
              content: null,
              tool_calls: assistantToolCalls,
            });
          }
        }
      }
    }

    return openaiMessages;
  }

  /**
   * Converts Anthropic tools to OpenAI format
   */
  convertAnthropicToolsToOpenAI(anthropicTools?: AnthropicTool[]): any[] | undefined {
    if (!anthropicTools || anthropicTools.length === 0) {
      return undefined;
    }

    return anthropicTools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema,
      },
    }));
  }

  /**
   * Converts Anthropic tool choice to OpenAI format
   */
  convertAnthropicToolChoiceToOpenAI(
    anthropicChoice?: AnthropicToolChoice,
  ): string | { type: string; function: { name: string } } | undefined {
    if (!anthropicChoice) {
      return undefined;
    }

    if (anthropicChoice.type === 'auto' || anthropicChoice.type === 'any') {
      return 'auto';
    }

    if (anthropicChoice.type === 'tool' && anthropicChoice.name) {
      return {
        type: 'function',
        function: { name: anthropicChoice.name },
      };
    }

    return 'auto';
  }

  /**
   * Converts OpenAI response to Anthropic format
   */
  convertOpenAIToAnthropicResponse(
    openaiResponse: any,
    originalModel: string,
    requestId: string,
  ): AnthropicMessagesResponse {
    const anthropicContent: ContentBlock[] = [];
    let anthropicStopReason: any = 'end_turn';

    const stopReasonMap: Record<string, any> = {
      stop: 'end_turn',
      length: 'max_tokens',
      tool_calls: 'tool_use',
      function_call: 'tool_use',
      content_filter: 'stop_sequence',
    };

    if (openaiResponse.choices && openaiResponse.choices.length > 0) {
      const choice = openaiResponse.choices[0];
      const message = choice.message;
      const finishReason = choice.finish_reason;

      anthropicStopReason = stopReasonMap[finishReason] || 'end_turn';

      // Add text content
      if (message.content) {
        anthropicContent.push({
          type: 'text',
          text: message.content,
        });
      }

      // Add tool calls
      if (message.tool_calls) {
        for (const call of message.tool_calls) {
          if (call.type === 'function') {
            let toolInput: Record<string, any> = {};
            try {
              toolInput = JSON.parse(call.function.arguments);
            } catch (e) {
              this.logger.warn(`Failed to parse tool arguments: ${e}`);
              toolInput = { error_parsing_arguments: call.function.arguments };
            }

            anthropicContent.push({
              type: 'tool_use',
              id: call.id,
              name: call.function.name,
              input: toolInput,
            });
          }
        }
        if (finishReason === 'tool_calls') {
          anthropicStopReason = 'tool_use';
        }
      }
    }

    // Ensure at least one content block
    if (anthropicContent.length === 0) {
      anthropicContent.push({ type: 'text', text: '' });
    }

    const usage = openaiResponse.usage || {};
    const anthropicUsage: AnthropicUsage = {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    };

    const responseId = openaiResponse.id ? `msg_${openaiResponse.id}` : `msg_${requestId}`;

    return {
      id: responseId,
      type: 'message',
      role: 'assistant',
      model: originalModel,
      content: anthropicContent,
      stop_reason: anthropicStopReason,
      usage: anthropicUsage,
    };
  }

  /**
   * Proxies Anthropic request to OpenAI
   */
  async proxyRequest(request: AnthropicMessagesRequest): Promise<AnthropicMessagesResponse> {
    const requestId = Math.random().toString(36).substring(7);
    const targetModel = process.env.ANTHROPIC_MODEL || 'gpt-4o-mini';

    this.logger.log(`[${requestId}] 1/4 Request received - Model: ${request.model} → ${targetModel}`);

    // Convert Anthropic request to OpenAI format
    const openaiMessages = this.convertAnthropicToOpenAIMessages(
      request.messages,
      request.system,
    );
    const openaiTools = this.convertAnthropicToolsToOpenAI(request.tools);
    const openaiToolChoice = this.convertAnthropicToolChoiceToOpenAI(request.tool_choice);

    this.logger.log(`[${requestId}] 2/4 Format conversion complete - Messages: ${openaiMessages.length}, Tools: ${openaiTools?.length || 0}`);

    // Build OpenAI request
    const openaiRequest: any = {
      model: targetModel,
      messages: openaiMessages,
      max_tokens: request.max_tokens,
      stream: false,
    };

    if (request.temperature !== undefined) {
      openaiRequest.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      openaiRequest.top_p = request.top_p;
    }
    if (request.stop_sequences) {
      openaiRequest.stop = request.stop_sequences;
    }
    if (openaiTools) {
      openaiRequest.tools = openaiTools;
    }
    if (openaiToolChoice) {
      openaiRequest.tool_choice = openaiToolChoice;
    }

    // Call OpenAI API
    this.logger.log(`[${requestId}] 3/4 Calling OpenAI API...`);
    const startTime = Date.now();

    const response = await fetch(`${this.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify(openaiRequest),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`[${requestId}] ❌ OpenAI API error: ${response.status} - ${errorBody.substring(0, 200)}`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const openaiResponse = await response.json();

    // Convert OpenAI response to Anthropic format
    const anthropicResponse = this.convertOpenAIToAnthropicResponse(
      openaiResponse,
      request.model,
      requestId,
    );

    this.logger.log(`[${requestId}] 4/4 ✓ Complete - Duration: ${duration}ms, Tokens: ${anthropicResponse.usage.input_tokens}+${anthropicResponse.usage.output_tokens}=${anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens}`);

    return anthropicResponse;
  }
}
