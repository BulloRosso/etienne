import { Module } from '@nestjs/common';
import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';

@Module({
  controllers: [MemoriesController],
  providers: [MemoriesService],
  exports: [MemoriesService],
})
export class MemoriesModule {}
