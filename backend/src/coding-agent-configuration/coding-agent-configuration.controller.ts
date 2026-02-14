import { Controller, Get, Post, Delete, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { CodingAgentConfigurationService } from './coding-agent-configuration.service';

@Controller('api/coding-agent-configuration')
export class CodingAgentConfigurationController {
  constructor(private readonly service: CodingAgentConfigurationService) {}

  @Get(':agentType')
  async getConfig(@Param('agentType') agentType: string) {
    if (!['anthropic', 'openai'].includes(agentType)) {
      throw new HttpException(
        { success: false, message: 'Invalid agent type. Must be "anthropic" or "openai".' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const result = await this.service.getConfig(agentType);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':agentType')
  async saveConfig(
    @Param('agentType') agentType: string,
    @Body() body: { content: string },
  ) {
    if (!['anthropic', 'openai'].includes(agentType)) {
      throw new HttpException(
        { success: false, message: 'Invalid agent type.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.service.saveConfig(agentType, body.content);
      return { success: true, message: 'Configuration saved' };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':agentType')
  async deleteConfig(@Param('agentType') agentType: string) {
    if (!['anthropic', 'openai'].includes(agentType)) {
      throw new HttpException(
        { success: false, message: 'Invalid agent type.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.service.deleteConfig(agentType);
      return { success: true, message: 'Custom configuration removed, defaults restored' };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
