import { Controller, Get, Post, Body, Query, Sse, Param } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClaudeService } from './claude.service';
import { ClaudeSdkOrchestratorService } from './sdk/claude-sdk-orchestrator.service';
import { AddFileDto, GetFileDto, ListFilesDto, GetStrategyDto, SaveStrategyDto, GetFilesystemDto, GetPermissionsDto, SavePermissionsDto, GetAssistantDto, GetChatHistoryDto, GetMcpConfigDto, SaveMcpConfigDto } from './dto';

@Controller('api/claude')
export class ClaudeController {
  constructor(
    private readonly svc: ClaudeService,
    private readonly sdkOrchestrator: ClaudeSdkOrchestratorService
  ) {}

  @Post('addFile')
  addFile(@Body() dto: AddFileDto) { return this.svc.addFile(dto.project_dir, dto.file_name, dto.file_content); }

  @Get('getFile')
  getFile(@Query() dto: GetFileDto) { return this.svc.getFile(dto.project_dir, dto.file_name); }

  @Get('listFiles')
  listFiles(@Query() dto: ListFilesDto) { return this.svc.listFiles(dto.project_dir, dto.sub_dir); }

  @Get('listProjects')
  listProjects() { return this.svc.listProjects(); }

  @Get('health')
  health() { return this.svc.checkHealth(); }

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

  @Post('assistant')
  getAssistant(@Body() dto: GetAssistantDto) { return this.svc.getAssistant(dto.projectName); }

  @Post('chat/history')
  getChatHistory(@Body() dto: GetChatHistoryDto) { return this.svc.getChatHistory(dto.projectName); }

  @Post('mcp/config')
  getMcpConfig(@Body() dto: GetMcpConfigDto) { return this.svc.getMcpConfig(dto.projectName); }

  @Post('mcp/config/save')
  saveMcpConfig(@Body() dto: SaveMcpConfigDto) { return this.svc.saveMcpConfig(dto.projectName, dto.mcpServers); }

  @Sse('streamPrompt')
  streamPrompt(
    @Query('project_dir') projectDir: string,
    @Query('prompt') prompt: string,
    @Query('agentMode') agentMode?: string,
    @Query('aiModel') aiModel?: string,
    @Query('memoryEnabled') memoryEnabled?: string,
    @Query('maxTurns') maxTurns?: string
  ): Observable<MessageEvent> {
    const memoryEnabledBool = memoryEnabled === 'true';
    const maxTurnsNum = maxTurns ? parseInt(maxTurns, 10) : undefined;
    return this.svc.streamPrompt(projectDir, prompt, agentMode, aiModel, memoryEnabledBool, false, maxTurnsNum);
  }

  @Sse('streamPrompt/sdk')
  streamPromptSdk(
    @Query('project_dir') projectDir: string,
    @Query('prompt') prompt: string,
    @Query('agentMode') agentMode?: string,
    @Query('memoryEnabled') memoryEnabled?: string,
    @Query('maxTurns') maxTurns?: string
  ): Observable<MessageEvent> {
    const memoryEnabledBool = memoryEnabled === 'true';
    const maxTurnsNum = maxTurns ? parseInt(maxTurns, 10) : undefined;
    return this.sdkOrchestrator.streamPrompt(
      projectDir,
      prompt,
      agentMode,
      memoryEnabledBool,
      false,
      maxTurnsNum
    );
  }

  @Post('abort/:processId')
  async abortProcess(@Param('processId') processId: string) {
    console.log(`[ClaudeController] Abort request received for process: ${processId}`);

    // Try to abort legacy process first
    const legacyResult = await this.svc.abortProcess(processId);
    if (legacyResult.success) {
      console.log(`[ClaudeController] Successfully aborted legacy process: ${processId}`);
      return legacyResult;
    }

    // If not found in legacy processes, try SDK orchestrator
    if (processId.startsWith('sdk_')) {
      console.log(`[ClaudeController] Attempting SDK orchestrator abort for: ${processId}`);
      return this.sdkOrchestrator.abortProcess(processId);
    }

    console.log(`[ClaudeController] Process not found: ${processId}`);
    return legacyResult;
  }

  @Post('clearSession/:projectDir')
  async clearSession(@Param('projectDir') projectDir: string) {
    return this.svc.clearSession(projectDir);
  }
}
