import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  SelfHealingIssue,
  SelfHealingConfig,
  IssueComment,
  IssueStatus,
  IssueSeverity,
  IssuePriority,
  AutonomyLevel,
  VALID_TRANSITIONS,
} from './interfaces/issue.interface';
import { EventRouterService } from '../event-handling/core/event-router.service';

interface IssuesData {
  issues: SelfHealingIssue[];
}

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  /** Per-project write locks to prevent concurrent read-modify-write corruption */
  private writeLocks = new Map<string, Promise<void>>();

  constructor(private readonly eventRouter: EventRouterService) {}

  /**
   * Serialize write operations per project to prevent race conditions.
   */
  private async withLock<T>(projectName: string, fn: () => Promise<T>): Promise<T> {
    const key = projectName;
    const previous = this.writeLocks.get(key) ?? Promise.resolve();

    let resolve!: () => void;
    const next = new Promise<void>((r) => {
      resolve = r;
    });
    this.writeLocks.set(key, next);

    try {
      await previous;
      return await fn();
    } finally {
      resolve();
    }
  }

  private getProjectDir(projectName: string): string {
    return join(this.workspaceDir, projectName);
  }

  private getEtienneDir(projectName: string): string {
    return join(this.getProjectDir(projectName), '.etienne');
  }

  private getIssuesFilePath(projectName: string): string {
    return join(this.getEtienneDir(projectName), 'issues.json');
  }

  private getConfigFilePath(projectName: string): string {
    return join(this.getEtienneDir(projectName), 'self-healing-config.json');
  }

  /**
   * Load all issues for a project
   */
  async loadIssues(projectName: string): Promise<IssuesData> {
    try {
      const content = await fs.readFile(this.getIssuesFilePath(projectName), 'utf8');
      return JSON.parse(content);
    } catch {
      return { issues: [] };
    }
  }

  /**
   * Save issues data with atomic write
   */
  private async saveIssues(projectName: string, data: IssuesData): Promise<void> {
    const dir = this.getEtienneDir(projectName);
    await fs.mkdir(dir, { recursive: true });
    const filePath = this.getIssuesFilePath(projectName);
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  /**
   * Validate a status transition
   */
  private validateTransition(from: IssueStatus, to: IssueStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Emit an event for issue status changes
   */
  private async emitEvent(
    projectName: string,
    eventName: string,
    issue: SelfHealingIssue,
  ): Promise<void> {
    try {
      await this.eventRouter.publishEvent({
        name: eventName,
        group: 'SelfHealing',
        source: 'IssuesService',
        projectName,
        payload: {
          issueId: issue.id,
          issueNumber: issue.number,
          title: issue.title,
          status: issue.status,
          severity: issue.severity,
          priority: issue.priority,
          reportedBy: issue.reportedBy,
        },
      });
    } catch (error: any) {
      this.logger.warn(`Failed to emit event ${eventName}: ${error.message}`);
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(
    projectName: string,
    dto: {
      title: string;
      description: string;
      stepsToReproduce?: string;
      expectedBehavior?: string;
      actualBehavior?: string;
    },
    userId: string,
  ): Promise<SelfHealingIssue> {
    return this.withLock(projectName, async () => {
      const data = await this.loadIssues(projectName);
      const nextNumber = data.issues.length > 0 ? Math.max(...data.issues.map((i) => i.number)) + 1 : 1;
      const now = new Date().toISOString();

      const issue: SelfHealingIssue = {
        id: randomUUID(),
        number: nextNumber,
        title: dto.title,
        description: dto.description,
        stepsToReproduce: dto.stepsToReproduce,
        expectedBehavior: dto.expectedBehavior,
        actualBehavior: dto.actualBehavior,
        reportedBy: userId,
        severity: 'MEDIUM',
        priority: 'P2',
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
        comments: [],
        relatedIssueIds: [],
      };

      data.issues.push(issue);
      await this.saveIssues(projectName, data);
      this.logger.log(`Issue #${issue.number} created in project ${projectName} by ${userId}`);

      await this.emitEvent(projectName, 'issue.created', issue);
      return issue;
    });
  }

  /**
   * List issues — user sees own, admin sees all
   */
  async listIssues(
    projectName: string,
    userId?: string,
    role?: string,
  ): Promise<SelfHealingIssue[]> {
    const data = await this.loadIssues(projectName);
    if (role === 'admin') {
      return data.issues;
    }
    return data.issues.filter((i) => i.reportedBy === userId);
  }

  /**
   * Get a single issue by ID
   */
  async getIssue(projectName: string, issueId: string): Promise<SelfHealingIssue | null> {
    const data = await this.loadIssues(projectName);
    return data.issues.find((i) => i.id === issueId) ?? null;
  }

  /**
   * Approve an issue (admin only)
   */
  async approveIssue(
    projectName: string,
    issueId: string,
    adminId: string,
  ): Promise<SelfHealingIssue> {
    return this.withLock(projectName, async () => {
      const data = await this.loadIssues(projectName);
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) throw new Error(`Issue ${issueId} not found`);
      if (!this.validateTransition(issue.status, 'APPROVED')) {
        throw new Error(`Cannot approve issue in status ${issue.status}`);
      }

      issue.status = 'APPROVED';
      issue.approvedBy = adminId;
      issue.approvedAt = new Date().toISOString();
      issue.updatedAt = new Date().toISOString();

      await this.saveIssues(projectName, data);
      this.logger.log(`Issue #${issue.number} approved by ${adminId}`);

      await this.emitEvent(projectName, 'issue.approved', issue);
      return issue;
    });
  }

  /**
   * Reject an issue (admin only)
   */
  async rejectIssue(
    projectName: string,
    issueId: string,
    adminId: string,
    reason: string,
  ): Promise<SelfHealingIssue> {
    return this.withLock(projectName, async () => {
      const data = await this.loadIssues(projectName);
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) throw new Error(`Issue ${issueId} not found`);
      if (!this.validateTransition(issue.status, 'REJECTED')) {
        throw new Error(`Cannot reject issue in status ${issue.status}`);
      }

      issue.status = 'REJECTED';
      issue.rejectionReason = reason;
      issue.updatedAt = new Date().toISOString();

      // Add system comment
      issue.comments.push({
        id: randomUUID(),
        author: adminId,
        role: 'ADMIN',
        content: `Issue rejected: ${reason}`,
        createdAt: new Date().toISOString(),
      });

      await this.saveIssues(projectName, data);
      this.logger.log(`Issue #${issue.number} rejected by ${adminId}`);

      await this.emitEvent(projectName, 'issue.rejected', issue);
      return issue;
    });
  }

  /**
   * Update priority and/or severity (admin only)
   */
  async updatePriority(
    projectName: string,
    issueId: string,
    severity?: IssueSeverity,
    priority?: IssuePriority,
  ): Promise<SelfHealingIssue> {
    return this.withLock(projectName, async () => {
      const data = await this.loadIssues(projectName);
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) throw new Error(`Issue ${issueId} not found`);

      if (severity) issue.severity = severity;
      if (priority) issue.priority = priority;
      issue.updatedAt = new Date().toISOString();

      await this.saveIssues(projectName, data);
      this.logger.log(`Issue #${issue.number} priority updated: severity=${severity}, priority=${priority}`);

      await this.emitEvent(projectName, 'issue.statusChanged', issue);
      return issue;
    });
  }

  /**
   * Add a comment to an issue
   */
  async addComment(
    projectName: string,
    issueId: string,
    author: string,
    role: 'USER' | 'ADMIN' | 'AGENT',
    content: string,
  ): Promise<SelfHealingIssue> {
    return this.withLock(projectName, async () => {
      const data = await this.loadIssues(projectName);
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) throw new Error(`Issue ${issueId} not found`);

      const comment: IssueComment = {
        id: randomUUID(),
        author,
        role,
        content,
        createdAt: new Date().toISOString(),
      };

      issue.comments.push(comment);
      issue.updatedAt = new Date().toISOString();

      await this.saveIssues(projectName, data);
      return issue;
    });
  }

  /**
   * Update issue status — internal method for agent services
   */
  async updateIssueStatus(
    projectName: string,
    issueId: string,
    newStatus: IssueStatus,
    updates?: Partial<SelfHealingIssue>,
  ): Promise<SelfHealingIssue> {
    return this.withLock(projectName, async () => {
      const data = await this.loadIssues(projectName);
      const issue = data.issues.find((i) => i.id === issueId);
      if (!issue) throw new Error(`Issue ${issueId} not found`);
      if (!this.validateTransition(issue.status, newStatus)) {
        throw new Error(`Invalid transition from ${issue.status} to ${newStatus}`);
      }

      issue.status = newStatus;
      issue.updatedAt = new Date().toISOString();

      if (newStatus === 'RESOLVED') {
        issue.resolvedAt = new Date().toISOString();
        if (issue.approvedAt) {
          issue.timeToResolve = Date.now() - new Date(issue.approvedAt).getTime();
        }
      }

      // Apply additional updates
      if (updates) {
        Object.assign(issue, updates, { status: newStatus, updatedAt: issue.updatedAt });
      }

      await this.saveIssues(projectName, data);
      this.logger.log(`Issue #${issue.number} status changed to ${newStatus}`);

      await this.emitEvent(projectName, 'issue.statusChanged', issue);
      return issue;
    });
  }

  /**
   * Get the autonomy level for a project
   */
  async getAutonomyLevel(projectName: string): Promise<SelfHealingConfig> {
    try {
      const content = await fs.readFile(this.getConfigFilePath(projectName), 'utf8');
      return JSON.parse(content);
    } catch {
      return { autonomyLevel: 0 };
    }
  }

  /**
   * Set the autonomy level for a project
   */
  async setAutonomyLevel(projectName: string, level: AutonomyLevel): Promise<SelfHealingConfig> {
    const config: SelfHealingConfig = { autonomyLevel: level };
    const dir = this.getEtienneDir(projectName);
    await fs.mkdir(dir, { recursive: true });
    const filePath = this.getConfigFilePath(projectName);
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
    this.logger.log(`Autonomy level set to ${level} for project ${projectName}`);
    return config;
  }
}
