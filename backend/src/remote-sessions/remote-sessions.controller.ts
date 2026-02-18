import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Sse,
  Logger,
  ParseIntPipe,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { RemoteSessionsService } from './remote-sessions.service';
import { SessionEventsService } from './session-events.service';
import {
  PairingRequestDto,
  PairingResponseDto,
  SendMessageDto,
  SelectProjectDto,
} from './dto';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';

@Controller('api/remote-sessions')
export class RemoteSessionsController {
  private readonly logger = new Logger(RemoteSessionsController.name);

  constructor(
    private readonly remoteSessionsService: RemoteSessionsService,
    private readonly sessionEventsService: SessionEventsService,
  ) {}

  /**
   * Request pairing (called by Telegram provider)
   * This emits an SSE event to the frontend for approval
   */
  @Public()
  @Post('pairing/request')
  async requestPairing(@Body() dto: PairingRequestDto) {
    this.logger.log(`Pairing request from ${dto.provider} chatId: ${dto.chatId}`);

    const result = await this.remoteSessionsService.requestPairing(dto.provider, {
      chatId: dto.chatId,
      userId: dto.userId,
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    return result;
  }

  /**
   * Respond to pairing request (called by frontend modal)
   */
  @Roles('admin')
  @Post('pairing/respond')
  async respondToPairing(@Body() dto: PairingResponseDto) {
    this.logger.log(`Pairing response for ${dto.id}: ${dto.action}`);

    const success = await this.remoteSessionsService.handlePairingResponse(
      dto.id,
      dto.action,
      dto.message,
    );

    return { success };
  }

  /**
   * List pending pairing requests
   */
  @Roles('admin')
  @Get('pairing/pending')
  async getPendingPairings() {
    const pairings = await this.remoteSessionsService.getPendingPairings();
    return { pairings };
  }

  /**
   * Forward message to Claude (called by Telegram provider)
   */
  @Public()
  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto) {
    this.logger.log(`Message from chatId ${dto.chatId}`);

    const result = await this.remoteSessionsService.forwardMessage(dto.chatId, dto.message);
    return result;
  }

  /**
   * Select project for a session (called by Telegram provider)
   */
  @Public()
  @Post('project')
  async selectProject(@Body() dto: SelectProjectDto) {
    this.logger.log(`Project selection: chatId ${dto.chatId} -> ${dto.projectName}`);

    const result = await this.remoteSessionsService.selectProject(dto.chatId, dto.projectName);
    return result;
  }

  /**
   * Get session by chat ID (called by Telegram provider)
   */
  @Public()
  @Get('session/:chatId')
  async getSession(@Param('chatId', ParseIntPipe) chatId: number) {
    const session = await this.remoteSessionsService.getSessionByChatId(chatId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    return {
      success: true,
      session: {
        id: session.id,
        provider: session.provider,
        project: session.project,
        remoteSession: {
          chatId: session.remoteSession.chatId,
          username: session.remoteSession.username,
          firstName: session.remoteSession.firstName,
        },
        status: session.status,
      },
    };
  }

  /**
   * List all available projects
   */
  @Public()
  @Get('projects')
  async listProjects() {
    const projects = await this.remoteSessionsService.listProjects();
    return { projects };
  }

  /**
   * List all active sessions
   */
  @Public()
  @Get('sessions')
  async listSessions() {
    const sessions = await this.remoteSessionsService.getAllSessions();
    return { sessions };
  }

  /**
   * Check if a chat is paired
   */
  @Public()
  @Get('paired/:chatId')
  async isPaired(@Param('chatId', ParseIntPipe) chatId: number) {
    const isPaired = await this.remoteSessionsService.isPaired(chatId);
    return { paired: isPaired };
  }

  /**
   * Disconnect a session
   */
  @Public()
  @Post('disconnect/:chatId')
  async disconnect(@Param('chatId', ParseIntPipe) chatId: number) {
    const success = await this.remoteSessionsService.disconnectSession(chatId);
    return { success };
  }

  /**
   * SSE endpoint for provider events (pairing results, Claude responses)
   * The Telegram provider subscribes to this to receive outgoing messages
   */
  @Public()
  @Sse('events/:provider')
  events(@Param('provider') provider: string): Observable<MessageEvent> {
    this.logger.log(`SSE subscription from provider: ${provider}`);

    return this.sessionEventsService.getEventStream(provider).pipe(
      map((event) => ({
        data: JSON.stringify(event),
      } as MessageEvent)),
    );
  }

  /**
   * Download a file from the project workspace (called by Telegram provider)
   * Returns the file content for sending to Telegram
   */
  @Public()
  @Get('file/:chatId/:filename')
  async downloadFile(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    this.logger.log(`File download request: chatId=${chatId}, filename=${filename}`);

    const result = await this.remoteSessionsService.getProjectFile(chatId, filename);

    if (!result) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: 'File not found or access denied',
      });
      return;
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.content.length);
    res.send(result.content);
  }

  /**
   * List files in the project workspace (called by Telegram provider)
   */
  @Public()
  @Get('files/:chatId')
  async listFiles(
    @Param('chatId', ParseIntPipe) chatId: number,
    @Query('path') path?: string,
  ) {
    const result = await this.remoteSessionsService.listProjectFiles(chatId, path);
    return result;
  }
}
