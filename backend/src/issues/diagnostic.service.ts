import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { EventRouterService } from '../event-handling/core/event-router.service';
import { ClaudeSdkService } from '../claude/sdk/claude-sdk.service';
import { SelfHealingIssue } from './interfaces/issue.interface';

interface Diagnosis {
  rootCause: string;
  confidenceScore: number;
  affectedFiles: string[];
  affectedServices: string[];
  suggestedFix: string;
}

@Injectable()
export class DiagnosticService implements OnModuleInit {
  private readonly logger = new Logger(DiagnosticService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly issuesService: IssuesService,
    private readonly eventRouter: EventRouterService,
    private readonly claudeSdkService: ClaudeSdkService,
  ) {}

  onModuleInit() {
    // Subscribe to issue.approved events
    this.unsubscribe = this.eventRouter.subscribe(async (event) => {
      if (event.name === 'issue.approved' && event.group === 'SelfHealing') {
        const { issueId } = event.payload || {};
        const projectName = event.projectName;
        if (issueId && projectName) {
          // Check autonomy level before proceeding
          const config = await this.issuesService.getAutonomyLevel(projectName);
          if (config.autonomyLevel >= 0) {
            this.logger.log(`Starting diagnosis for issue ${issueId} in project ${projectName}`);
            await this.diagnoseIssue(projectName, issueId);
          }
        }
      }
    });
    this.logger.log('DiagnosticService subscribed to issue.approved events');
  }

  /**
   * Run diagnosis on an approved issue using Claude Agent SDK in read-only mode
   */
  async diagnoseIssue(projectName: string, issueId: string): Promise<void> {
    const issue = await this.issuesService.getIssue(projectName, issueId);
    if (!issue) {
      this.logger.error(`Issue ${issueId} not found in project ${projectName}`);
      return;
    }

    try {
      // Transition to DIAGNOSING
      await this.issuesService.updateIssueStatus(projectName, issueId, 'DIAGNOSING');

      // Build the diagnostic prompt
      const prompt = this.buildDiagnosticPrompt(issue);

      // Stream conversation in read-only mode
      let fullOutput = '';
      for await (const message of this.claudeSdkService.streamConversation(projectName, prompt, {
        agentMode: 'plan', // Read-only mode
        maxTurns: 30,
        allowedTools: ['Bash', 'Read', 'Grep', 'Glob'],
        processId: `diag-${issueId}`,
      })) {
        // Collect agent output
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              fullOutput += block.text;
            }
          }
        }
      }

      // Parse diagnosis from agent output
      const diagnosis = this.parseDiagnosis(fullOutput);

      // Update issue with diagnostic results
      await this.issuesService.updateIssueStatus(projectName, issueId, 'DIAGNOSED', {
        rootCause: diagnosis.rootCause,
        confidenceScore: diagnosis.confidenceScore,
        affectedFiles: diagnosis.affectedFiles,
        affectedServices: diagnosis.affectedServices,
        diagnosticLog: fullOutput,
      });

      this.logger.log(`Diagnosis complete for issue #${issue.number}: confidence=${diagnosis.confidenceScore}`);

      // Check autonomy level to decide next step
      const config = await this.issuesService.getAutonomyLevel(projectName);
      if (config.autonomyLevel === 0) {
        // OBSERVE mode — stop at DIAGNOSED, add system comment
        await this.issuesService.addComment(
          projectName,
          issueId,
          'SYSTEM',
          'AGENT',
          `Diagnosis complete. Root cause: ${diagnosis.rootCause}. Suggested fix: ${diagnosis.suggestedFix}. Autonomy level is OBSERVE — no patch will be applied automatically.`,
        );
      }
      // Levels 1-3 will be handled by PatchService listening for issue.statusChanged
    } catch (error: any) {
      this.logger.error(`Diagnosis failed for issue ${issueId}: ${error.message}`);
      try {
        await this.issuesService.updateIssueStatus(projectName, issueId, 'ESCALATED');
        await this.issuesService.addComment(
          projectName,
          issueId,
          'SYSTEM',
          'AGENT',
          `Diagnosis failed: ${error.message}. Issue escalated for manual intervention.`,
        );
      } catch (updateError: any) {
        this.logger.error(`Failed to update issue status after diagnosis failure: ${updateError.message}`);
      }
    }
  }

  private buildDiagnosticPrompt(issue: SelfHealingIssue): string {
    return `You are a diagnostic agent. Investigate the following problem and provide a structured diagnosis.

PROBLEM REPORT:
Title: ${issue.title}
Description: ${issue.description}
${issue.stepsToReproduce ? `Steps to reproduce: ${issue.stepsToReproduce}` : ''}
${issue.expectedBehavior ? `Expected behavior: ${issue.expectedBehavior}` : ''}
${issue.actualBehavior ? `Actual behavior: ${issue.actualBehavior}` : ''}

INSTRUCTIONS:
1. Search through source code, logs, and configuration files to find the root cause
2. Check recent file changes that might have introduced the issue
3. Examine error logs and stack traces

Provide your findings in this exact format at the end of your analysis:

ROOT_CAUSE: <clear explanation of what is causing the problem>
CONFIDENCE: <number between 0.0 and 1.0>
AFFECTED_FILES: <comma-separated list of file paths>
AFFECTED_SERVICES: <comma-separated list of service names>
SUGGESTED_FIX: <description of how to fix the problem>`;
  }

  private parseDiagnosis(output: string): Diagnosis {
    const rootCauseMatch = output.match(/ROOT_CAUSE:\s*(.+?)(?=\n(?:CONFIDENCE|AFFECTED_FILES|AFFECTED_SERVICES|SUGGESTED_FIX):|\n\n|$)/s);
    const confidenceMatch = output.match(/CONFIDENCE:\s*([\d.]+)/);
    const filesMatch = output.match(/AFFECTED_FILES:\s*(.+?)(?=\n(?:CONFIDENCE|ROOT_CAUSE|AFFECTED_SERVICES|SUGGESTED_FIX):|\n\n|$)/s);
    const servicesMatch = output.match(/AFFECTED_SERVICES:\s*(.+?)(?=\n(?:CONFIDENCE|ROOT_CAUSE|AFFECTED_FILES|SUGGESTED_FIX):|\n\n|$)/s);
    const fixMatch = output.match(/SUGGESTED_FIX:\s*(.+?)(?=\n(?:CONFIDENCE|ROOT_CAUSE|AFFECTED_FILES|AFFECTED_SERVICES):|\n\n|$)/s);

    return {
      rootCause: rootCauseMatch?.[1]?.trim() || 'Unable to determine root cause',
      confidenceScore: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.0,
      affectedFiles: filesMatch?.[1]?.trim().split(',').map((f) => f.trim()).filter(Boolean) || [],
      affectedServices: servicesMatch?.[1]?.trim().split(',').map((s) => s.trim()).filter(Boolean) || [],
      suggestedFix: fixMatch?.[1]?.trim() || 'No fix suggested',
    };
  }
}
