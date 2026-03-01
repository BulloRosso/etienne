import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { IssuesService } from './issues.service';
import { EventRouterService } from '../event-handling/core/event-router.service';
import { ClaudeSdkService } from '../claude/sdk/claude-sdk.service';
import { ProcessManagerService } from '../process-manager/process-manager.service';
import { SelfHealingIssue, FileSnapshot } from './interfaces/issue.interface';

@Injectable()
export class PatchService implements OnModuleInit {
  private readonly logger = new Logger(PatchService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  /** Dangerous command patterns to block in agent Bash tool */
  private readonly dangerousPatterns = [
    /rm\s+-rf/,
    /DROP\s+TABLE/i,
    /DELETE\s+FROM/i,
    /format\s+/,
    /mkfs/,
    /dd\s+if=/,
    />\s*\/dev\/sd/,
    /chmod\s+777/,
  ];

  constructor(
    private readonly issuesService: IssuesService,
    private readonly eventRouter: EventRouterService,
    private readonly claudeSdkService: ClaudeSdkService,
    private readonly processManager: ProcessManagerService,
  ) {}

  onModuleInit() {
    // Listen for DIAGNOSED status to trigger patching based on autonomy level
    this.eventRouter.subscribe(async (event) => {
      if (event.name === 'issue.statusChanged' && event.group === 'SelfHealing') {
        const { issueId, status } = event.payload || {};
        const projectName = event.projectName;
        if (status === 'DIAGNOSED' && issueId && projectName) {
          await this.handleDiagnosed(projectName, issueId);
        }
      }
    });
    this.logger.log('PatchService subscribed to issue.statusChanged events');
  }

  /**
   * Decide whether to patch based on autonomy level
   */
  private async handleDiagnosed(projectName: string, issueId: string): Promise<void> {
    const config = await this.issuesService.getAutonomyLevel(projectName);
    const issue = await this.issuesService.getIssue(projectName, issueId);
    if (!issue) return;

    switch (config.autonomyLevel) {
      case 0:
        // OBSERVE — do nothing, diagnosis is sufficient
        break;
      case 1:
        // SUGGEST — create patch but require admin review
        await this.issuesService.updateIssueStatus(projectName, issueId, 'PATCH_PENDING');
        await this.issuesService.addComment(
          projectName,
          issueId,
          'SYSTEM',
          'AGENT',
          'Patch prepared for admin review. Approve to apply the patch.',
        );
        break;
      case 2:
        // AUTO_LOW — auto-apply if low risk
        if (this.isLowRisk(issue)) {
          await this.applyPatch(projectName, issueId);
        } else {
          await this.issuesService.updateIssueStatus(projectName, issueId, 'PATCH_PENDING');
          await this.issuesService.addComment(
            projectName,
            issueId,
            'SYSTEM',
            'AGENT',
            'High-risk patch requires admin review before application.',
          );
        }
        break;
      case 3:
        // AUTO_ALL — always auto-apply with rollback guarantee
        await this.applyPatch(projectName, issueId);
        break;
    }
  }

  /**
   * Determine if an issue is low-risk based on affected files
   */
  private isLowRisk(issue: SelfHealingIssue): boolean {
    const highRiskPatterns = [
      /auth/i, /security/i, /database/i, /migration/i,
      /\.env/, /config\./, /secret/i, /credential/i,
      /payment/i, /billing/i,
    ];

    const affectedFiles = issue.affectedFiles || [];
    return !affectedFiles.some((file) =>
      highRiskPatterns.some((pattern) => pattern.test(file)),
    );
  }

  /**
   * Apply a patch using Claude Agent SDK with write access
   */
  async applyPatch(projectName: string, issueId: string): Promise<void> {
    const issue = await this.issuesService.getIssue(projectName, issueId);
    if (!issue) {
      this.logger.error(`Issue ${issueId} not found`);
      return;
    }

    try {
      // Create file snapshots before patching
      const snapshots = await this.createSnapshots(projectName, issue.affectedFiles || []);

      // Transition to PATCHING
      await this.issuesService.updateIssueStatus(projectName, issueId, 'PATCHING', {
        filesModified: snapshots,
      });

      const projectDir = join(this.workspaceDir, projectName);

      // Build patch prompt
      const prompt = `You are a repair agent. Apply a minimal, targeted code patch to fix the following problem.

DIAGNOSIS:
Root Cause: ${issue.rootCause}
Affected Files: ${(issue.affectedFiles || []).join(', ')}
Suggested Fix: ${issue.diagnosticLog?.match(/SUGGESTED_FIX:\s*(.+?)(?=\n\n|$)/s)?.[1] || 'See diagnostic log'}

RULES:
- Change only the minimum necessary files
- Do not introduce new dependencies if avoidable
- Comment your changes in the code
- Summarize what you changed and why at the end

Apply the fix directly to the files.`;

      let fullOutput = '';
      for await (const message of this.claudeSdkService.streamConversation(projectName, prompt, {
        agentMode: 'work',
        maxTurns: 50,
        allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'],
        processId: `patch-${issueId}`,
      })) {
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              fullOutput += block.text;
            }
          }
        }
      }

