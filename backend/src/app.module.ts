import { Module } from '@nestjs/common';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { InterceptorsController } from './interceptors/interceptors.controller';
import { InterceptorsService } from './interceptors/interceptors.service';

@Module({
  controllers: [ClaudeController, InterceptorsController],
  providers: [ClaudeService, InterceptorsService],
})
export class AppModule {}
