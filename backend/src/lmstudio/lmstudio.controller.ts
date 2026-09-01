import { Controller, Get, Query } from '@nestjs/common';
import { LmStudioService, LmStudioProbeResult } from './lmstudio.service';

@Controller('api/lmstudio')
export class LmStudioController {
  constructor(private readonly lmStudioService: LmStudioService) {}

  /**
   * Probe for a local LM Studio server and list its loaded models.
   * `token` tests an auth token before it is persisted (first-run wizard).
   */
  @Get('models')
  async getModels(@Query('token') token?: string): Promise<LmStudioProbeResult> {
    return this.lmStudioService.probe(token || undefined);
  }
}
