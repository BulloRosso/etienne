import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CodingAgentConfigurationService } from '../coding-agent-configuration/coding-agent-configuration.service';
import { interpolatePromptVars, PromptVars } from './prompt-interpolation';

export interface MissionUserContext {
  username?: string;
  role?: 'guest' | 'user' | 'admin';
  displayName?: string;
}

/**
 * Renders per-request, user-specific mission files.
 *
 * If a project ships a templated mission (`.claude/CLAUDE.md.tpl` or
 * `CLAUDE.md.tpl` at the project root — matching whichever path the active
 * coding agent reads from), the loader interpolates user vars and writes
 * the result to the corresponding non-`.tpl` file *before* the SDK runs.
 *
 * The Claude Code SDK reads `.claude/CLAUDE.md` from disk directly, so the
 * only universally-portable injection point is to keep that file fresh.
 * Other orchestrators (OpenAI Agents, Codex, OpenCode) read the mission
 * themselves before passing it to their SDK — same on-disk file works for
 * them too.
 *
 * Projects without a `.tpl` file are untouched — backwards compatible with
 * every existing seed and any hand-authored static `CLAUDE.md`.
 *
 * Concurrency: a per-project mutex serialises renders so two simultaneous
 * chat requests for the same project (two different users in two tabs)
 * never half-overwrite each other's file. Renders are cheap (one read +
 * one write) so the lock is held briefly.
 */
@Injectable()
export class MissionLoaderService {
  private readonly logger = new Logger(MissionLoaderService.name);
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly codingAgentConfig: CodingAgentConfigurationService,
  ) {}

  /**
   * Render templated mission for a project as a specific user.
   *
   * `projectRoot` should be the absolute path to the workspace project
   * directory (e.g. `/workspace/lumitec-led-headlight-onboarding`).
   *
   * Idempotent and safe to call on every chat request. Returns silently
   * when there is no `.tpl` file to render.
   */
  async renderForUser(projectRoot: string, user: MissionUserContext | null): Promise<void> {
    const missionFileName = this.codingAgentConfig.getMissionFileName();
    const agentConfigDir = this.codingAgentConfig.getAgentConfigDir();

    const candidates = [
      path.join(projectRoot, agentConfigDir, missionFileName),
      path.join(projectRoot, missionFileName),
    ];

    const vars: PromptVars = {
      user_name: user?.username ?? '',
      user_role: user?.role ?? '',
      user_display_name: user?.displayName ?? user?.username ?? '',
    };

    // Serialise per-project so concurrent requests don't race the write.
    const lockKey = projectRoot;
    const previous = this.locks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(lockKey, previous.then(() => next));

    try {
      await previous;
      for (const target of candidates) {
        const tplPath = `${target}.tpl`;
        try {
          const tpl = await fs.readFile(tplPath, 'utf8');
          const rendered = interpolatePromptVars(tpl, vars);
          await fs.writeFile(target, rendered, 'utf8');
          this.logger.debug(
            `Rendered ${path.basename(tplPath)} → ${path.basename(target)} for ${vars.user_name || '<anonymous>'} (role=${vars.user_role || 'unknown'})`,
          );
        } catch (err: any) {
          if (err?.code !== 'ENOENT') {
            this.logger.warn(`Mission render failed for ${tplPath}: ${err.message}`);
          }
          // No template at this candidate — try the next one.
        }
      }
    } finally {
      release();
      // Clean up the map entry when we are the tail of the chain.
      if (this.locks.get(lockKey) === previous.then(() => next)) {
        this.locks.delete(lockKey);
      }
    }
  }
}
