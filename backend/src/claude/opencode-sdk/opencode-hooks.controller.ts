import { Body, Controller, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { OpenCodeHookBridgeService } from './opencode-hook-bridge.service';

/**
 * Localhost callback endpoint for the provisioned OpenCode hook plugin
 * (`.opencode/plugin/etienne-hooks.js`). The plugin runs inside the embedded
 * OpenCode server process and POSTs tool-execution events here.
 *
 * `@Public()` because the OpenCode server has no user JWT; instead each
 * request must carry the per-boot shared secret the provisioner embedded
 * into the plugin file.
 */
@Controller('api/opencode')
export class OpenCodeHooksController {
  constructor(private readonly bridge: OpenCodeHookBridgeService) {}

  @Public()
  @Post('hooks/:project')
  receive(
    @Param('project') project: string,
    @Headers('x-etienne-hook-token') token: string,
    @Body() body: any,
  ) {
    if (token !== this.bridge.token) {
      throw new UnauthorizedException('Invalid hook token');
    }
    this.bridge.markSeen(project);
    this.bridge.handle(project, body);
    return { ok: true };
  }
}
