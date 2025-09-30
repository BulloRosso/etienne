import { Module } from '@nestjs/common';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';

@Module({
  controllers: [ClaudeController],
  providers: [ClaudeService],
})
export class AppModule {}
