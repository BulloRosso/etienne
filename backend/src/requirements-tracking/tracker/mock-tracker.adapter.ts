import { Injectable, Logger } from '@nestjs/common';
import { TtFilesService } from '../store/files.service';
import { TrackerAdapter } from './tracker-adapter.interface';
import { TrackerIssue } from '../types/tendertrace-types';

const SEED_FILE = 'tracker/seed-issues.json';

/**
 * Mock tracker (user decision: seeded issues instead of a real Jira).
 * Source of truth is requirements-tracking/tracker/seed-issues.json inside the
 * project; the seed script writes it and demos drive status transitions via
 * simulateEvent (rt_simulate_issue_event) — the webhook equivalent.
 */
@Injectable()
export class MockTrackerAdapter implements TrackerAdapter {
  readonly kind = 'mock';
  private readonly logger = new Logger(MockTrackerAdapter.name);
  private handlers: Array<(project: string, issue: TrackerIssue) => void> = [];

  constructor(private readonly files: TtFilesService) {}

  private async read(project: string): Promise<TrackerIssue[]> {
    try {
      return await this.files.readJson<TrackerIssue[]>(project, SEED_FILE);
    } catch {
      return [];
    }
  }

  private async write(project: string, issues: TrackerIssue[]): Promise<void> {
    await this.files.writeJson(project, SEED_FILE, issues);
  }

  async listIssues(project: string): Promise<TrackerIssue[]> {
    return this.read(project);
  }

  async getIssue(project: string, key: string): Promise<TrackerIssue | null> {
    const issues = await this.read(project);
    return issues.find((issue) => issue.key === key) ?? null;
  }

  async addLabel(project: string, key: string, label: string): Promise<void> {
    const issues = await this.read(project);
    const issue = issues.find((entry) => entry.key === key);
    if (!issue) return;
    if (!issue.labels.includes(label)) {
      issue.labels.push(label);
      issue.updatedAt = new Date().toISOString();
      await this.write(project, issues);
    }
  }

  async addComment(project: string, key: string, author: string, body: string): Promise<void> {
    const issues = await this.read(project);
    const issue = issues.find((entry) => entry.key === key);
    if (!issue) return;
    issue.comments.push({ author, date: new Date().toISOString(), body });
    issue.updatedAt = new Date().toISOString();
    await this.write(project, issues);
  }

  onIssueChanged(handler: (project: string, issue: TrackerIssue) => void): void {
    this.handlers.push(handler);
  }

  /** Seed-only: replace the whole issue set. */
  async seedIssues(project: string, issues: TrackerIssue[]): Promise<void> {
    await this.write(project, issues);
  }

  /** Demo webhook: change an issue's status and notify subscribers. */
  async simulateEvent(
    project: string,
    key: string,
    change: { status?: string; statusCategory?: TrackerIssue['statusCategory']; comment?: string },
  ): Promise<TrackerIssue | null> {
    const issues = await this.read(project);
    const issue = issues.find((entry) => entry.key === key);
    if (!issue) return null;
    if (change.status) issue.status = change.status;
    if (change.statusCategory) issue.statusCategory = change.statusCategory;
    if (change.comment) {
      issue.comments.push({ author: 'mock', date: new Date().toISOString(), body: change.comment });
    }
    issue.updatedAt = new Date().toISOString();
    await this.write(project, issues);
    for (const handler of this.handlers) handler(project, issue);
    return issue;
  }
}
