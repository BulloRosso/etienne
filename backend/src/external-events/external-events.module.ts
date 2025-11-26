import { Module, forwardRef } from '@nestjs/common';
import { ExternalEventsController } from './external-events.controller';
import { ExternalEventsService } from './external-events.service';
import { MqttClientService } from './mqtt-client.service';
import { MqttStorageService } from './mqtt-storage.service';
import { EventHandlingModule } from '../event-handling/event-handling.module';

@Module({
  imports: [forwardRef(() => EventHandlingModule)],
  controllers: [ExternalEventsController],
  providers: [ExternalEventsService, MqttClientService, MqttStorageService],
  exports: [ExternalEventsService],
})
export class ExternalEventsModule {}
