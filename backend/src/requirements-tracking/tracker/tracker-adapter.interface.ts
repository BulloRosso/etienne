import { TrackerIssue } from '../types/tendertrace-types';

/**
 * Tracker adapter seam (spec §3.2 TrackerModule): the tracker is never the
 * requirement store — links and statuses live on our side so the product works
 * with any tracker. Adapter #1 is the seeded mock; a real Jira Cloud adapter
 * (REST + webhooks + nightly reconciliation) plugs in behind the same
 * interface later. Write-back is limited to non-invasive operations.
 */
export interface TrackerAdapter {
  readonly kind: string;

  /** Full issue list for reconciliation into the local mirror. */
  listIssues(project: string): Promise<TrackerIssue[]>;

  getIssue(project: string, key: string): Promise<TrackerIssue | null>;

  /** Non-invasive write-back: add a label (e.g. REQ-047). */
  addLabel(project: string, key: string, label: string): Promise<void>;

  /** Non-invasive write-back: post a human-approved comment (stale notices). */
  addComment(project: string, key: string, author: string, body: string): Promise<void>;

  /** Subscribe to issue-changed events (webhook equivalent). */
  onIssueChanged(handler: (project: string, issue: TrackerIssue) => void): void;
}
