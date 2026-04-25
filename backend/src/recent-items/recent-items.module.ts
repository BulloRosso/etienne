import { Module } from '@nestjs/common';
import { RecentItemsController } from './recent-items.controller';
import { RecentItemsService } from './recent-items.service';

@Module({
  controllers: [RecentItemsController],
  providers: [RecentItemsService],
  exports: [RecentItemsService],
})
export class RecentItemsModule {}
