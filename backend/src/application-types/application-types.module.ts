import { Module } from '@nestjs/common';
import { ApplicationTypesService } from './application-types.service';
import { ApplicationTypesController } from './application-types.controller';

@Module({
  controllers: [ApplicationTypesController],
  providers: [ApplicationTypesService],
  exports: [ApplicationTypesService],
})
export class ApplicationTypesModule {}
