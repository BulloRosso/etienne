import { Controller, Get, Post, Param, Query, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { ImapService } from './imap.service';
import { ProcessManagerService } from '../process-manager/process-manager.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/email')
export class EmailController {
  constructor(
    private readonly imapService: ImapService,
    private readonly processManagerService: ProcessManagerService,
  ) {}

  /**
   * Check if IMAP is available (connector running + configured).
   */
  @Get('status')
  @Roles('user')
  async getStatus() {
    const configured = await this.imapService.isConfigured();
    let service = { status: 'stopped' };
    try {
      service = await this.processManagerService.getServiceStatus('imap-connector');
    } catch {
      // Service not found or error checking status
    }
    const available = configured && service.status === 'running';
    return { available, configured, service };
  }

  /**
   * List all IMAP mailbox folders.
   */
  @Get('folders')
  @Roles('user')
  async listFolders() {
    try {
      const folders = await this.imapService.listFolders();
      return { success: true, folders };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, folders: [] };
    }
  }

  /**
   * List messages in a folder with pagination.
   */
  @Get('folders/:folder/messages')
  @Roles('user')
  async listMessages(
    @Param('folder') folder: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '50',
  ) {
    try {
      const folderPath = decodeURIComponent(folder);
      const result = await this.imapService.listMessages(
        folderPath,
        parseInt(page, 10) || 1,
        parseInt(pageSize, 10) || 50,
      );
      return { success: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, messages: [], total: 0 };
    }
  }

  /**
   * Get full message content by UID.
   */
  @Get('messages/:uid')
  @Roles('user')
  async getMessage(
    @Param('uid') uid: string,
    @Query('folder') folder: string = 'INBOX',
  ) {
    try {
      const folderPath = decodeURIComponent(folder);
      const message = await this.imapService.getMessage(folderPath, parseInt(uid, 10));
      return { success: true, message };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /**
   * Download an attachment as binary.
   */
  @Get('messages/:uid/attachments/:index')
  @Roles('user')
  async downloadAttachment(
    @Param('uid') uid: string,
    @Param('index') index: string,
    @Query('folder') folder: string = 'INBOX',
    @Res() res: Response,
  ) {
    try {
      const folderPath = decodeURIComponent(folder);
      const attachment = await this.imapService.getAttachment(
        folderPath,
        parseInt(uid, 10),
        parseInt(index, 10),
      );
      res.setHeader('Content-Type', attachment.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
      res.send(attachment.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  }

  /**
   * Save an attachment to the project workspace.
   */
  @Post('messages/:uid/attachments/:index/save')
  @Roles('user')
  async saveAttachment(
    @Param('uid') uid: string,
    @Param('index') index: string,
    @Body() body: { projectName: string; targetPath: string; folder?: string },
  ) {
    try {
      const folderPath = body.folder ? decodeURIComponent(body.folder) : 'INBOX';
      const result = await this.imapService.saveAttachment(
        folderPath,
        parseInt(uid, 10),
        parseInt(index, 10),
        body.projectName,
        body.targetPath || '',
      );
      return { success: true, savedPath: result.savedPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * List directories in a project workspace (for folder autocomplete).
   */
  @Get('project-directories/:project')
  @Roles('user')
  async listProjectDirectories(@Param('project') project: string) {
    try {
      const directories = await this.imapService.listProjectDirectories(project);
      return { success: true, directories };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, directories: [] };
    }
  }
}
