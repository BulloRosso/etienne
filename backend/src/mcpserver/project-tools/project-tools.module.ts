import { Module } from '@nestjs/common';
import { ProjectToolsService } from './project-tools.service';

@Module({
  providers: [ProjectToolsService],
  exports: [ProjectToolsService],
})
export class ProjectToolsModule {}
