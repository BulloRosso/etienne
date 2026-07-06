import { Injectable, Logger } from '@nestjs/common';
import { MockTrackerAdapter } from './mock-tracker.adapter';
import { TtRepository } from '../graph/tt-repository';
import { TtSnapshotService } from '../graph/tt-snapshot';
import { TtEventsService } from '../events.service';
import { LifecycleService } from '../lifecycle.service';
import { SearchProjectionService } from '../search-projection.service';
import { TrackerIssue } from '../types/tendertrace-types';

/**
 * Local issue mirror (spec §3.2): mirrors tracker issues into the graph's
 * tracker graph (rewritten on sync — the only non-append-only graph, §11.3)
 * and into the search projection, then re-derives implementation status.
 * The tracker itself is never the requirement store.
 */
@Injectable()
export class TrackerMirrorService {
  private readonly logger = new Logger(TrackerMirrorService.name);

  constructor(
    private readonly adapter: MockTrackerAdapter,
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly events: TtEventsService,
    private readonly lifecycle: LifecycleService,
    private readonly projections: SearchProjectionService,
  ) {
    this.adapter.onIssueChanged((project, issue) => {
      void this.onIssueChanged(project, issue);
    });
  }

  /** Full reconciliation: adapter → mirror graph + projection → status derivation. */
  async sync(project: string): Promise<{ issues: number }> {
    const issues = await this.adapter.listIssues(project);
    await this.repository.rewriteTrackerMirror(project, issues);
    for (const issue of issues) {
      await this.projections.indexIssue(project, issue);
    }
    this.snapshots.invalidate(project);
    await this.lifecycle.recompute(project);
    await this.events.emit(project, 'tracker.synced', { issues: issues.length });
    return { issues: issues.length };
  }

  private async onIssueChanged(project: string, issue: TrackerIssue): Promise<void> {
    // near-real-time path: rewrite mirror entry + recompute affected requirements
    const issues = await this.adapter.listIssues(project);
    await this.repository.rewriteTrackerMirror(project, issues);
    await this.projections.indexIssue(project, issue);
    this.snapshots.invalidate(project);

    const links = await this.repository.listLinks(project, { issueKey: issue.key });
    const affected = new Set(links.map((link) => link.requirementId));
    for (const reqId of affected) {
      await this.lifecycle.recompute(project, reqId);
    }
    await this.events.emit(project, 'issue.changed', {
      issueKey: issue.key,
      status: issue.status,
      statusCategory: issue.statusCategory,
      affectedRequirements: [...affected],
    });
  }
}