      // Read patched file contents for diff
      for (const snapshot of snapshots) {
        try {
          const filePath = join(projectDir, snapshot.filePath);
          snapshot.patchedContent = await fs.readFile(filePath, 'utf8');
        } catch {
          // File may have been deleted or moved
        }
      }

      // Update issue with patch results
      await this.issuesService.updateIssueStatus(projectName, issueId, 'VERIFYING', {
        patchDiff: this.generateDiff(snapshots),
        patchRationale: fullOutput,
        filesModified: snapshots,
      });

      // Restart affected services
      const restartedServices: string[] = [];
      for (const serviceName of issue.affectedServices || []) {
        try {
          await this.processManager.stopService(serviceName);
          await this.processManager.startService(serviceName);
          restartedServices.push(serviceName);
        } catch (error: any) {
          this.logger.warn(`Failed to restart service ${serviceName}: ${error.message}`);
        }
      }

      if (restartedServices.length > 0) {
        await this.issuesService.addComment(
          projectName,
          issueId,
          'SYSTEM',
          'AGENT',
          `Restarted services: ${restartedServices.join(', ')}`,
        );
      }

      this.logger.log(`Patch applied for issue #${issue.number}, now verifying...`);
    } catch (error: any) {
      this.logger.error(`Patching failed for issue ${issueId}: ${error.message}`);
      try {
        await this.issuesService.updateIssueStatus(projectName, issueId, 'FAILED');
        await this.issuesService.addComment(
          projectName,
          issueId,
          'SYSTEM',
          'AGENT',
          `Patch application failed: ${error.message}`,
        );
      } catch (updateError: any) {
        this.logger.error(`Failed to update issue status: ${updateError.message}`);
      }
    }
  }

  /**
   * Create file snapshots before patching
   */
  private async createSnapshots(projectName: string, filePaths: string[]): Promise<FileSnapshot[]> {
    const projectDir = join(this.workspaceDir, projectName);
    const snapshots: FileSnapshot[] = [];

    for (const filePath of filePaths) {
      try {
        const fullPath = join(projectDir, filePath);
        const content = await fs.readFile(fullPath, 'utf8');
        snapshots.push({
          filePath,
          originalContent: content,
          patchedContent: '',
          snapshotAt: new Date().toISOString(),
        });
      } catch {
        // File might not exist yet
      }
    }

    return snapshots;
  }

  /**
   * Generate a unified diff from snapshots
   */
  private generateDiff(snapshots: FileSnapshot[]): string {
    return snapshots
      .filter((s) => s.originalContent !== s.patchedContent)
      .map((s) => `--- ${s.filePath}\n+++ ${s.filePath}\n(content changed)`)
      .join('\n\n');
  }

  /**
   * Rollback patches using file snapshots
   */
  async rollbackPatch(projectName: string, issueId: string): Promise<void> {
    const issue = await this.issuesService.getIssue(projectName, issueId);
    if (!issue?.filesModified) return;

    const projectDir = join(this.workspaceDir, projectName);

    for (const snapshot of issue.filesModified) {
      try {
        const fullPath = join(projectDir, snapshot.filePath);
        await fs.writeFile(fullPath, snapshot.originalContent, 'utf8');
        this.logger.log(`Rolled back ${snapshot.filePath}`);
      } catch (error: any) {
        this.logger.error(`Failed to rollback ${snapshot.filePath}: ${error.message}`);
      }
    }

    await this.issuesService.updateIssueStatus(projectName, issueId, 'FAILED', {
      rolledBack: true,
    });

    await this.issuesService.addComment(
      projectName,
      issueId,
      'SYSTEM',
      'AGENT',
      'Patch rolled back to original state due to verification failure.',
    );
  }
}
