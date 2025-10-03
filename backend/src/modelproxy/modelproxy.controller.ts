import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ModelProxyService } from './modelproxy.service';
import { AnthropicMessagesRequest, AnthropicMessagesResponse } from './types/anthropic.types';

@Controller('api/modelproxy')
export class ModelProxyController {
  private readonly logger = new Logger(ModelProxyController.name);

  constructor(private readonly proxyService: ModelProxyService) {}

  @Post('v1/messages')
  async createMessage(@Body() request: AnthropicMessagesRequest): Promise<AnthropicMessagesResponse> {
    try {
      return await this.proxyService.proxyRequest(request);
    } catch (error) {
      this.logger.error(`Proxy failed: ${error.message}`);
      throw error;
    }
  }
}
