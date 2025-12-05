import { Controller, Get, Post, Body, Query, Sse, Param } from '@nestjs/common';
import { Observable } from 'rxjs';
import { join } from 'path';
import { ClaudeService } from './claude.service';
import { ClaudeSdkOrchestratorService } from './sdk/claude-sdk-orchestrator.service';
import { SessionsService } from '../sessions/sessions.service';
import { AddFileDto, GetFileDto, ListFilesDto, GetStrategyDto, SaveStrategyDto, GetFilesystemDto, GetPermissionsDto, SavePermissionsDto, GetAssistantDto, GetChatHistoryDto, GetMcpConfigDto, SaveMcpConfigDto } from './dto';

@Controller('api/claude')
export class ClaudeController {
  private readonly workspaceRoot: string;

  constructor(
    private readonly svc: ClaudeService,
    private readonly sdkOrchestrator: ClaudeSdkOrchestratorService,
    private readonly sessionsService: SessionsService
  ) {
    this.workspaceRoot = process.env.WORKSPACE_ROOT || join(process.cwd(), '..', 'workspace');
  }

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

  @Post('unattended/:project')
  async executeUnattendedOperation(
    @Param('project') project: string,
    @Body() body: { prompt: string; maxTurns?: number; source?: string }
  ) {
    const { prompt, maxTurns, source } = body;
    const projectRoot = join(this.workspaceRoot, project);

    // Collect all messages from the stream
    const messages: any[] = [];
    let fullResponse = '';
    let tokenUsage = { input_tokens: 0, output_tokens: 0 };

    try {
      const observable = this.sdkOrchestrator.streamPrompt(
        project,
        prompt,
        undefined, // agentMode
        true,      // memoryEnabled
        true,      // skipChatPersistence - we'll handle persistence manually
        maxTurns || 20
      );

      // Subscribe and collect all messages
      await new Promise<void>((resolve, reject) => {
        observable.subscribe({
          next: (event: any) => {
            try {
              // The SDK orchestrator emits plain objects, not SSE MessageEvents
              // Handle both formats for compatibility
              const data = typeof event === 'object' && event !== null
                ? (typeof event.data === 'string' ? JSON.parse(event.data) : event)
                : event;

              messages.push(data);

              // Accumulate response text from stdout messages (SDK format)
              if (data.type === 'stdout' && data.data?.chunk) {
                fullResponse += data.data.chunk;
              }

              // Capture token usage from completed messages
              if (data.type === 'completed' && data.data?.usage) {
                tokenUsage.input_tokens += data.data.usage.input_tokens || 0;
                tokenUsage.output_tokens += data.data.usage.output_tokens || 0;
              }
            } catch (e) {
              console.error('[Unattended] Error parsing message:', e);
            }
          },
          error: (err) => reject(err),
          complete: () => resolve()
        });
      });

      const timestamp = new Date().toISOString();

      // Persist to chat history
      try {
        const mostRecentSessionId = await this.sessionsService.getMostRecentSessionId(projectRoot);

        if (mostRecentSessionId) {
          const sourceLabel = source || 'Automated';
          const costs = tokenUsage.input_tokens > 0 || tokenUsage.output_tokens > 0 ? {
            input_tokens: tokenUsage.input_tokens,
            output_tokens: tokenUsage.output_tokens
          } : undefined;

          await this.sessionsService.appendMessages(projectRoot, mostRecentSessionId, [
            {
              timestamp,
              isAgent: false,
              message: `[${sourceLabel}]\n${prompt}`,
              costs: undefined
            },
            {
              timestamp,
              isAgent: true,
              message: fullResponse || 'Task completed successfully',
              costs
            }
          ]);

          console.log(`[Unattended] Persisted chat history for project ${project}, session ${mostRecentSessionId}`);
        } else {
          console.log(`[Unattended] No session found for project ${project}, skipping chat persistence`);
        }
      } catch (persistError: any) {
        console.error(`[Unattended] Failed to persist chat history: ${persistError.message}`);
      }

      return {
        success: true,
        response: fullResponse,
        tokenUsage,
        messages,
        timestamp
      };
    } catch (error: any) {
      console.error('[Unattended] Execution error:', error);
      return {
        success: false,
        error: error?.message || 'Unknown error',
        response: fullResponse,
        tokenUsage,
        messages,
        timestamp: new Date().toISOString()
      };
    }
  }
}
