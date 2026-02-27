import { Module } from '@nestjs/common';
import { ScrapbookController, ScrapbooksController, ScrapbookGraphController } from './scrapbook.controller';
import { ScrapbookService } from './scrapbook.service';

@Module({
  controllers: [ScrapbookController, ScrapbooksController, ScrapbookGraphController],
  providers: [ScrapbookService],
  exports: [ScrapbookService],
})
export class ScrapbookModule {}
