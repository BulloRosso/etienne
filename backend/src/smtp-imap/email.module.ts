import { Module } from '@nestjs/common';
import { SmtpService } from './smtp.service';
import { ImapService } from './imap.service';

/**
 * Email Module
 *
 * Provides email functionality via SMTP (sending) and IMAP (receiving).
 * Services are exported for use in MCP tools.
 */
@Module({
  providers: [SmtpService, ImapService],
  exports: [SmtpService, ImapService],
})
export class EmailModule {}
