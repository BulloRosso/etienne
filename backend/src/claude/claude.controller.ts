import { Controller, Get, Post, Body, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClaudeService } from './claude.service';
import { AddFileDto, GetFileDto, ListFilesDto, GetStrategyDto, SaveStrategyDto, GetFilesystemDto, GetPermissionsDto, SavePermissionsDto } from './dto';

@Controller('api/claude')
export class ClaudeController {
  constructor(private readonly svc: ClaudeService) {}

  @Post('addFile')
  addFile(@Body() dto: AddFileDto) { return this.svc.addFile(dto.project_dir, dto.file_name, dto.file_content); }

  @Get('getFile')
  getFile(@Query() dto: GetFileDto) { return this.svc.getFile(dto.project_dir, dto.file_name); }

  @Get('listFiles')
  listFiles(@Query() dto: ListFilesDto) { return this.svc.listFiles(dto.project_dir, dto.sub_dir); }

  @Get('listProjects')
  listProjects() { return this.svc.listProjects(); }

  @Post('strategy')
  getStrategy(@Body() dto: GetStrategyDto) { return this.svc.getStrategy(dto.projectName); }

  @Post('strategy/save')
  saveStrategy(@Body() dto: SaveStrategyDto) { return this.svc.saveStrategy(dto.projectName, dto.content); }

  @Post('filesystem')
  getFilesystem(@Body() dto: GetFilesystemDto) { return this.svc.getFilesystem(dto.projectName); }

  @Post('permissions')
  getPermissions(@Body() dto: GetPermissionsDto) { return this.svc.getPermissions(dto.projectName); }

  @Post('permissions/save')
  savePermissions(@Body() dto: SavePermissionsDto) { return this.svc.savePermissions(dto.projectName, dto.allowedTools); }

  @Sse('streamPrompt')
  streamPrompt(@Query('project_dir') projectDir: string, @Query('prompt') prompt: string): Observable<MessageEvent> {
    return this.svc.streamPrompt(projectDir, prompt);
  }
}
