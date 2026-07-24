import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { TagsModule } from '../tags/tags.module';
import { OkfController } from './okf.controller';
import { OkfExportService } from './okf-export.service';
import { OkfImportService } from './okf-import.service';

@Module({
  imports: [RagModule, TagsModule],
  controllers: [OkfController],
  providers: [OkfExportService, OkfImportService],
})
export class OkfModule {}
