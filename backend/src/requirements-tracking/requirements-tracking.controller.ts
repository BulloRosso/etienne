import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { RequirementsTrackingService } from './requirements-tracking.service';

/**
 * REST surface for TenderTrace beyond the MCP tools: multipart document upload,
 * capture lifecycle (the answers endpoint must work from a plain fetch while the
 * agent's ask_user tool call is suspended), tracker mock events, projections
 * rebuild, and export download. Everything else goes through the MCP group.
 */
@Controller('api/requirements-tracking/:project')
export class RequirementsTrackingController {
  private readonly logger = new Logger(RequirementsTrackingController.name);

  constructor(private readonly service: RequirementsTrackingService) {}

  @Post('documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('project') project: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body() body: { title?: string; kind?: 'tender' | 'artifact'; artifactType?: any },
  ) {
    if (!file) throw new Error('No file uploaded');
    const title = body.title || path.parse(file.originalname).name;
    const extension = path.extname(file.originalname).toLowerCase() || '.bin';

    // stage into tmp/, then register (which moves it into uploads|artifacts/)
    const staged = `tmp/upload-${Date.now()}${extension}`;
    await this.service.files.writeFile(project, staged, file.buffer);
    const document = await this.service.ingestion.registerDocument(project, {
      projectRelativePath: `requirements-tracking/${staged}`,
      title,
      kind: body.kind ?? 'tender',
      artifactType: body.artifactType,
    });
    const parsed = await this.service.ingestion.parseDocument(project, document.id);
    return { success: true, document: parsed };
  }

  @Get('summary')
  async summary(@Param('project') project: string) {
    return this.service.getTenderSummary(project);
  }

  // ── Quick Capture lifecycle (REST because answers must arrive from a plain
  //    fetch while the agent's ask_user tool call is suspended) ──────────────

  @Post('captures')
  async createCapture(
    @Param('project') project: string,
    @Body() body: { pastedText: string; hint?: string; createdBy?: string },
  ) {
    const capture = await this.service.startCapture(
      project,
      body.pastedText,
      body.createdBy ?? 'user',
      body.hint,
    );
    return { success: true, captureId: capture.id };
  }

  @Get('captures/:captureId')
  async getCapture(@Param('project') project: string, @Param('captureId') captureId: string) {
    return this.service.captures.get(project, captureId);
  }

  @Post('captures/:captureId/answers')
  async answerCapture(
    @Param('project') project: string,
    @Param('captureId') captureId: string,
    @Body() body: { answers: Array<{ questionId: string; answer?: string; skipped?: boolean }>; answeredBy?: string },
  ) {
    const capture = await this.service.captures.answer(project, captureId, {
      answers: body.answers,
      answeredBy: body.answeredBy ?? 'user',
    });
    return { success: true, capture };
  }

  @Post('captures/:captureId/close')
  async closeCapture(@Param('project') project: string, @Param('captureId') captureId: string) {
    await this.service.captures.close(project, captureId);
    return { success: true };
  }

  @Post('projections/rebuild')
  async rebuildProjections(@Param('project') project: string) {
    const result = await this.service.projections.rebuild(project);
    return { success: true, ...result };
  }

  @Get('exports/*')
  async download(@Param('project') project: string, @Param() params: any, @Res() res: Response) {
    const relative = `exports/${params[0]}`;
    const absolute = this.service.files.absolutePath(project, relative);
    res.download(absolute);
  }
}
