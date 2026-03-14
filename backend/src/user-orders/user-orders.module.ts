import { Module } from '@nestjs/common';
import { UserOrdersController } from './user-orders.controller';
import { UserOrdersService } from './user-orders.service';

@Module({
  controllers: [UserOrdersController],
  providers: [UserOrdersService],
  exports: [UserOrdersService],
})
export class UserOrdersModule {}
