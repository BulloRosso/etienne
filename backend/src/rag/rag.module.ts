import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { Bm25Service } from './bm25.service';

@Module({
  controllers: [RagController],
  providers: [RagService, Bm25Service],
  exports: [RagService],
})
export class RagModule {}
