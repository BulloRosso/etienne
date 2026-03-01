import { Module } from '@nestjs/common';
import { EventHandlingModule } from '../event-handling/event-handling.module';
import { ProcessManagerModule } from '../process-manager/process-manager.module';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';
import { DiagnosticService } from './diagnostic.service';
import { PatchService } from './patch.service';
import { VerificationService } from './verification.service';
import { ClaudeSdkService } from '../claude/sdk/claude-sdk.service';

@Module({
  imports: [EventHandlingModule, ProcessManagerModule],
  controllers: [IssuesController],
  providers: [IssuesService, DiagnosticService, PatchService, VerificationService, ClaudeSdkService],
  exports: [IssuesService],
})
export class IssuesModule {}
