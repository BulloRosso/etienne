import { Module } from '@nestjs/common';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { InterceptorsController } from './interceptors/interceptors.controller';
import { InterceptorsService } from './interceptors/interceptors.service';
import { ContentManagementModule } from './content-management/content-management.module';
import { ModelProxyModule } from './modelproxy/modelproxy.module';

@Module({
  imports: [ContentManagementModule, ModelProxyModule],
  controllers: [ClaudeController, InterceptorsController],
  providers: [ClaudeService, InterceptorsService],
})
export class AppModule {}
