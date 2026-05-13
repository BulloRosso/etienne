import { Module } from '@nestjs/common';
import { Ms365TokenService } from './ms365-token.service';
import { Ms365OAuthController } from './ms365-oauth.controller';
import { GraphClientService } from './graph-client.service';
import { OneDriveSyncService } from './onedrive-sync.service';
import { WritebackWatcherService } from './writeback-watcher.service';

@Module({
  controllers: [Ms365OAuthController],
  providers: [
    Ms365TokenService,
    GraphClientService,
    OneDriveSyncService,
    WritebackWatcherService,
  ],
  exports: [
    Ms365TokenService,
    GraphClientService,
    OneDriveSyncService,
    WritebackWatcherService,
  ],
})
export class Ms365Module {}
