import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { TagsService } from '../tags/tags.service';

export interface Context {
  id: string;
  name: string;
  description: string;
  fileTagsInclude: string[];
  fileTagsExclude: string[];
  vectorTagsInclude: string[];
  kgTagsInclude: string[];
  kgEntityTypes: string[];
}

export interface ContextsConfig {
  contexts: Context[];
}

export interface ContextScope {
  files: string[];
  vectorTags: string[];
  kgTags: string[];
  kgEntityTypes: string[];
}

@Injectable()
export class ContextsService {
  private readonly logger = new Logger(ContextsService.name);
  private readonly hostRoot = process.env.WORKSPACE_ROOT || '/workspace';

  constructor(
    private tagsService: TagsService,
  ) {}

  /**
   * Get the path to the contexts config file for a project
   */
  private getContextsFilePath(projectName: string): string {
    return path.join(this.hostRoot, projectName, '.etienne', 'contexts.json');
  }

  /**
   * Load all contexts for a project
   */
  async loadContexts(projectName: string): Promise<ContextsConfig> {
    const contextsFilePath = this.getContextsFilePath(projectName);

    try {
      if (await fs.pathExists(contextsFilePath)) {
        const content = await fs.readFile(contextsFilePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      this.logger.error(`Error loading contexts for project ${projectName}:`, error);
    }

    return { contexts: [] };
  }

  /**
   * Save contexts for a project
   */
  async saveContexts(projectName: string, config: ContextsConfig): Promise<void> {
    const contextsFilePath = this.getContextsFilePath(projectName);

    try {
      await fs.ensureDir(path.dirname(contextsFilePath));
      await fs.writeFile(contextsFilePath, JSON.stringify(config, null, 2), 'utf-8');
      this.logger.log(`Saved contexts for project ${projectName}`);
    } catch (error) {
      this.logger.error(`Error saving contexts for project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Get all contexts for a project
   */
  async getAllContexts(projectName: string): Promise<Context[]> {
    const config = await this.loadContexts(projectName);
    return config.contexts;
  }

  /**
   * Get a context by ID
   */
  async getContext(projectName: string, contextId: string): Promise<Context | null> {
    const config = await this.loadContexts(projectName);
    return config.contexts.find(c => c.id === contextId) || null;
  }

  /**
   * Create a new context
   */
  async createContext(projectName: string, context: Omit<Context, 'id'>): Promise<Context> {
    const config = await this.loadContexts(projectName);

    const newContext: Context = {
      id: `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...context,
    };

    config.contexts.push(newContext);
    await this.saveContexts(projectName, config);

    this.logger.log(`Created context ${newContext.id} in project ${projectName}`);
    return newContext;
  }

  /**
   * Update an existing context
   */
  async updateContext(projectName: string, contextId: string, updates: Partial<Omit<Context, 'id'>>): Promise<Context | null> {
    const config = await this.loadContexts(projectName);
    const contextIndex = config.contexts.findIndex(c => c.id === contextId);

    if (contextIndex === -1) {
      return null;
    }

    config.contexts[contextIndex] = {
      ...config.contexts[contextIndex],
      ...updates,
    };

    await this.saveContexts(projectName, config);

    this.logger.log(`Updated context ${contextId} in project ${projectName}`);
    return config.contexts[contextIndex];
  }

  /**
   * Delete a context
   */
  async deleteContext(projectName: string, contextId: string): Promise<boolean> {
    const config = await this.loadContexts(projectName);
    const initialLength = config.contexts.length;

    config.contexts = config.contexts.filter(c => c.id !== contextId);

    if (config.contexts.length === initialLength) {
      return false; // Context not found
    }

    await this.saveContexts(projectName, config);

    this.logger.log(`Deleted context ${contextId} from project ${projectName}`);
    return true;
  }

  /**
   * Get the scope (files, tags, etc.) for a context
   */
  async getContextScope(projectName: string, contextId: string): Promise<ContextScope | null> {
    const context = await this.getContext(projectName, contextId);

    if (!context) {
      return null;
    }

    // Get all file tags
    const allFileTags = await this.tagsService.loadFileTags(projectName);

    // Filter files by tags
    const files: string[] = [];

    for (const [filePath, tags] of Object.entries(allFileTags)) {
      const hasIncludedTag = context.fileTagsInclude.length === 0 ||
        tags.some(tag => context.fileTagsInclude.includes(tag));

      const hasExcludedTag = tags.some(tag => context.fileTagsExclude.includes(tag));

      if (hasIncludedTag && !hasExcludedTag) {
        files.push(filePath);
      }
    }

    // If no file tags are specified, include all untagged files
    if (context.fileTagsInclude.length === 0 && context.fileTagsExclude.length === 0) {
      // Include all files
      files.push(...Object.keys(allFileTags));
    }

    return {
      files,
      vectorTags: context.vectorTagsInclude,
      kgTags: context.kgTagsInclude,
      kgEntityTypes: context.kgEntityTypes,
    };
  }

  /**
   * Check if a file is accessible in a context
   */
  async isFileAccessibleInContext(projectName: string, contextId: string, filePath: string): Promise<boolean> {
    const context = await this.getContext(projectName, contextId);

    if (!context) {
      return false;
    }

    // If no tags specified, all files are accessible (default context)
    if (context.fileTagsInclude.length === 0 && context.fileTagsExclude.length === 0) {
      return true;
    }

    const fileTags = await this.tagsService.getFileTags(projectName, filePath);

    // If file has no tags, it's accessible in all contexts
    if (fileTags.length === 0) {
      return true;
    }

    const hasIncludedTag = context.fileTagsInclude.length === 0 ||
      fileTags.some(tag => context.fileTagsInclude.includes(tag));

    const hasExcludedTag = fileTags.some(tag => context.fileTagsExclude.includes(tag));

    return hasIncludedTag && !hasExcludedTag;
  }

  /**
   * Get all files accessible in a context
   */
  async getFilesInContext(projectName: string, contextId: string): Promise<string[]> {
    const scope = await this.getContextScope(projectName, contextId);
    return scope ? scope.files : [];
  }
}
