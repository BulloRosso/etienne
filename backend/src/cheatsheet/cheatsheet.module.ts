import { Module } from '@nestjs/common';
import { CheatsheetController } from './cheatsheet.controller';
import { CheatsheetService } from './cheatsheet.service';

@Module({
  controllers: [CheatsheetController],
  providers: [CheatsheetService],
  exports: [CheatsheetService],
})
export class CheatsheetModule {}
