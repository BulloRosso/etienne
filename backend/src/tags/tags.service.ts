import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface FileTags {
  [filePath: string]: string[];
}

export interface TagInfo {
  tag: string;
  count: number;
  files: string[];
}

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);
  private readonly hostRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor() {}

  /**
   * Get the path to the file tags storage for a project
   */
  private getTagsFilePath(projectName: string): string {
    return path.join(this.hostRoot, projectName, '.etienne', 'file-tags.json');
  }

  /**
   * Load all file tags for a project
   */
  async loadFileTags(projectName: string): Promise<FileTags> {
    const tagsFilePath = this.getTagsFilePath(projectName);

    try {
      if (await fs.pathExists(tagsFilePath)) {
        const content = await fs.readFile(tagsFilePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      this.logger.error(`Error loading tags for project ${projectName}:`, error);
    }

    return {};
  }

  /**
   * Save file tags for a project
   */
  async saveFileTags(projectName: string, fileTags: FileTags): Promise<void> {
    const tagsFilePath = this.getTagsFilePath(projectName);

    try {
      await fs.ensureDir(path.dirname(tagsFilePath));
      await fs.writeFile(tagsFilePath, JSON.stringify(fileTags, null, 2), 'utf-8');
      this.logger.log(`Saved tags for project ${projectName}`);
    } catch (error) {
      this.logger.error(`Error saving tags for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Get tags for a specific file
   */
  async getFileTags(projectName: string, filePath: string): Promise<string[]> {
    const allTags = await this.loadFileTags(projectName);
    return allTags[filePath] || [];
  }

  /**
   * Add tags to a file
   */
  async addTagsToFile(projectName: string, filePath: string, tags: string[]): Promise<string[]> {
    const allTags = await this.loadFileTags(projectName);

    // Get existing tags or initialize empty array
    const existingTags = allTags[filePath] || [];

    // Add new tags (avoid duplicates)
    const updatedTags = Array.from(new Set([...existingTags, ...tags]));

    // Update the tags object
    allTags[filePath] = updatedTags;

    await this.saveFileTags(projectName, allTags);

    this.logger.log(`Added tags ${tags.join(', ')} to ${filePath} in project ${projectName}`);
    return updatedTags;
  }

  /**
   * Remove tags from a file
   */
  async removeTagsFromFile(projectName: string, filePath: string, tags: string[]): Promise<string[]> {
    const allTags = await this.loadFileTags(projectName);

    const existingTags = allTags[filePath] || [];
    const updatedTags = existingTags.filter(tag => !tags.includes(tag));

    if (updatedTags.length === 0) {
      // Remove the file entry if no tags left
      delete allTags[filePath];
    } else {
      allTags[filePath] = updatedTags;
    }

    await this.saveFileTags(projectName, allTags);

    this.logger.log(`Removed tags ${tags.join(', ')} from ${filePath} in project ${projectName}`);
    return updatedTags;
  }

  /**
   * Get all unique tags for a project with usage counts
   */
  async getAllTags(projectName: string): Promise<TagInfo[]> {
    const allTags = await this.loadFileTags(projectName);

    const tagMap = new Map<string, string[]>();

    // Build map of tag -> files
    for (const [filePath, tags] of Object.entries(allTags)) {
      for (const tag of tags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
        }
        tagMap.get(tag).push(filePath);
      }
    }

    // Convert to array of TagInfo
    return Array.from(tagMap.entries()).map(([tag, files]) => ({
      tag,
      count: files.length,
      files,
    })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  /**
   * Get all files that have a specific tag
   */
  async getFilesByTag(projectName: string, tag: string): Promise<string[]> {
    const allTags = await this.loadFileTags(projectName);

    return Object.entries(allTags)
      .filter(([_, tags]) => tags.includes(tag))
      .map(([filePath, _]) => filePath);
  }

  /**
   * Get all files that have all of the specified tags (AND logic)
   */
  async getFilesByTags(projectName: string, tags: string[]): Promise<string[]> {
    if (tags.length === 0) return [];

    const allTags = await this.loadFileTags(projectName);

    return Object.entries(allTags)
      .filter(([_, fileTags]) => tags.every(tag => fileTags.includes(tag)))
      .map(([filePath, _]) => filePath);
  }

  /**
   * Rename a file path in tags (called when file is renamed/moved)
   */
  async renameFile(projectName: string, oldPath: string, newPath: string): Promise<void> {
    const allTags = await this.loadFileTags(projectName);

    if (allTags[oldPath]) {
      allTags[newPath] = allTags[oldPath];
      delete allTags[oldPath];
      await this.saveFileTags(projectName, allTags);
      this.logger.log(`Renamed file in tags: ${oldPath} -> ${newPath}`);
    }
  }

  /**
   * Remove a file from tags (called when file is deleted)
   */
  async deleteFile(projectName: string, filePath: string): Promise<void> {
    const allTags = await this.loadFileTags(projectName);

    if (allTags[filePath]) {
      delete allTags[filePath];
      await this.saveFileTags(projectName, allTags);
      this.logger.log(`Removed file from tags: ${filePath}`);
    }
  }

  /**
   * Rename a tag across all files
   */
  async renameTag(projectName: string, oldTag: string, newTag: string): Promise<number> {
    const allTags = await this.loadFileTags(projectName);
    let count = 0;

    for (const [filePath, tags] of Object.entries(allTags)) {
      const index = tags.indexOf(oldTag);
      if (index !== -1) {
        tags[index] = newTag;
        count++;
      }
    }

    if (count > 0) {
      await this.saveFileTags(projectName, allTags);
      this.logger.log(`Renamed tag ${oldTag} -> ${newTag} on ${count} files`);
    }

    return count;
  }

  /**
   * Delete a tag from all files
   */
  async deleteTag(projectName: string, tag: string): Promise<number> {
    const allTags = await this.loadFileTags(projectName);
    let count = 0;

    for (const [filePath, tags] of Object.entries(allTags)) {
      const filtered = tags.filter(t => t !== tag);
      if (filtered.length !== tags.length) {
        count++;
        if (filtered.length === 0) {
          delete allTags[filePath];
        } else {
          allTags[filePath] = filtered;
        }
      }
    }

    if (count > 0) {
      await this.saveFileTags(projectName, allTags);
      this.logger.log(`Deleted tag ${tag} from ${count} files`);
    }

    return count;
  }

  /**
   * Get color for a tag (deterministic hash-based)
   */
  getTagColor(tag: string): string {
    const colors = ['#1976d2', '#388e3c', '#d32f2f', '#f57c00', '#7b1fa2', '#c2185b', '#0097a7', '#689f38', '#e64a19'];
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}
