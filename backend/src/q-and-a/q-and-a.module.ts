import { Module } from '@nestjs/common';
import { QAndAController } from './q-and-a.controller';
import { QAndAService } from './q-and-a.service';

@Module({
  controllers: [QAndAController],
  providers: [QAndAService],
  exports: [QAndAService],
})
export class QAndAModule {}
