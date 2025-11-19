import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface Skill {
  name: string;
  content: string;
}

export interface SkillWithProject {
  name: string;
  project: string;
  isFromCurrentProject: boolean;
}

@Injectable()
export class SkillsService {
  private readonly workspaceDir = path.resolve(process.cwd(), '../workspace');

  /**
   * Get the skills directory path for a project
   */
  private getSkillsDir(project: string): string {
    return path.join(this.workspaceDir, project, '.claude', 'skills');
  }

  /**
   * Get the path to a specific skill's SKILL.md file
   */
  private getSkillPath(project: string, skillName: string): string {
    return path.join(this.getSkillsDir(project), skillName, 'SKILL.md');
  }

  /**
   * Ensure the skills directory exists
   */
  private async ensureSkillsDir(project: string): Promise<void> {
    const skillsDir = this.getSkillsDir(project);
    try {
      await fs.access(skillsDir);
    } catch {
      await fs.mkdir(skillsDir, { recursive: true });
    }
  }

  /**
   * List all skills for a project
   */
  async listSkills(project: string): Promise<string[]> {
    const skillsDir = this.getSkillsDir(project);

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skills = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      return skills;
    } catch (error) {
      // Return empty array if directory doesn't exist
      return [];
    }
  }

  /**
   * Get a specific skill's content
   */
  async getSkill(project: string, skillName: string): Promise<Skill> {
    const skillPath = this.getSkillPath(project, skillName);

    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      return { name: skillName, content };
    } catch (error) {
      throw new Error(`Skill '${skillName}' not found`);
    }
  }

  /**
   * Create or update a skill
   */
  async saveSkill(project: string, skillName: string, content: string): Promise<Skill> {
    // Validate skill name (only lowercase letters, numbers, hyphens)
    if (!/^[a-z0-9-]+$/.test(skillName)) {
      throw new Error('Skill name can only contain lowercase letters, numbers, and hyphens');
    }

    await this.ensureSkillsDir(project);

    const skillDir = path.join(this.getSkillsDir(project), skillName);
    const skillPath = this.getSkillPath(project, skillName);

    // Create skill directory if it doesn't exist
    try {
      await fs.access(skillDir);
    } catch {
      await fs.mkdir(skillDir, { recursive: true });
    }

    // Write SKILL.md file
    await fs.writeFile(skillPath, content, 'utf-8');

    return { name: skillName, content };
  }

  /**
   * Delete a skill
   */
  async deleteSkill(project: string, skillName: string): Promise<void> {
    const skillDir = path.join(this.getSkillsDir(project), skillName);

    try {
      await fs.rm(skillDir, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Failed to delete skill '${skillName}'`);
    }
  }

  /**
   * List all projects in the workspace
   */
  private async listProjects(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.workspaceDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      return [];
    }
  }

  /**
   * List all skills across all projects with project information
   */
  async listAllSkills(currentProject: string): Promise<SkillWithProject[]> {
    const projects = await this.listProjects();
    const allSkills: SkillWithProject[] = [];
    const currentProjectSkillNames = new Set<string>();

    // First, collect all skills from current project
    const currentSkills = await this.listSkills(currentProject);
    for (const skillName of currentSkills) {
      currentProjectSkillNames.add(skillName);
      allSkills.push({
        name: skillName,
        project: currentProject,
        isFromCurrentProject: true,
      });
    }

    // Then, collect skills from other projects (excluding duplicates)
    for (const project of projects) {
      if (project === currentProject) continue;

      const skills = await this.listSkills(project);
      for (const skillName of skills) {
        // Only add if not already in current project
        if (!currentProjectSkillNames.has(skillName)) {
          allSkills.push({
            name: skillName,
            project,
            isFromCurrentProject: false,
          });
        }
      }
    }

    // Sort: current project skills first, then by skill name
    return allSkills.sort((a, b) => {
      if (a.isFromCurrentProject && !b.isFromCurrentProject) return -1;
      if (!a.isFromCurrentProject && b.isFromCurrentProject) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Copy a skill from another project to the current project
   */
  async copySkill(
    fromProject: string,
    toProject: string,
    skillName: string,
  ): Promise<Skill> {
    const sourceSkillDir = path.join(this.getSkillsDir(fromProject), skillName);
    const targetSkillDir = path.join(this.getSkillsDir(toProject), skillName);

    // Check if source skill exists
    try {
      await fs.access(sourceSkillDir);
    } catch {
      throw new Error(`Skill '${skillName}' not found in project '${fromProject}'`);
    }

    // Check if target skill already exists
    try {
      await fs.access(targetSkillDir);
      throw new Error(`Skill '${skillName}' already exists in project '${toProject}'`);
    } catch (error) {
      // Target doesn't exist, which is what we want
      if (error.message && error.message.includes('already exists')) {
        throw error;
      }
    }

    // Ensure target skills directory exists
    await this.ensureSkillsDir(toProject);

    // Copy the entire skill directory
    await this.copyDirectory(sourceSkillDir, targetSkillDir);

    // Read and return the skill content
    const skillPath = this.getSkillPath(toProject, skillName);
    const content = await fs.readFile(skillPath, 'utf-8');

    return { name: skillName, content };
  }

  /**
   * Recursively copy a directory
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }
}
