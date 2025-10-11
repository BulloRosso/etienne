import { Module } from '@nestjs/common';
import { SubagentsController } from './subagents.controller';
import { SubagentsService } from './subagents.service';

@Module({
  controllers: [SubagentsController],
  providers: [SubagentsService],
  exports: [SubagentsService],
})
export class SubagentsModule {}
