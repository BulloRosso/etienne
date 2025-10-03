import { Module } from '@nestjs/common';
import { ContentManagementController } from './content-management.controller';
import { ContentManagementService } from './content-management.service';

@Module({
  controllers: [ContentManagementController],
  providers: [ContentManagementService],
})
export class ContentManagementModule {}
