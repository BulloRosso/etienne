import { Module } from '@nestjs/common';
import { ModelProxyController } from './modelproxy.controller';
import { ModelProxyService } from './modelproxy.service';

@Module({
  controllers: [ModelProxyController],
  providers: [ModelProxyService],
  exports: [ModelProxyService],
})
export class ModelProxyModule {}
