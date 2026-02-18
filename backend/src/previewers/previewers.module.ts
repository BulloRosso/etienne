import { Module } from '@nestjs/common';
import { PreviewersController } from './previewers.controller';
import { PreviewersService } from './previewers.service';

@Module({
  controllers: [PreviewersController],
  providers: [PreviewersService],
  exports: [PreviewersService],
})
export class PreviewersModule {}
