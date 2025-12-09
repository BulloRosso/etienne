import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';

interface ConfigurationDto {
  ANTHROPIC_API_KEY?: string;
  WORKSPACE_ROOT?: string;
  CHECKPOINT_PROVIDER?: string;
  GITEA_URL?: string;
  GITEA_USERNAME?: string;
  GITEA_PASSWORD?: string;
  GITEA_REPO?: string;
  IMAP_CONNECTION?: string;
  SMTP_CONNECTION?: string;
  SMTP_WHITELIST?: string;
  COSTS_CURRENCY_UNIT?: string;
  COSTS_PER_MIO_INPUT_TOKENS?: string;
  COSTS_PER_MIO_OUTPUT_TOKENS?: string;
  MEMORY_MANAGEMENT_URL?: string;
  MEMORY_DECAY_DAYS?: string;
  [key: string]: string | undefined;
}

@Controller('api/configuration')
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  /**
   * GET /api/configuration
   * Returns the current configuration from .env file
   * Returns 404 if .env does not exist
   */
  @Get()
  async getConfiguration(): Promise<ConfigurationDto> {
    const config = await this.configurationService.getConfiguration();

    if (config === null) {
      throw new HttpException('Configuration not found', HttpStatus.NOT_FOUND);
    }

    return config;
  }

  /**
   * POST /api/configuration
   * Saves configuration to .env file and exports to environment
   */
  @Post()
  async saveConfiguration(@Body() config: ConfigurationDto): Promise<{ success: boolean; message: string }> {
    try {
      await this.configurationService.saveConfiguration(config);
      return {
        success: true,
        message: 'Configuration saved successfully'
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to save configuration: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
