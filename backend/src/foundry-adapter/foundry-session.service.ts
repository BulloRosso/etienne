import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';

interface SessionMapping {
  projectDir: string;
  etienneSessionId?: string;
}

/**
 * Maps Foundry-provided session IDs to internal project directories
 * and Etienne session IDs.
 *
 * Foundry sends a `x-session-id` header per conversation. Each Foundry
 * session maps to a dedicated project directory under the workspace root.
 *
 * ## Scale-to-zero resilience
 *
 * Foundry kills the microVM after ~15 min idle and restarts it on the
 * next request. The persistent filesystem (`$HOME`, `/files`) survives,
 * but in-memory state is lost. This service persists session mappings
 * to disk so they can be recovered after a cold start.
 */
@Injectable()
export class FoundrySessionService implements OnModuleInit {
  private readonly logger = new Logger(FoundrySessionService.name);
  private readonly workspaceRoot: string;
  private readonly mappingFile: string;

  private readonly sessions = new Map<string, SessionMapping>();

  constructor() {
    this.workspaceRoot =
      process.env.WORKSPACE_ROOT || '/app/workspace';
    this.mappingFile = path.join(
      this.workspaceRoot,
      '.foundry-sessions.json',
    );
  }

  async onModuleInit() {
    await this.loadFromDisk();
  }

  /**
   * Resolve the project directory for a Foundry session.
   * On first encounter the session is mapped to a default project.
   */
  resolveProjectDir(foundrySessionId: string): string {
    const existing = this.sessions.get(foundrySessionId);
    if (existing) return existing.projectDir;

    const defaultProject =
      process.env.FOUNDRY_DEFAULT_PROJECT || 'foundry';
    const projectDir = path.join(this.workspaceRoot, defaultProject);

    this.sessions.set(foundrySessionId, { projectDir });
    this.logger.log(
      `Mapped Foundry session '${foundrySessionId}' → ${projectDir}`,
    );
    this.persistToDisk();
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
      this.persistToDisk();
    }
  }

  /** Retrieve the Etienne session ID for a given Foundry session. */
  getEtienneSessionId(foundrySessionId: string): string | undefined {
    return this.sessions.get(foundrySessionId)?.etienneSessionId;
  }

  // ─── Disk persistence ──────────────────────────────────────────────

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.mappingFile, 'utf-8');
      const entries: Record<string, SessionMapping> = JSON.parse(raw);
      for (const [id, mapping] of Object.entries(entries)) {
        this.sessions.set(id, mapping);
      }
      this.logger.log(
        `Recovered ${this.sessions.size} Foundry session mapping(s) from disk`,
      );
    } catch {
      // File doesn't exist on first boot — that's fine.
    }
  }

  private persistToDisk(): void {
    const data: Record<string, SessionMapping> = {};
    for (const [id, mapping] of this.sessions) {
      data[id] = mapping;
    }
    fs.writeFile(this.mappingFile, JSON.stringify(data, null, 2), 'utf-8').catch(
      (err) =>
        this.logger.warn(
          `Failed to persist Foundry session mappings: ${err.message}`,
        ),
    );
  }
}
