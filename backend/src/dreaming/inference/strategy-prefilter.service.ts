import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { safeRoot } from '../../claude/utils/path.utils';
import { DreamingCollectionsService } from '../chroma/dreaming-collections.service';

/**
 * Voyager-style "skill indexed by description" pre-filter.
 *
 * When the inference path is about to load strategy SKILL.md cards from
 * `<project>/.claude/skills/strategies/`, it can ask this service for the
 * top-k semantically relevant ones for the user's query. Below a threshold
 * (default 20) of total strategy cards, we just return all of them — embedding
 * lookup is overhead we don't need at small N.
 *
 * The integration point is intentionally minimal: this service exposes a single
 * `selectRelevantSkillNames` method. Callers (e.g. SkillsService.listSkills) can
 * opt in when they have a query context; otherwise they keep the existing behavior.
 */
@Injectable()
export class StrategyPrefilterService {
  private readonly logger = new Logger(StrategyPrefilterService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
  private readonly threshold = Number(process.env.DREAMING_PREFILTER_THRESHOLD || 20);

  constructor(private readonly chroma: DreamingCollectionsService) {}

  /**
   * Returns names of strategy skills that should be loaded for the given query.
   * If the project has fewer than `threshold` strategy skills, returns all of them.
   * Returns an empty array on any error (caller should fall back to all skills).
   */
  async selectRelevantSkillNames(project: string, query: string, k = 5): Promise<string[]> {
    const allStrategySkills = await this.listAllStrategySkills(project);
    if (allStrategySkills.length === 0) return [];
    if (allStrategySkills.length <= this.threshold) return allStrategySkills;

    try {
      const hits = await this.chroma.searchStrategies(project, query, k, 0);
      const names = hits
        .filter((h) => h.metadata?.status !== 'deprecated')
        .map((h) => h.metadata?.skill_name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      if (names.length > 0) return names;
      this.logger.warn(`[${project}] Pre-filter returned no hits, falling back to all ${allStrategySkills.length} strategies`);
      return allStrategySkills;
    } catch (err: any) {
      this.logger.warn(`[${project}] Pre-filter failed (${err.message}), falling back to all strategies`);
      return allStrategySkills;
    }
  }

  /**
   * Walk <project>/.claude/skills/strategies/<domain>/<id>/SKILL.md, return the
   * skill ids (the directory name, which equals the SKILL.md frontmatter `name`).
   */
  private async listAllStrategySkills(project: string): Promise<string[]> {
    const root = join(safeRoot(this.workspaceRoot, project), '.claude', 'skills', 'strategies');
    let domains: string[];
    try { domains = await fs.readdir(root); } catch { return []; }

    const out: string[] = [];
    for (const domain of domains) {
      let ids: string[];
      try {
        const stat = await fs.stat(join(root, domain));
        if (!stat.isDirectory()) continue;
        ids = await fs.readdir(join(root, domain));
      } catch { continue; }
      for (const id of ids) {
        try {
          const skillPath = join(root, domain, id, 'SKILL.md');
          const stat = await fs.stat(skillPath);
          if (stat.isFile()) out.push(id);
        } catch { /* skip non-skill entries (e.g. log.md) */ }
      }
    }
    return out;
  }
}
