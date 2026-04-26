import { Module } from '@nestjs/common';
import { InterceptorsModule } from '../interceptors/interceptors.module';
import { RemoteSessionsModule } from '../remote-sessions/remote-sessions.module';
import { HitlProtocolController } from './hitl-protocol.controller';
import { HitlProtocolService } from './hitl-protocol.service';
import { HitlPolicyService } from './hitl-policy.service';
import { HitlTokenService } from './hitl-token.service';
import { HitlRendererService } from './hitl-renderer.service';

@Module({
  imports: [InterceptorsModule, RemoteSessionsModule],
  controllers: [HitlProtocolController],
  providers: [
    HitlProtocolService,
    HitlPolicyService,
    HitlTokenService,
    HitlRendererService,
  ],
  exports: [HitlProtocolService, HitlPolicyService],
})
export class HitlProtocolModule {}
