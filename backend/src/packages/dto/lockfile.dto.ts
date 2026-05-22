/**
 * Agent Package Lockfile — the resolved, version-pinned, hashed set of items
 * derived from a manifest. Two manifests + the same catalog state produce
 * identical lockfiles; identical lockfiles materialize to identical .claude/
 * trees.
 */

export type LockItemKind =
  | 'application-type'
  | 'skill'
  | 'subagent'
  | 'mcp-server'
  | 'template'
  | 'agent-role';

/**
 * Why an item ended up in the lockfile.
 * - `user`            — directly selected in the manifest
 * - `application-type` — bundled (e.g. subagents from <appType>/subagents/)
 * - `skill`           — pulled in via another skill's .dependencies.json
 */
export type ProvenanceRequester =
  | { kind: 'user' }
  | { kind: 'application-type'; name: string }
  | { kind: 'skill'; name: string };

export interface LockItemProvenance {
  requestedBy: ProvenanceRequester;
  /** Short, human-readable reason. e.g. "bundled-by-app-type", "user-selected". */
  reason: string;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Stable code so the frontend can localize / link to docs. */
  code: string;
  message: string;
  /** Optional pointer to the item that caused the issue. */
  ref?: { kind: LockItemKind; name: string };
}

export interface SkillDependencyContributions {
  /** Event rules merged into .etienne/event-handling.json. */
  eventRules?: unknown[];
  /** Prompts merged into .etienne/prompts.json. */
  prompts?: unknown[];
  /** Required binaries — surfaced as warnings, not auto-installed. */
  binaries?: Array<{ name: string; packageManager: 'npm' | 'pypi' }>;
  /** Required env vars — surfaced as warnings. */
  envVars?: Array<{ name: string; description: string; exampleFormat?: string }>;
}

export interface LockItem {
  kind: LockItemKind;
  name: string;
  source?: 'standard' | 'optional';
  /** Resolved version (e.g. catalog .metadata.json version or "unversioned"). */
  resolvedVersion: string;
  /** sha256 of the source directory contents — sorted file list. */
  contentHash: string;
  provenance: LockItemProvenance;
  /** For skills only — the side-effects their .dependencies.json contributes. */
  dependencyContributions?: SkillDependencyContributions;
  /** For mcp-server only — list of unresolved placeholder tokens (e.g. "${env:GH_TOKEN}"). */
  unboundPlaceholders?: string[];
}

export interface PackageLockfile {
  schemaVersion: 1;
  generatedAt: string;
  /** sha256 of the canonical manifest JSON. */
  manifestHash: string;
  items: LockItem[];
  /** Blocking issues that must be resolved before a build can succeed. */
  conflicts: ValidationIssue[];
  /** Non-blocking issues. */
  warnings: ValidationIssue[];
}
