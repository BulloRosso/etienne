import { MessageEvent, Usage } from '../types';

/**
 * Transform Agent SDK messages to the existing MessageEvent format
 * This maintains backward compatibility with the frontend
 */
export class SdkMessageTransformer {
  /**
   * Transform any SDK message to MessageEvent format
   */
  static transform(sdkMessage: any): MessageEvent | null {
    switch (sdkMessage.type) {
      case 'system':
        return this.transformSystemMessage(sdkMessage);

      case 'assistant':
        return this.transformAssistantMessage(sdkMessage);

      case 'result':
        return this.transformResultMessage(sdkMessage);

      case 'tool_use':
      case 'tool_result':
        return this.transformToolMessage(sdkMessage);

      default:
        // Pass through unknown types as-is
        return {
          type: sdkMessage.type as any,
          data: sdkMessage
        };
    }
  }

  /**
   * Transform system initialization message
   */
  private static transformSystemMessage(sdkMessage: any): MessageEvent | null {
    if (sdkMessage.subtype === 'init') {
      return {
        type: 'session',
        data: {
          session_id: sdkMessage.session_id,
          process_id: `sdk_${sdkMessage.session_id}`, // Synthetic process ID
          model: sdkMessage.model
        }
      };
    }
    return null;
  }

  /**
   * Transform assistant message (text/tool calls)
   */
  private static transformAssistantMessage(sdkMessage: any): MessageEvent {
    const text = this.extractTextFromContent(sdkMessage.content);

    return {
      type: 'stdout',
      data: {
        chunk: text
      }
    };
  }

  /**
   * Transform result message (completion/error)
   */
  private static transformResultMessage(sdkMessage: any): MessageEvent {
    if (sdkMessage.subtype === 'success') {
      const usage: Usage = {
        input_tokens: sdkMessage.usage?.input_tokens,
        output_tokens: sdkMessage.usage?.output_tokens,
        total_tokens: (sdkMessage.usage?.input_tokens || 0) + (sdkMessage.usage?.output_tokens || 0),
        model: sdkMessage.usage?.model
      };

      return {
        type: 'completed',
        data: {
          exitCode: 0,
          usage
        }
      };
    } else if (sdkMessage.subtype === 'error_max_turns') {
      return {
        type: 'error',
        data: {
          message: 'Maximum turns exceeded'
        }
      };
    } else if (sdkMessage.subtype === 'error') {
      return {
        type: 'error',
        data: {
          message: sdkMessage.error || 'Unknown error'
        }
      };
    }

    return {
      type: 'error',
      data: {
        message: `Unexpected result subtype: ${sdkMessage.subtype}`
      }
    };
  }

  /**
   * Transform tool usage messages
   */
  private static transformToolMessage(sdkMessage: any): MessageEvent {
    return {
      type: 'tool_call',
      data: {
        toolName: sdkMessage.name,
        status: sdkMessage.type === 'tool_use' ? 'running' : 'complete',
        callId: sdkMessage.id || `tool_${Date.now()}`
      }
    };
  }

  /**
   * Extract text content from SDK content blocks
   */
  private static extractTextFromContent(content: any[]): string {
    console.log('[extractTextFromContent] content:', JSON.stringify(content));

    if (!Array.isArray(content)) {
      // Sometimes content might be a string directly
      if (typeof content === 'string') {
        return content;
      }
      console.log('[extractTextFromContent] content is not array, returning empty');
      return '';
    }

    let text = '';
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        text += block.text;
      } else if (typeof block === 'string') {
        // Handle case where block is just a string
        text += block;
      }
      // Note: tool_use blocks are now handled separately in the orchestrator
    }
    console.log('[extractTextFromContent] extracted text:', text);
    return text;
  }

  /**
   * Extract usage information from result message
   */
  static extractUsage(sdkMessage: any): Usage | null {
    if (sdkMessage.type === 'result' && sdkMessage.subtype === 'success' && sdkMessage.usage) {
      return {
        input_tokens: sdkMessage.usage.input_tokens,
        output_tokens: sdkMessage.usage.output_tokens,
        total_tokens: (sdkMessage.usage.input_tokens || 0) + (sdkMessage.usage.output_tokens || 0),
        model: sdkMessage.usage.model
      };
    }
    return null;
  }

  /**
   * Check if message contains session initialization
   */
  static isSessionInit(sdkMessage: any): boolean {
    return sdkMessage.type === 'system' && sdkMessage.subtype === 'init';
  }

  /**
   * Check if message is a result (completion)
   */
  static isResult(sdkMessage: any): boolean {
    return sdkMessage.type === 'result';
  }

  /**
   * Check if message is an assistant message
   */
  static isAssistant(sdkMessage: any): boolean {
    return sdkMessage.type === 'assistant';
  }
}
