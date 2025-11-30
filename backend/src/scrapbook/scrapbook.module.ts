import { Module } from '@nestjs/common';
import { ScrapbookController } from './scrapbook.controller';
import { ScrapbookService } from './scrapbook.service';

@Module({
  controllers: [ScrapbookController],
  providers: [ScrapbookService],
  exports: [ScrapbookService],
})
export class ScrapbookModule {}
