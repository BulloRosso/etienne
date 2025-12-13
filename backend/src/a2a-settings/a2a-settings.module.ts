import { Module } from '@nestjs/common';
import { A2ASettingsController } from './a2a-settings.controller';
import { A2ASettingsService } from './a2a-settings.service';

@Module({
  controllers: [A2ASettingsController],
  providers: [A2ASettingsService],
  exports: [A2ASettingsService],
})
export class A2ASettingsModule {}
