import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { OkfExportService } from './okf-export.service';
import { OkfImportService } from './okf-import.service';
import { OkfImportResult } from './okf.types';

/** Cap the warnings header so it can never blow the response-header limit. */
const MAX_HEADER_WARNINGS = 50;

@Controller('api/workspace')
export class OkfController {
  constructor(
    private readonly exportService: OkfExportService,
    private readonly importService: OkfImportService,
  ) {}

  /**
   * Export a project (or a subfolder of it) as an OKF v0.1 bundle zip.
   * Warnings collected during the export are surfaced in the
   * `X-OKF-Warnings` header as a JSON string array.
   */
  @Roles('user')
  @Post(':project/okf/export')
  async export(
    @Param('project') project: string,
    @Body() body: { path?: string; extractText?: boolean },
    @Res() res: Response,
  ): Promise<void> {
    const { filename, buffer, warnings } = await this.exportService.export(project, {
      path: body?.path,
      extractText: body?.extractText,
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (warnings.length > 0) {
      const capped =
        warnings.length > MAX_HEADER_WARNINGS
          ? [...warnings.slice(0, MAX_HEADER_WARNINGS), `+${warnings.length - MAX_HEADER_WARNINGS} more`]
          : warnings;
      res.setHeader('X-OKF-Warnings', JSON.stringify(capped));
    }
    res.send(buffer);
  }

  /**
   * Import an OKF bundle zip (multipart field `file`) into the project
   * workspace. Optional multipart fields: `targetPath` (project-relative
   * folder, default okf/<bundle-name>) and `indexRag` ('1'/'true'/'0'/'false',
   * default true) to index imported concepts into the project RAG store.
   */
  @Roles('user')
  @Post(':project/okf/import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @Param('project') project: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { targetPath?: string; indexRag?: string },
  ): Promise<OkfImportResult> {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }
    const indexRag = !['0', 'false'].includes((body?.indexRag ?? '').toLowerCase());
    return this.importService.import(project, file.buffer, {
      targetPath: body?.targetPath,
      indexRag,
    });
  }
}
