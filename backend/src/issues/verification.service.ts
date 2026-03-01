import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { EventRouterService } from '../event-handling/core/event-router.service';
import { ProcessManagerService } from '../process-manager/process-manager.service';
import { PatchService } from './patch.service';

@Injectable()
export class VerificationService implements OnModuleInit {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly issuesService: IssuesService,
    private readonly eventRouter: EventRouterService,
    private readonly processManager: ProcessManagerService,
    private readonly patchService: PatchService,
  ) {}

  onModuleInit() {
    // Listen for VERIFYING status to trigger verification
    this.eventRouter.subscribe(async (event) => {
      if (event.name === 'issue.statusChanged' && event.group === 'SelfHealing') {
        const { issueId, status } = event.payload || {};
        const projectName = event.projectName;
        if (status === 'VERIFYING' && issueId && projectName) {
          // Small delay to allow services to restart
          setTimeout(() => this.verifyPatch(projectName, issueId), 5000);
        }
      }
    });
    this.logger.log('VerificationService subscribed to issue.statusChanged events');
  }

  /**
   * Verify that a patch resolved the issue
   */
  async verifyPatch(projectName: string, issueId: string): Promise<void> {
    const issue = await this.issuesService.getIssue(projectName, issueId);
    if (!issue) {
      this.logger.error(`Issue ${issueId} not found`);
      return;
    }

    try {
      const verificationResults: string[] = [];
      let allPassed = true;

      // Check affected services are running
      for (const serviceName of issue.affectedServices || []) {
        try {
          const serviceStatus = await this.processManager.getServiceStatus(serviceName);
          if (serviceStatus?.status === 'running') {
            verificationResults.push(`Service ${serviceName}: RUNNING`);
          } else {
            verificationResults.push(`Service ${serviceName}: NOT RUNNING`);
            allPassed = false;
          }
        } catch (error: any) {
          verificationResults.push(`Service ${serviceName}: CHECK FAILED (${error.message})`);
          allPassed = false;
        }
      }

      // If no services to check, consider it passed (code-only fix)
      if ((issue.affectedServices || []).length === 0) {
        verificationResults.push('No services to verify — code-only patch');
      }

      const details = verificationResults.join('\n');

      if (allPassed) {
        await this.issuesService.updateIssueStatus(projectName, issueId, 'RESOLVED', {
          verificationResult: 'PASS',
          verificationDetails: details,
        });

        await this.issuesService.addComment(
          projectName,
          issueId,
          'SYSTEM',
          'AGENT',
          `Verification passed. Issue resolved.\n${details}`,
        );

        this.logger.log(`Issue #${issue.number} verified and resolved`);
      } else {
        this.logger.warn(`Verification failed for issue #${issue.number}, rolling back...`);

        await this.issuesService.addComment(
          projectName,
          issueId,
          'SYSTEM',
          'AGENT',
          `Verification failed. Rolling back patch.\n${details}`,
        );

        // Rollback the patch
        await this.patchService.rollbackPatch(projectName, issueId);

        // Restart affected services after rollback
        for (const serviceName of issue.affectedServices || []) {
          try {
            await this.processManager.stopService(serviceName);
            await this.processManager.startService(serviceName);
          } catch {
            // Best effort restart
          }
        }

        // Escalate since auto-fix failed
        try {
          await this.issuesService.updateIssueStatus(projectName, issueId, 'ESCALATED', {
            verificationResult: 'FAIL',
            verificationDetails: details,
          });
        } catch {
          // May already be in FAILED status from rollback
        }
      }
    } catch (error: any) {
      this.logger.error(`Verification error for issue ${issueId}: ${error.message}`);
      await this.issuesService.addComment(
        projectName,
        issueId,
        'SYSTEM',
        'AGENT',
        `Verification error: ${error.message}. Rolling back as precaution.`,
      );
      await this.patchService.rollbackPatch(projectName, issueId);
    }
  }
}
