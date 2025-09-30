import { Controller, Get, Post, Body, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClaudeService } from './claude.service';
import { AddFileDto, GetFileDto, ListFilesDto } from './dto';

@Controller('api/claude')
export class ClaudeController {
  constructor(private readonly svc: ClaudeService) {}

  @Post('addFile')
  addFile(@Body() dto: AddFileDto) { return this.svc.addFile(dto.project_dir, dto.file_name, dto.file_content); }

  @Get('getFile')
  getFile(@Query() dto: GetFileDto) { return this.svc.getFile(dto.project_dir, dto.file_name); }

  @Get('listFiles')
  listFiles(@Query() dto: ListFilesDto) { return this.svc.listFiles(dto.project_dir, dto.sub_dir); }

  @Sse('streamPrompt')
  streamPrompt(@Query('project_dir') projectDir: string, @Query('prompt') prompt: string): Observable<MessageEvent> {
    return this.svc.streamPrompt(projectDir, prompt);
  }
}
