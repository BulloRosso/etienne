import { Controller, Get, Put, Body } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { PreviewersService, PreviewerMapping } from './previewers.service';

@Controller('api/previewers')
export class PreviewersController {
  constructor(private readonly previewersService: PreviewersService) {}

  @Get('configuration')
  async getConfiguration() {
    return this.previewersService.getFullConfiguration();
  }

  @Put('configuration')
  @Roles('admin')
  async updateConfiguration(@Body() body: { previewers: PreviewerMapping[] }) {
    await this.previewersService.updateConfiguration(body.previewers);
    return { success: true };
  }
}
