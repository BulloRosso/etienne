import { Module } from '@nestjs/common';
import { A2AClientService } from './a2a-client.service';
import { TelemetryModule } from '../observability/telemetry.module';

@Module({
  imports: [TelemetryModule],
  providers: [A2AClientService],
  exports: [A2AClientService],
})
export class A2AClientModule {}
