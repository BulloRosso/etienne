import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { ConfigurationService } from './configuration.service';
import * as serviceEnvMappings from './service-env-mappings.json';

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
   * GET /api/configuration/vault-info
   * Public endpoint: returns the effective vault provider type so the frontend
   * can decide whether to show the API key prompt and require OpenBao.
   */
  @Public()
  @Get('vault-info')
  getVaultInfo() {
    const useFoundry = !!process.env.CLAUDE_CODE_USE_FOUNDRY;
    const provider = useFoundry
      ? 'azure-keyvault'
      : process.env.SECRET_VAULT_PROVIDER || 'openbao';
    const isCloudVault = provider === 'azure-keyvault' || provider === 'aws';
    return { provider, isCloudVault, useFoundry };
  }

  /**
   * GET /api/configuration/service-env-mappings
   * Returns the mapping of service names to the backend .env vars they use.
   * Services not present in the map have no backend .env settings.
   */
  @Public()
  @Get('service-env-mappings')
  getServiceEnvMappings() {
    return serviceEnvMappings;
  }

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
  @Roles('admin')
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
