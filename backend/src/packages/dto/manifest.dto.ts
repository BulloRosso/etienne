/**
 * Agent Package Manifest — the human-edited intent of a package.
 *
 * A manifest captures *what* to compose (selections from the five catalogs).
 * Pair it with a lockfile (see lockfile.dto.ts) for a reproducible build.
 */

export interface ManifestAgentRole {
  type: 'registry' | 'custom';
  roleId?: string;
  customContent?: string;
}

export interface ManifestApplicationType {
  id: string;
  /** Semver range or "pinned" (= current catalog version). */
  version?: string;
}

export interface ManifestTemplate {
  name: string;
}

export interface ManifestSkill {
  name: string;
  source: 'standard' | 'optional';
  version?: string;
}

export interface ManifestSubagent {
  name: string;
  source: 'standard' | 'optional';
  version?: string;
}

/**
 * One MCP server selection. `config` is the raw McpServerConfig shape that
 * gets written to .mcp.json (command/args/url/headers/env) — kept open so the
 * composer can pass placeholder values that the registry would have resolved.
 *
 * For zip exports the manifest must hold UNRESOLVED placeholders so secrets
 * don't leak into the distributable.
 */
export interface ManifestMcpServer {
  name: string;
  config: Record<string, unknown>;
  /** User-provided bindings for placeholder env vars / secrets. */
  envBindings?: Record<string, string>;
}

/**
 * Extra workspace files to bundle alongside the catalog-derived items.
 *
 * Used by the "Promote project to package" flow: admin ticks files in the
 * project's file explorer (data/, custom docs, templates, etc.) and those
 * paths land here. The builder copies them from `sourceProject` into the
 * zip at the same relative paths; on Deploy/Import they end up under
 * /workspace/<new-name>/<path>.
 */
export interface ManifestExtraFiles {
  /** Workspace project to copy from at build time. */
  sourceProject: string;
  /** Project-relative POSIX paths (e.g. "data/seed.json", "docs/onboarding.md"). */
  paths: string[];
}

export interface PackageManifest {
  schemaVersion: 1;
  /** Package identifier (kebab-case). Also used as the project name on deploy. */
  name: string;
  /** Display name shown in the agent's UI. */
  agentName?: string;
  language?: string;
  missionBrief?: string;
  agentRole?: ManifestAgentRole;
  /** Single, required for a deployable package. */
  applicationType?: ManifestApplicationType;
  template?: ManifestTemplate;
  skills: ManifestSkill[];
  subagents: ManifestSubagent[];
  mcpServers: ManifestMcpServer[];
  /** A2A agent configs are passthrough — schema lives in a2a-settings. */
  a2aAgents?: unknown[];
  /** When set, the materializer copies UI config from this existing project. */
  copyUIFrom?: string;
  /** Extra files bundled from a source project — see ManifestExtraFiles. */
  extraFiles?: ManifestExtraFiles;
}
