import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ProcessManagerService } from './process-manager.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface ServiceActionDto {
  action: 'start' | 'stop';
}

@Controller('api/process-manager')
export class ProcessManagerController {
  constructor(private readonly processManagerService: ProcessManagerService) {}

  /**
   * Check if backend/.env contains API keys, making secrets-manager optional.
   */
  private envHasApiKeys(): boolean {
    try {
      const envPath = join(__dirname, '..', '..', '.env');
      if (!existsSync(envPath)) return false;
      const content = readFileSync(envPath, 'utf8');
      return /^ANTHROPIC_API_KEY=.+/m.test(content) || /^OPENAI_API_KEY=.+/m.test(content);
    } catch {
      return false;
    }
  }

  /**
   * Check if a cloud vault provider (Azure Key Vault, AWS) is configured,
   * making the local secrets-manager (OpenBao) unnecessary.
   */
  private usesCloudVault(): boolean {
    if (process.env.CLAUDE_CODE_USE_FOUNDRY) return true;
    const provider = process.env.SECRET_VAULT_PROVIDER || 'openbao';
    return provider === 'azure-keyvault' || provider === 'aws';
  }

  private getRequiredServices(): string[] {
    const services = ['oauth-server'];
    if (!this.envHasApiKeys() && !this.usesCloudVault()) {
      services.unshift('secrets-manager');
    }
    return services;
  }

  /**
   * GET /api/process-manager/health/required
   * Public endpoint: checks if required services are running.
   * Secrets-manager is only required when backend/.env lacks API keys.
   */
  @Public()
  @Get('health/required')
  async checkRequiredServices() {
    const requiredServices = this.getRequiredServices();
    const results = await Promise.all(
      requiredServices.map(async (name) => ({
        name,
        ...(await this.processManagerService.getServiceStatus(name)),
      })),
    );
    const allRunning = results.every((r) => r.status === 'running');
    return { ok: allRunning, services: results };
  }

  /**
   * POST /api/process-manager/start-required
   * Public endpoint: starts required services.
   * Secrets-manager is only started when backend/.env lacks API keys.
   */
  @Public()
  @Post('start-required')
  async startRequiredServices() {
    const requiredServices = this.getRequiredServices();
    const results = await Promise.all(
      requiredServices.map((name) =>
        this.processManagerService.startService(name),
      ),
    );
    return { results };
  }

  /**
   * GET /api/process-manager
   * Lists all available services
   */
  @Get()
  async listServices() {
    const services = await this.processManagerService.listServices();
    return { services };
  }

  /**
   * GET /api/process-manager/:serviceName
   * Returns the status of a specific service
   */
  @Get(':serviceName')
  async getServiceStatus(@Param('serviceName') serviceName: string) {
    return this.processManagerService.getServiceStatus(serviceName);
  }

  /**
   * POST /api/process-manager/:serviceName
   * Starts or stops a service based on the action in the request body
   * Body: { action: 'start' | 'stop' }
   */
  @Roles('user')
  @Post(':serviceName')
  async controlService(
    @Param('serviceName') serviceName: string,
    @Body() body: ServiceActionDto
  ) {
    if (body.action === 'start') {
      return this.processManagerService.startService(serviceName);
    } else if (body.action === 'stop') {
      return this.processManagerService.stopService(serviceName);
    } else {
      return { success: false, message: `Invalid action: ${body.action}. Use 'start' or 'stop'.` };
    }
  }
}
