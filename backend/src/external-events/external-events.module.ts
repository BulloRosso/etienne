import { Module } from '@nestjs/common';
import { ExternalEventsController } from './external-events.controller';
import { ExternalEventsService } from './external-events.service';
import { MqttClientService } from './mqtt-client.service';
import { MqttStorageService } from './mqtt-storage.service';

@Module({
  controllers: [ExternalEventsController],
  providers: [ExternalEventsService, MqttClientService, MqttStorageService],
  exports: [ExternalEventsService],
})
export class ExternalEventsModule {}
