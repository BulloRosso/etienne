import { Module } from '@nestjs/common';
import { SmtpService } from './smtp.service';
import { ImapService } from './imap.service';
import { EmailController } from './email.controller';
import { ProcessManagerModule } from '../process-manager/process-manager.module';

/**
 * Email Module
 *
 * Provides email functionality via SMTP (sending) and IMAP (receiving).
 * Services are exported for use in MCP tools.
 * Controller provides REST endpoints for the IMAP Inbox Viewer.
 */
@Module({
  imports: [ProcessManagerModule],
  controllers: [EmailController],
  providers: [SmtpService, ImapService],
  exports: [SmtpService, ImapService],
})
export class EmailModule {}
