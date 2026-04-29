import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';

/**
 * Maps Foundry-provided session IDs to internal project directories
 * and Etienne session IDs.
 *
 * Foundry sends a `x-session-id` header per conversation. Each Foundry
 * session maps to a dedicated project directory under the workspace root.
 */
@Injectable()
export class FoundrySessionService {
  private readonly logger = new Logger(FoundrySessionService.name);
  private readonly workspaceRoot: string;

  /**
   * session-id  →  { projectDir, etienneSessionId }
   * Kept in-memory; Foundry guarantees sticky routing within a microVM.
   */
  private readonly sessions = new Map<
    string,
    { projectDir: string; etienneSessionId?: string }
  >();

  constructor() {
    this.workspaceRoot =
      process.env.WORKSPACE_ROOT || '/app/workspace';
  }

  /**
   * Resolve the project directory for a Foundry session.
   * On first encounter the session is mapped to a default project.
   */
  resolveProjectDir(foundrySessionId: string): string {
    const existing = this.sessions.get(foundrySessionId);
    if (existing) return existing.projectDir;

    // Default project for Foundry sessions.
    // The admin can pre-configure FOUNDRY_DEFAULT_PROJECT or we use a
    // dedicated "foundry" project directory.
    const defaultProject =
      process.env.FOUNDRY_DEFAULT_PROJECT || 'foundry';
    const projectDir = path.join(this.workspaceRoot, defaultProject);

    this.sessions.set(foundrySessionId, { projectDir });
    this.logger.log(
      `Mapped Foundry session '${foundrySessionId}' → ${projectDir}`,
    );
    return projectDir;
  }

  /** Store the Etienne-internal session ID once the orchestrator assigns one. */
  setEtienneSessionId(
    foundrySessionId: string,
    etienneSessionId: string,
  ): void {
    const entry = this.sessions.get(foundrySessionId);
    if (entry) {
      entry.etienneSessionId = etienneSessionId;
    }
  }

  /** Retrieve the Etienne session ID for a given Foundry session. */
  getEtienneSessionId(foundrySessionId: string): string | undefined {
    return this.sessions.get(foundrySessionId)?.etienneSessionId;
  }
}
