import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PreviewersController } from './previewers.controller';
import { PreviewersService } from './previewers.service';

@Module({
  imports: [ConfigurationModule],
  controllers: [PreviewersController],
  providers: [PreviewersService],
  exports: [PreviewersService],
})
export class PreviewersModule {}
