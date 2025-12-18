import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ProcessManagerService } from './process-manager.service';

interface ServiceActionDto {
  action: 'start' | 'stop';
}

@Controller('api/process-manager')
export class ProcessManagerController {
  constructor(private readonly processManagerService: ProcessManagerService) {}

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
