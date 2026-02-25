import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';
import { RepositorySkill, ProvisionResult } from './dto/repository-skills.dto';
import {
  CatalogSkill,
  SkillMetadata,
  SkillDependencies,
  ModificationResult,
  ReviewRequest,
} from './dto/skill-catalog.dto';
import { CodingAgentConfigurationService } from '../coding-agent-configuration/coding-agent-configuration.service';

export interface Skill {
  name: string;
  content: string;
}

export interface SkillWithProject {
  name: string;
  project: string;
  isFromCurrentProject: boolean;
  description?: string;
  hasThumbnail?: boolean;
}

@Injectable()
export class SkillsService {
  private readonly workspaceDir = path.resolve(process.cwd(), '../workspace');

  constructor(
    private readonly codingAgentConfig: CodingAgentConfigurationService,
  ) {}

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
   * Get the agent-specific skills config directory name.
   * - anthropic: .claude/skills
   * - openai: .agents/skills
   */
  private getSkillsConfigDir(): string {
    const agentType = this.codingAgentConfig.getActiveAgentType();
    return agentType === 'openai' ? path.join('.agents', 'skills') : path.join('.claude', 'skills');
  }

  /**
   * Get the skills directory path for a project
   */
  private getSkillsDir(project: string): string {
    return path.join(this.workspaceDir, project, this.getSkillsConfigDir());
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
      const skillDir = path.join(this.getSkillsDir(currentProject), skillName);
      const description = await this.getSkillDescription(skillDir);
      const hasThumbnail = await this.fileExists(path.join(skillDir, 'thumbnail.png'));
      allSkills.push({
        name: skillName,
        project: currentProject,
        isFromCurrentProject: true,
        description,
        hasThumbnail,
      });
    }

