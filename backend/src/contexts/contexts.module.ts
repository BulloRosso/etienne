import { Module } from '@nestjs/common';
import { ContextsController } from './contexts.controller';
import { ContextsService } from './contexts.service';
import { ContextInterceptorService } from './context-interceptor.service';
import { TagsModule } from '../tags/tags.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [TagsModule, SessionsModule],
  controllers: [ContextsController],
  providers: [ContextsService, ContextInterceptorService],
  exports: [ContextsService, ContextInterceptorService], // Export for use in other modules
})
export class ContextsModule {}
