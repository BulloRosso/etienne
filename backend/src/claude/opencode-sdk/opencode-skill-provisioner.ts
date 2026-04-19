import { Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Ensures project skills from `.claude/skills/` are available at
 * `.opencode/skills/` so OpenCode's native skill tool can discover them.
 *
 * OpenCode looks for skills in `.opencode/skills/<name>/SKILL.md` and
 * falls back to `.claude/skills/<name>/SKILL.md`. Since OpenCode supports
 * the `.claude/skills/` fallback natively, this provisioner only needs to
 * ensure the skills exist in at least one of those locations.
 *
 * The provisioner:
 * 1. Checks if `.claude/skills/` exists and has skills
 * 2. If OpenCode can't read `.claude/skills/` (e.g. different config dir),
 *    copies skills to `.opencode/skills/`
 * 3. Skips skills that already exist in the target location
 */
export async function provisionSkillsForOpenCode(opts: {
  logger: Logger;
  projectRoot: string;
}): Promise<{ provisioned: string[] }> {
  const { logger, projectRoot } = opts;
  const provisioned: string[] = [];

  const claudeSkillsDir = path.join(projectRoot, '.claude', 'skills');
  const openCodeSkillsDir = path.join(projectRoot, '.opencode', 'skills');

  // Check if .claude/skills/ exists
  if (!(await fs.pathExists(claudeSkillsDir))) {
    logger.debug('No .claude/skills/ directory found, skipping skill provisioning');
    return { provisioned };
  }

  // Read available skills from .claude/skills/
  let skillDirs: string[];
  try {
    const entries = await fs.readdir(claudeSkillsDir, { withFileTypes: true });
    skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    logger.debug('Failed to read .claude/skills/, skipping');
    return { provisioned };
  }

  if (skillDirs.length === 0) {
    return { provisioned };
  }

  // Ensure .opencode/skills/ exists
  await fs.ensureDir(openCodeSkillsDir);

  for (const skillName of skillDirs) {
    const src = path.join(claudeSkillsDir, skillName);
    const dest = path.join(openCodeSkillsDir, skillName);

    // Skip if already exists in OpenCode skills dir
    if (await fs.pathExists(dest)) {
      continue;
    }

    try {
      await fs.copy(src, dest, { overwrite: false });
      provisioned.push(skillName);
      logger.debug(`Provisioned skill '${skillName}' to .opencode/skills/`);
    } catch (err: any) {
      logger.warn(`Failed to provision skill '${skillName}': ${err?.message}`);
    }
  }

  if (provisioned.length > 0) {
    logger.log(`Provisioned ${provisioned.length} skills to .opencode/skills/: ${provisioned.join(', ')}`);
  }

  return { provisioned };
}
