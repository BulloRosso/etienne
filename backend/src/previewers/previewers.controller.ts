import { Controller, Get } from '@nestjs/common';
import { PreviewersService } from './previewers.service';

@Controller('api/previewers')
export class PreviewersController {
  constructor(private readonly previewersService: PreviewersService) {}

  @Get('configuration')
  getConfiguration() {
    return this.previewersService.getConfiguration();
  }
}
