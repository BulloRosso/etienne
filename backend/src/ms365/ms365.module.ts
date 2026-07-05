import { Module } from '@nestjs/common';
import { Ms365TokenService } from './ms365-token.service';
import { Ms365OAuthController } from './ms365-oauth.controller';
import { GraphClientService } from './graph-client.service';
import { OneDriveSyncService } from './onedrive-sync.service';
import { WritebackWatcherService } from './writeback-watcher.service';
import { FilesystemEventsService } from './filesystem-events.service';
import { TeamsChannelSyncService } from './teams-channel-sync.service';
import { TeamsObserverController } from './teams-observer.controller';

@Module({
  controllers: [Ms365OAuthController, TeamsObserverController],
  providers: [
    Ms365TokenService,
    GraphClientService,
    OneDriveSyncService,
    WritebackWatcherService,
    FilesystemEventsService,
    TeamsChannelSyncService,
  ],
  exports: [
    Ms365TokenService,
    GraphClientService,
    OneDriveSyncService,
    WritebackWatcherService,
    FilesystemEventsService,
    TeamsChannelSyncService,
  ],
})
export class Ms365Module {}
