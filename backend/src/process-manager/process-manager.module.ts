import { Module } from '@nestjs/common';
import { ProcessManagerController } from './process-manager.controller';
import { ProcessManagerService } from './process-manager.service';

@Module({
  controllers: [ProcessManagerController],
  providers: [ProcessManagerService],
  exports: [ProcessManagerService],
})
export class ProcessManagerModule {}