    // Then, collect skills from other projects (excluding duplicates)
    for (const project of projects) {
      if (project === currentProject) continue;

      const skills = await this.listSkills(project);
      for (const skillName of skills) {
        // Only add if not already in current project
        if (!currentProjectSkillNames.has(skillName)) {
          const skillDir = path.join(this.getSkillsDir(project), skillName);
          const description = await this.getSkillDescription(skillDir);
          const hasThumbnail = await this.fileExists(path.join(skillDir, 'thumbnail.png'));
          allSkills.push({
            name: skillName,
            project,
            isFromCurrentProject: false,
            description,
            hasThumbnail,
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
          const skillDir = path.join(standardDir, entry.name);
          const description = await this.getSkillDescription(skillDir);
          const hasThumbnail = await this.fileExists(path.join(skillDir, 'thumbnail.png'));
          skills.push({
            name: entry.name,
            source: 'standard',
            description,
            hasThumbnail,
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
            const skillDir = path.join(optionalDir, entry.name);
            const description = await this.getSkillDescription(skillDir);
            const hasThumbnail = await this.fileExists(path.join(skillDir, 'thumbnail.png'));
            skills.push({
              name: entry.name,
              source: 'optional',
              description,
              hasThumbnail,
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
      const lines = content.split('\n');

      // Parse YAML front matter if present
      if (lines[0]?.trim() === '---') {
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '---') {
            break;
          }
          const match = lines[i].match(/^description:\s*(.+)/);
          if (match) {
            let desc = match[1].trim();

            // Handle YAML multi-line block scalars (> or |)
            if (desc === '>' || desc === '|' || desc === '>-' || desc === '|-') {
              const blockLines: string[] = [];
              for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim() === '---') break;
                // Continuation lines must be indented
                if (lines[j].match(/^\s+\S/)) {
                  blockLines.push(lines[j].trim());
                } else {
                  break;
                }
              }
              desc = blockLines.join(' ');
            }

            if (desc.length > 200) {
              return desc.substring(0, 197) + '...';
            }
            return desc || undefined;
          }
        }
      }

      // Fallback: find the first non-empty, non-heading paragraph line
      let startIndex = 0;
      if (lines[0]?.startsWith('#')) {
        startIndex = 1;
      }

      let description = '';
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith('#')) {
          description = line;
          break;
        }
      }

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

  // =========================================================================
  // Skill Catalog (Skill Store) methods
  // =========================================================================

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getRepoSkillDir(skillName: string, source: 'standard' | 'optional'): string {
    const baseDir = source === 'optional'
      ? this.getOptionalSkillsDir()
      : this.getStandardSkillsDir();
    return path.join(baseDir, skillName);
  }

  private getReviewQueueDir(): string {
    return path.join(this.getSkillRepositoryPath(), '.review-queue');
  }

  private incrementVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    if (parts.length === 1) {
      return `${parts[0]}.1`;
    }
    const minor = parseInt(parts[1], 10) || 0;
    return `${parts[0]}.${minor + 1}`;
  }

  /**
   * List all repository skills with full metadata for the catalog
   */
  async listCatalogSkills(): Promise<CatalogSkill[]> {
    const repoSkills = await this.listRepositorySkills(true);
    const catalogSkills: CatalogSkill[] = [];

    for (const skill of repoSkills) {
      const skillDir = this.getRepoSkillDir(skill.name, skill.source);
      const metadata = await this.getSkillMetadata(skill.name, skill.source);
      const dependencies = await this.getSkillDependencies(skill.name, skill.source);
      const hasThumbnail = await this.fileExists(path.join(skillDir, 'thumbnail.png'));

      catalogSkills.push({
        name: skill.name,
        source: skill.source,
        description: skill.description,
        metadata: metadata || undefined,
        dependencies: dependencies || undefined,
        hasThumbnail,
      });
    }

    return catalogSkills.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Read .metadata.json for a repository skill
   */
  async getSkillMetadata(skillName: string, source: 'standard' | 'optional'): Promise<SkillMetadata | null> {
    const metaPath = path.join(this.getRepoSkillDir(skillName, source), '.metadata.json');
    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Write .metadata.json for a repository skill
   */
  async saveSkillMetadata(skillName: string, source: 'standard' | 'optional', metadata: SkillMetadata): Promise<void> {
    const skillDir = this.getRepoSkillDir(skillName, source);
    await fs.access(skillDir); // ensure skill exists
    await fs.writeFile(path.join(skillDir, '.metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Read .dependencies.json for a repository skill
   */
  async getSkillDependencies(skillName: string, source: 'standard' | 'optional'): Promise<SkillDependencies | null> {
    const depsPath = path.join(this.getRepoSkillDir(skillName, source), '.dependencies.json');
    try {
      const content = await fs.readFile(depsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Write .dependencies.json for a repository skill
   */
  async saveSkillDependencies(skillName: string, source: 'standard' | 'optional', dependencies: SkillDependencies): Promise<void> {
    const skillDir = this.getRepoSkillDir(skillName, source);
    await fs.access(skillDir); // ensure skill exists
    await fs.writeFile(path.join(skillDir, '.dependencies.json'), JSON.stringify(dependencies, null, 2), 'utf-8');
  }

  /**
   * Get a read stream for a skill's thumbnail.png
   */
  getSkillThumbnailStream(skillName: string, source: 'standard' | 'optional'): { path: string } {
    const thumbPath = path.join(this.getRepoSkillDir(skillName, source), 'thumbnail.png');
    return { path: thumbPath };
  }

  /**
   * Get a read stream for a project skill's thumbnail.png
   */
  getProjectSkillThumbnailPath(project: string, skillName: string): string {
    return path.join(this.getSkillsDir(project), skillName, 'thumbnail.png');
  }

  /**
   * Upload a zip file as a new skill to the repository
   */
  async uploadSkillZip(zipBuffer: Buffer, source: 'standard' | 'optional'): Promise<{ skillName: string }> {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    if (entries.length === 0) {
      throw new Error('Zip file is empty');
    }

    // Determine the skill name from the zip structure
    // Option 1: top-level directory name
    // Option 2: files at root level — use the zip filename
    let skillName: string | null = null;
    let hasSkillMd = false;
    const topLevelDirs = new Set<string>();

    for (const entry of entries) {
      const parts = entry.entryName.split('/');
      if (parts.length > 1 && parts[0]) {
        topLevelDirs.add(parts[0]);
      }
      if (entry.entryName.endsWith('SKILL.md') || entry.name === 'SKILL.md') {
        hasSkillMd = true;
      }
    }

    if (!hasSkillMd) {
      throw new Error('Zip must contain a SKILL.md file');
    }

    // If there's exactly one top-level directory, use it as skill name
    if (topLevelDirs.size === 1) {
      skillName = Array.from(topLevelDirs)[0];
    } else {
      throw new Error('Zip must contain exactly one top-level directory named after the skill');
    }

    // Validate skill name
    if (!/^[a-z0-9-]+$/.test(skillName)) {
      throw new Error('Skill name (top-level directory) can only contain lowercase letters, numbers, and hyphens');
    }

    const targetDir = this.getRepoSkillDir(skillName, source);

    // Check if skill already exists
    if (await this.fileExists(targetDir)) {
      throw new Error(`Skill '${skillName}' already exists in the repository. Use the update flow instead.`);
    }

    // Extract to target directory
    await fs.mkdir(targetDir, { recursive: true });
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      // Remove the top-level directory prefix
      const parts = entry.entryName.split('/');
      parts.shift(); // remove top-level dir
      if (parts.length === 0 || !parts.join('/')) continue;
      const filePath = path.join(targetDir, ...parts);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, entry.getData());
    }

    // Create default .metadata.json if not present
    const metaPath = path.join(targetDir, '.metadata.json');
    if (!(await this.fileExists(metaPath))) {
      const defaultMeta: SkillMetadata = { version: '1.0' };
      await fs.writeFile(metaPath, JSON.stringify(defaultMeta, null, 2), 'utf-8');
    }

    return { skillName };
  }

  /**
   * Delete a skill from the repository
   */
  async deleteRepositorySkill(skillName: string, source: 'standard' | 'optional'): Promise<void> {
    const skillDir = this.getRepoSkillDir(skillName, source);
    await fs.rm(skillDir, { recursive: true, force: true });
  }

  /**
   * Submit a zip file for admin review
   */
  async submitForReview(zipBuffer: Buffer, originalFilename: string, username: string): Promise<ReviewRequest> {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // Determine skill name from zip
    let skillName = 'unknown';
    const topLevelDirs = new Set<string>();
    for (const entry of entries) {
      const parts = entry.entryName.split('/');
      if (parts.length > 1 && parts[0]) {
        topLevelDirs.add(parts[0]);
      }
    }
    if (topLevelDirs.size === 1) {
      skillName = Array.from(topLevelDirs)[0];
    }

    // Determine source by checking if skill exists in standard or optional
    let source: 'standard' | 'optional' | undefined;
    if (await this.fileExists(path.join(this.getStandardSkillsDir(), skillName))) {
      source = 'standard';
    } else if (await this.fileExists(path.join(this.getOptionalSkillsDir(), skillName))) {
      source = 'optional';
    }

    const queueDir = this.getReviewQueueDir();
    await fs.mkdir(queueDir, { recursive: true });

    const id = crypto.randomUUID();
    const request: ReviewRequest = {
      id,
      skillName,
      submittedBy: username,
      submittedAt: new Date().toISOString(),
      fileName: originalFilename,
      source,
    };

    await fs.writeFile(path.join(queueDir, `${id}.zip`), zipBuffer);
    await fs.writeFile(path.join(queueDir, `${id}.json`), JSON.stringify(request, null, 2), 'utf-8');

    return request;
  }

  /**
   * Get the file path for a review request's zip
   */
  getReviewZipPath(id: string): string {
    return path.join(this.getReviewQueueDir(), `${id}.zip`);
  }

  /**
   * List all pending review requests
   */
  async listReviewRequests(): Promise<ReviewRequest[]> {
    const queueDir = this.getReviewQueueDir();
    try {
      const entries = await fs.readdir(queueDir);
      const jsonFiles = entries.filter(e => e.endsWith('.json'));
      const requests: ReviewRequest[] = [];

      for (const jsonFile of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(queueDir, jsonFile), 'utf-8');
          requests.push(JSON.parse(content));
        } catch {
          // skip malformed files
        }
      }

      return requests.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Accept a review request: overwrite skill from zip and auto-increment version
   */
  async acceptReviewRequest(id: string): Promise<{ newVersion: string; skillName: string }> {
    const queueDir = this.getReviewQueueDir();
    const sidecarPath = path.join(queueDir, `${id}.json`);
    const zipPath = path.join(queueDir, `${id}.zip`);

    const sidecarContent = await fs.readFile(sidecarPath, 'utf-8');
    const request: ReviewRequest = JSON.parse(sidecarContent);

    // Determine source and target directory
    let source: 'standard' | 'optional' = request.source || 'standard';
    const targetDir = this.getRepoSkillDir(request.skillName, source);

    // Read current version
    let currentVersion = '1.0';
    try {
      const meta = await this.getSkillMetadata(request.skillName, source);
      if (meta?.version) {
        currentVersion = meta.version;
      }
    } catch {
      // use default
    }

    const newVersion = this.incrementVersion(currentVersion);

    // Extract zip to overwrite skill directory
    const zipBuffer = await fs.readFile(zipPath);
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // Remove existing directory and recreate
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.split('/');
      // Remove top-level directory if present
      if (parts.length > 1) {
        parts.shift();
      }
      if (parts.length === 0 || !parts.join('/')) continue;
      const filePath = path.join(targetDir, ...parts);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, entry.getData());
    }

    // Update .metadata.json with new version
    let metadata: SkillMetadata;
    try {
      const metaPath = path.join(targetDir, '.metadata.json');
      const content = await fs.readFile(metaPath, 'utf-8');
      metadata = JSON.parse(content);
    } catch {
      metadata = { version: currentVersion };
    }
    metadata.version = newVersion;
    await fs.writeFile(path.join(targetDir, '.metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');

    // Clean up review files
    await fs.unlink(zipPath);
    await fs.unlink(sidecarPath);

    return { newVersion, skillName: request.skillName };
  }

  /**
   * Reject a review request: delete zip and sidecar
   */
  async rejectReviewRequest(id: string): Promise<void> {
    const queueDir = this.getReviewQueueDir();
    try { await fs.unlink(path.join(queueDir, `${id}.zip`)); } catch { /* ignore */ }
    try { await fs.unlink(path.join(queueDir, `${id}.json`)); } catch { /* ignore */ }
  }

  /**
   * Detect modifications between a project skill and the repository skill
   */
  async detectModifications(project: string, skillName: string): Promise<ModificationResult> {
    const projectSkillDir = path.join(this.getSkillsDir(project), skillName);

    // Check if project skill exists
    if (!(await this.fileExists(projectSkillDir))) {
      return { status: 'not-provisioned' };
    }

    // Find skill in repository
    let repoDir: string | null = null;
    const standardPath = path.join(this.getStandardSkillsDir(), skillName);
    const optionalPath = path.join(this.getOptionalSkillsDir(), skillName);

    if (await this.fileExists(standardPath)) {
      repoDir = standardPath;
    } else if (await this.fileExists(optionalPath)) {
      repoDir = optionalPath;
    }

    if (!repoDir) {
      return { status: 'not-provisioned' };
    }

    // Compare versions from .metadata.json
    let repoVersion: string | null = null;
    let projectVersion: string | null = null;

    try {
      const repoMeta = JSON.parse(await fs.readFile(path.join(repoDir, '.metadata.json'), 'utf-8'));
      repoVersion = repoMeta.version || null;
    } catch { /* no metadata */ }

    try {
      const projMeta = JSON.parse(await fs.readFile(path.join(projectSkillDir, '.metadata.json'), 'utf-8'));
      projectVersion = projMeta.version || null;
    } catch { /* no metadata */ }

    // Compare files by hash
    const changedFiles = await this.compareDirectoryFiles(projectSkillDir, repoDir);

    if (changedFiles.length === 0) {
      return { status: 'current' };
    }

    // If repo has a higher version, it's "updated"
    if (repoVersion && projectVersion && this.isNewerVersion(repoVersion, projectVersion)) {
      return { status: 'updated', changedFiles };
    }

    // Same version but files differ: "refined" (modified in project)
    return { status: 'refined', changedFiles };
  }

  private isNewerVersion(a: string, b: string): boolean {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const va = partsA[i] || 0;
      const vb = partsB[i] || 0;
      if (va > vb) return true;
      if (va < vb) return false;
    }
    return false;
  }

  private async compareDirectoryFiles(dirA: string, dirB: string): Promise<string[]> {
    const changedFiles: string[] = [];

    const listFiles = async (dir: string, prefix = ''): Promise<Map<string, string>> => {
      const result = new Map<string, string>();
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            const subMap = await listFiles(path.join(dir, entry.name), relPath);
            for (const [k, v] of subMap) result.set(k, v);
          } else {
            const content = await fs.readFile(path.join(dir, entry.name));
            const hash = crypto.createHash('md5').update(content).digest('hex');
            result.set(relPath, hash);
          }
        }
      } catch { /* directory doesn't exist */ }
      return result;
    };

    const filesA = await listFiles(dirA);
    const filesB = await listFiles(dirB);

    // Files in A but not in B or with different hash
    for (const [file, hash] of filesA) {
      if (!filesB.has(file) || filesB.get(file) !== hash) {
        changedFiles.push(file);
      }
    }

    // Files in B but not in A
    for (const file of filesB.keys()) {
      if (!filesA.has(file) && !changedFiles.includes(file)) {
        changedFiles.push(file);
      }
    }

    return changedFiles.sort();
  }

  /**
   * Submit a project skill for admin review (creates zip in-memory)
   */
  async submitProjectSkillForReview(project: string, skillName: string, username: string): Promise<ReviewRequest> {
    const skillDir = path.join(this.getSkillsDir(project), skillName);

    if (!(await this.fileExists(skillDir))) {
      throw new Error(`Skill '${skillName}' not found in project '${project}'`);
    }

    // Create zip from project skill directory
    const zip = new AdmZip();
    const addDirToZip = async (dirPath: string, zipPrefix: string) => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const zipPath = `${zipPrefix}/${entry.name}`;
        if (entry.isDirectory()) {
          await addDirToZip(fullPath, zipPath);
        } else {
          const content = await fs.readFile(fullPath);
          zip.addFile(zipPath, content);
        }
      }
    };

    await addDirToZip(skillDir, skillName);
    const zipBuffer = zip.toBuffer();

    return this.submitForReview(zipBuffer, `${skillName}.zip`, username);
  }

  /**
   * Update a project skill from the repository version
   */
  async updateSkillFromRepository(project: string, skillName: string): Promise<void> {
    const projectSkillDir = path.join(this.getSkillsDir(project), skillName);

    // Find in repo
    let repoDir: string | null = null;
    const standardPath = path.join(this.getStandardSkillsDir(), skillName);
    const optionalPath = path.join(this.getOptionalSkillsDir(), skillName);

    if (await this.fileExists(standardPath)) {
      repoDir = standardPath;
    } else if (await this.fileExists(optionalPath)) {
      repoDir = optionalPath;
    }

    if (!repoDir) {
      throw new Error(`Skill '${skillName}' not found in the repository`);
    }

    // Remove existing project skill and re-copy from repo
    await fs.rm(projectSkillDir, { recursive: true, force: true });
    await this.copyDirectory(repoDir, projectSkillDir);
  }
}
