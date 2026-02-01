import { Module } from '@nestjs/common';
import { RemoteSessionsController } from './remote-sessions.controller';
import { RemoteSessionsService } from './remote-sessions.service';
import { RemoteSessionsStorageService } from './remote-sessions-storage.service';
import { PairingService } from './pairing.service';
import { SessionEventsService } from './session-events.service';
import { InterceptorsModule } from '../interceptors/interceptors.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [InterceptorsModule, SessionsModule],
  controllers: [RemoteSessionsController],
  providers: [
    RemoteSessionsService,
    RemoteSessionsStorageService,
    PairingService,
    SessionEventsService,
  ],
  exports: [RemoteSessionsService, PairingService, SessionEventsService],
})
export class RemoteSessionsModule {}
