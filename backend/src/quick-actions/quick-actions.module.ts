import { Module } from '@nestjs/common';
import { QuickActionsController } from './quick-actions.controller';
import { QuickActionsService } from './quick-actions.service';

@Module({
  controllers: [QuickActionsController],
  providers: [QuickActionsService],
  exports: [QuickActionsService],
})
export class QuickActionsModule {}
