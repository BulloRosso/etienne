import { Module } from '@nestjs/common';
import { ContentManagementController } from './content-management.controller';
import { ContentManagementService } from './content-management.service';
import { TagsModule } from '../tags/tags.module';
import { EventHandlingModule } from '../event-handling/event-handling.module';

@Module({
  imports: [TagsModule, EventHandlingModule],
  controllers: [ContentManagementController],
  providers: [ContentManagementService],
})
export class ContentManagementModule {}
