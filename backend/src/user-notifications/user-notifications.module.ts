import { Module } from '@nestjs/common';
import { UserNotificationsController } from './user-notifications.controller';
import { UserNotificationsService } from './user-notifications.service';
import { ProcessManagerModule } from '../process-manager/process-manager.module';
import { EmailModule } from '../smtp-imap/email.module';
import { RemoteSessionsModule } from '../remote-sessions/remote-sessions.module';
import { CodingAgentConfigurationModule } from '../coding-agent-configuration/coding-agent-configuration.module';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';

@Module({
  imports: [ProcessManagerModule, EmailModule, RemoteSessionsModule, CodingAgentConfigurationModule],
  controllers: [UserNotificationsController],
  providers: [UserNotificationsService, McpServerConfigService],
  exports: [UserNotificationsService],
})
export class UserNotificationsModule {}
