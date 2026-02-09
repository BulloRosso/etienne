import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RepositorySkill, ProvisionResult } from './dto/repository-skills.dto';

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
   * Get the skill repository path with fallback to default
   */
  private getSkillRepositoryPath(): string {
    const envPath = process.env.SKILL_REPOSITORY;
    if (envPath) {
      try {
        // Check if the path exists synchronously is not ideal, but we need it for initialization
        // We'll validate asynchronously in the methods that use it
        return envPath;
      } catch {
        // Fallback to default
      }
    }
    return path.resolve(process.cwd(), '..', 'skill-repository');
  }

  /**
   * Get standard skills directory path
   */
  private getStandardSkillsDir(): string {
    return path.join(this.getSkillRepositoryPath(), 'standard');
  }

  /**
   * Get optional skills directory path
   */
  private getOptionalSkillsDir(): string {
    return path.join(this.getSkillRepositoryPath(), 'standard', 'optional');
  }

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
   * List extra files in a skill directory (everything except SKILL.md)
   */
  async listSkillFiles(project: string, skillName: string): Promise<string[]> {
    const skillDir = path.join(this.getSkillsDir(project), skillName);

    try {
      const entries = await fs.readdir(skillDir);
      return entries.filter((name) => name !== 'SKILL.md').sort();
    } catch {
      return [];
    }
  }

  /**
   * Upload a file into a skill directory
   */
  async uploadSkillFile(
    project: string,
    skillName: string,
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<void> {
    const skillDir = path.join(this.getSkillsDir(project), skillName);

    // Ensure skill directory exists
    await fs.mkdir(skillDir, { recursive: true });

    const filePath = path.join(skillDir, fileName);
    await fs.writeFile(filePath, fileBuffer);
  }

  /**
   * Delete a file from a skill directory
   */
  async deleteSkillFile(
    project: string,
    skillName: string,
    fileName: string,
  ): Promise<void> {
    if (fileName === 'SKILL.md') {
      throw new Error('Cannot delete the SKILL.md file');
    }

    const filePath = path.join(this.getSkillsDir(project), skillName, fileName);
    await fs.unlink(filePath);
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

  /**
   * Check if the skill repository is available
   */
  async isRepositoryAvailable(): Promise<boolean> {
    try {
      await fs.access(this.getSkillRepositoryPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List skills from the skill repository
   * @param includeOptional - If true, also includes skills from the optional folder
   */
  async listRepositorySkills(includeOptional: boolean = false): Promise<RepositorySkill[]> {
    const skills: RepositorySkill[] = [];
    const standardDir = this.getStandardSkillsDir();
    const optionalDir = this.getOptionalSkillsDir();

    // List standard skills (excluding the 'optional' subdirectory)
    try {
      const entries = await fs.readdir(standardDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'optional') {
          const description = await this.getSkillDescription(
            path.join(standardDir, entry.name),
          );
          skills.push({
            name: entry.name,
            source: 'standard',
            description,
          });
        }
      }
    } catch (error) {
      // Standard directory doesn't exist or is not accessible
    }

    // List optional skills if requested
    if (includeOptional) {
      try {
        const entries = await fs.readdir(optionalDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const description = await this.getSkillDescription(
              path.join(optionalDir, entry.name),
            );
            skills.push({
              name: entry.name,
              source: 'optional',
              description,
            });
          }
        }
      } catch (error) {
        // Optional directory doesn't exist or is not accessible
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Extract description from a skill's SKILL.md file (first paragraph or first 200 chars)
   */
  private async getSkillDescription(skillDir: string): Promise<string | undefined> {
    try {
      const skillPath = path.join(skillDir, 'SKILL.md');
      const content = await fs.readFile(skillPath, 'utf-8');

      // Skip the title line if it starts with #
      const lines = content.split('\n');
      let startIndex = 0;
      if (lines[0]?.startsWith('#')) {
        startIndex = 1;
      }

      // Find the first non-empty paragraph
      let description = '';
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith('#')) {
          description = line;
          break;
        }
      }

      // Truncate if too long
      if (description.length > 200) {
        description = description.substring(0, 197) + '...';
      }

      return description || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Provision all standard skills to a project
   */
  async provisionStandardSkills(project: string): Promise<ProvisionResult[]> {
    const standardDir = this.getStandardSkillsDir();
    const results: ProvisionResult[] = [];

    try {
      const entries = await fs.readdir(standardDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip the 'optional' subdirectory
        if (entry.isDirectory() && entry.name !== 'optional') {
          const result = await this.provisionSingleSkill(
            project,
            entry.name,
            path.join(standardDir, entry.name),
          );
          results.push(result);
        }
      }
    } catch (error: any) {
      // If standard directory doesn't exist, return empty results
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    return results;
  }

  /**
   * Provision specific skills from the repository to a project
   */
  async provisionSkillsFromRepository(
    project: string,
    skillNames: string[],
    source: 'standard' | 'optional',
  ): Promise<ProvisionResult[]> {
    const sourceDir = source === 'standard'
      ? this.getStandardSkillsDir()
      : this.getOptionalSkillsDir();

    const results: ProvisionResult[] = [];

    for (const skillName of skillNames) {
      const skillSourceDir = path.join(sourceDir, skillName);
      const result = await this.provisionSingleSkill(project, skillName, skillSourceDir);
      results.push(result);
    }

    return results;
  }

  /**
   * Provision a single skill from a source directory to a project
   */
  private async provisionSingleSkill(
    project: string,
    skillName: string,
    sourceDir: string,
  ): Promise<ProvisionResult> {
    try {
      // Check if source skill exists
      await fs.access(sourceDir);

      // Ensure project skills directory exists
      await this.ensureSkillsDir(project);

      const targetDir = path.join(this.getSkillsDir(project), skillName);

      // Check if skill already exists in project
      try {
        await fs.access(targetDir);
        return {
          skillName,
          success: false,
          error: `Skill '${skillName}' already exists in project`,
        };
      } catch {
        // Target doesn't exist, which is what we want
      }

      // Copy the skill directory
      await this.copyDirectory(sourceDir, targetDir);

      return {
        skillName,
        success: true,
      };
    } catch (error: any) {
      return {
        skillName,
        success: false,
        error: error.message || `Failed to provision skill '${skillName}'`,
      };
    }
  }
}
