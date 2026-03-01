export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IssuePriority = 'P0' | 'P1' | 'P2' | 'P3';

export type IssueStatus =
  | 'OPEN'
  | 'APPROVED'
  | 'REJECTED'
  | 'DIAGNOSING'
  | 'DIAGNOSED'
  | 'PATCH_PENDING'
  | 'PATCHING'
  | 'VERIFYING'
  | 'RESOLVED'
  | 'FAILED'
  | 'ESCALATED';

export type AutonomyLevel = 0 | 1 | 2 | 3;

export interface IssueComment {
  id: string;
  author: string;
  role: 'USER' | 'ADMIN' | 'AGENT';
  content: string;
  createdAt: string;
}

export interface FileSnapshot {
  filePath: string;
  originalContent: string;
  patchedContent: string;
  snapshotAt: string;
}

export interface SelfHealingIssue {
  // Identification
  id: string;
  number: number;
  title: string;

  // Reported by user
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  reportedBy: string;

  // Set by admin
  severity: IssueSeverity;
  priority: IssuePriority;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;

  // Status lifecycle
  status: IssueStatus;

  // Filled by diagnostic agent
  rootCause?: string;
  affectedFiles?: string[];
  affectedServices?: string[];
  confidenceScore?: number;
  diagnosticLog?: string;

  // Filled by patch agent
  patchDiff?: string;
  patchRationale?: string;
  filesModified?: FileSnapshot[];
  servicesRestarted?: string[];

  // Verification
  verificationResult?: 'PASS' | 'FAIL';
  verificationDetails?: string;
  rolledBack?: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  timeToResolve?: number;

  // Relations
  comments: IssueComment[];
  relatedIssueIds: string[];
}

export interface SelfHealingConfig {
  autonomyLevel: AutonomyLevel;
}

/**
 * Valid status transitions for the issue state machine.
 */
export const VALID_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  OPEN: ['APPROVED', 'REJECTED'],
  APPROVED: ['DIAGNOSING'],
  REJECTED: [],
  DIAGNOSING: ['DIAGNOSED', 'ESCALATED'],
  DIAGNOSED: ['PATCH_PENDING', 'PATCHING', 'ESCALATED'],
  PATCH_PENDING: ['PATCHING', 'REJECTED'],
  PATCHING: ['VERIFYING', 'FAILED'],
  VERIFYING: ['RESOLVED', 'FAILED'],
  RESOLVED: [],
  FAILED: ['ESCALATED', 'OPEN'],
  ESCALATED: ['OPEN'],
};
