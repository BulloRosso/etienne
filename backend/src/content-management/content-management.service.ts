import { Injectable, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, extname, dirname, basename } from 'path';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeRoot } from '../claude/utils/path.utils';
import { FileWatcherService } from '../event-handling/core/file-watcher.service';

@Injectable()
export class ContentManagementService {
  private readonly config = new ClaudeConfig();

  constructor(
    @Optional() @Inject(FileWatcherService) private readonly fileWatcher?: FileWatcherService,
  ) {}

  /**
   * Get MIME type based on file extension
   */
  getMimeType(filename: string): string {
    const ext = extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Read file content from workspace
   */
  async getFileContent(projectName: string, filepath: string): Promise<{ content: Buffer; mimeType: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Read file content as buffer to support both text and binary files
      const content = await fs.readFile(fullPath);
      const mimeType = this.getMimeType(filepath);

      return { content, mimeType };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`File not found: ${filepath}`);
      }
      throw error;
    }
  }

  /**
   * Delete a file or folder
   */
  async deleteFileOrFolder(projectName: string, filepath: string): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Check if the path exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new NotFoundException(`Path not found: ${filepath}`);
      }

      // Check if it's a file or directory
      const stats = await fs.stat(fullPath);

      // Suspend file watcher to release all OS handles (Windows EPERM fix)
      if (this.fileWatcher) {
        await this.fileWatcher.suspend();
      }
      try {
        if (stats.isDirectory()) {
          // Remove directory and all its contents
          await fs.rm(fullPath, { recursive: true, force: true });
        } else {
          // Remove file
          await fs.unlink(fullPath);
        }
      } finally {
        if (this.fileWatcher) {
          await this.fileWatcher.resume();
        }
      }

      return {
        success: true,
        message: stats.isDirectory() ? `Directory deleted: ${filepath}` : `File deleted: ${filepath}`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete: ${error.message}`);
    }
  }

  /**
   * Move a file or folder to a new location
   */
  async moveFileOrFolder(
    projectName: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const sourceFullPath = join(root, sourcePath);
      const destFullPath = join(root, destinationPath);

      // Check if source exists
      try {
        await fs.access(sourceFullPath);
      } catch {
        throw new NotFoundException(`Source path not found: ${sourcePath}`);
      }

      // Ensure destination directory exists
      const destDir = dirname(destFullPath);
      await fs.mkdir(destDir, { recursive: true });

      // Check if destination already exists
      try {
        await fs.access(destFullPath);
        throw new BadRequestException(`Destination already exists: ${destinationPath}`);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Destination doesn't exist, which is what we want
      }

      // Suspend file watcher to release all OS handles (Windows EPERM fix)
      if (this.fileWatcher) {
        await this.fileWatcher.suspend();
      }
      try {
        await fs.rename(sourceFullPath, destFullPath);
      } finally {
        if (this.fileWatcher) {
          await this.fileWatcher.resume();
        }
      }

      return {
        success: true,
        message: `Moved from ${sourcePath} to ${destinationPath}`
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to move: ${error.message}`);
    }
  }

  /**
   * Rename a file or folder
   */
  async renameFileOrFolder(
    projectName: string,
    filepath: string,
    newName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Check if source exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new NotFoundException(`Path not found: ${filepath}`);
      }

      // Calculate new path (same directory, new name)
      const dir = dirname(fullPath);
      const newFullPath = join(dir, newName);

      // Check if destination already exists
      try {
        await fs.access(newFullPath);
        throw new BadRequestException(`A file or folder with name "${newName}" already exists`);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Destination doesn't exist, which is what we want
      }

      // Suspend file watcher to release all OS handles (Windows EPERM fix)
      if (this.fileWatcher) {
        await this.fileWatcher.suspend();
      }
      try {
        await fs.rename(fullPath, newFullPath);
      } finally {
        if (this.fileWatcher) {
          await this.fileWatcher.resume();
        }
      }

      const newRelativePath = join(dirname(filepath), newName);
      return {
        success: true,
        message: `Renamed to ${newName}`,
        newPath: newRelativePath
      } as any;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to rename: ${error.message}`);
    }
  }

  /**
   * Upload a file
   */
  async uploadFile(
    projectName: string,
    filepath: string,
    content: Buffer
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, filepath);

      // Ensure directory exists
      const dir = dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content);

      return {
        success: true,
        message: `File uploaded: ${filepath}`
      };
    } catch (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Create a new folder
   */
  async createFolder(
    projectName: string,
    folderPath: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const fullPath = join(root, folderPath);

      // Check if folder already exists
      try {
        await fs.access(fullPath);
        throw new BadRequestException(`Folder already exists: ${folderPath}`);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Folder doesn't exist, which is what we want
      }

      // Create folder
      await fs.mkdir(fullPath, { recursive: true });

      return {
        success: true,
        message: `Folder created: ${folderPath}`
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Get user interface configuration
   */
  async getUserInterfaceConfig(projectName: string): Promise<any> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configPath = join(root, '.etienne', 'user-interface.json');

      try {
        const content = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null; // File doesn't exist, return null
        }
        throw error;
      }
    } catch (error) {
      // Return null for any file not found errors
      if (error.code === 'ENOENT') {
        return null;
      }
      // For path traversal or other security errors, rethrow
      if (error.message === 'Path traversal') {
        throw error;
      }
      // For other errors, return null (file system issues, permission problems, etc.)
      console.warn(`Could not read UI config for project ${projectName}:`, error.message);
      return null;
    }
  }

  /**
   * Save user interface configuration
   */
  async saveUserInterfaceConfig(
    projectName: string,
    config: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configDir = join(root, '.etienne');
      const configPath = join(configDir, 'user-interface.json');

      // Ensure .etienne directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Write configuration
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      return {
        success: true,
        message: 'UI configuration saved successfully'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to save UI configuration: ${error.message}`);
    }
  }

  /**
   * List all projects that have a user-interface.json file
   */
  async listProjectsWithUIConfig(): Promise<string[]> {
    try {
      const workspaceRoot = this.config.hostRoot;
      const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });

      const projectsWithUI: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const configPath = join(workspaceRoot, entry.name, '.etienne', 'user-interface.json');
          try {
            await fs.access(configPath);
            projectsWithUI.push(entry.name);
          } catch {
            // File doesn't exist, skip this project
          }
        }
      }

      return projectsWithUI;
    } catch (error) {
      throw new BadRequestException(`Failed to list projects with UI config: ${error.message}`);
    }
  }

  /**
   * Get project history from root CLAUDE.md file
   */
  async getProjectHistory(projectName: string): Promise<string> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const historyPath = join(root, 'CLAUDE.md');

      try {
        const content = await fs.readFile(historyPath, 'utf-8');
        return content;
      } catch (error) {
        if (error.code === 'ENOENT') {
          return ''; // File doesn't exist, return empty string
        }
        throw error;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return '';
      }
      if (error.message === 'Path traversal') {
        throw error;
      }
      console.warn(`Could not read project history for project ${projectName}:`, error.message);
      return '';
    }
  }

  /**
   * Append to project history in root CLAUDE.md file
   */
  async appendProjectHistory(
    projectName: string,
    content: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const historyPath = join(root, 'CLAUDE.md');

      // Read existing content if file exists
      let existingContent = '';
      try {
        existingContent = await fs.readFile(historyPath, 'utf-8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, start with empty content
      }

      // Append new content with proper spacing
      const newContent = existingContent
        ? `${existingContent}\n\n${content}`
        : content;

      // Write the updated content
      await fs.writeFile(historyPath, newContent, 'utf-8');

      return {
        success: true,
        message: 'Project history updated successfully'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to append project history: ${error.message}`);
    }
  }

  /**
   * Search for files recursively matching a query string
   * Excludes system directories like .claude and .etienne
   */
  async searchFiles(
    projectName: string,
    query: string
  ): Promise<Array<{ name: string; path: string }>> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const results: Array<{ name: string; path: string }> = [];
      const lowerQuery = query.toLowerCase();

      // Recursively search through directories
      const searchDirectory = async (dirPath: string, relativePath: string = '') => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const entryFullPath = join(dirPath, entry.name);

            // Skip system directories
            if (entry.name === '.claude' || entry.name === '.etienne' || entry.name === 'data') {
              continue;
            }

            if (entry.isDirectory()) {
              // Recursively search subdirectories
              await searchDirectory(entryFullPath, entryRelativePath);
            } else if (entry.isFile()) {
              // Check if filename starts with query (prefix match)
              if (entry.name.toLowerCase().startsWith(lowerQuery)) {
                results.push({
                  name: entry.name,
                  path: entryRelativePath
                });
              }
            }
          }
        } catch (error) {
          // Skip directories we can't read
          console.warn(`Could not read directory ${dirPath}:`, error.message);
        }
      };

      await searchDirectory(root);

      // Sort results by filename
      results.sort((a, b) => a.name.localeCompare(b.name));

      return results;
    } catch (error) {
      throw new BadRequestException(`Failed to search files: ${error.message}`);
    }
  }

  /**
   * Get workbench configuration
   */
  async getWorkbenchConfig(projectName: string): Promise<any> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configPath = join(root, '.etienne', 'workbench.json');

      try {
        const content = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null; // File doesn't exist, return null
        }
        throw error;
      }
    } catch (error) {
      // Return null for any file not found errors
      if (error.code === 'ENOENT') {
        return null;
      }
      // For path traversal or other security errors, rethrow
      if (error.message === 'Path traversal') {
        throw error;
      }
      // For other errors, return null (file system issues, permission problems, etc.)
      console.warn(`Could not read workbench config for project ${projectName}:`, error.message);
      return null;
    }
  }

  /**
   * Save workbench configuration
   */
  async saveWorkbenchConfig(
    projectName: string,
    config: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const root = safeRoot(this.config.hostRoot, projectName);
      const configDir = join(root, '.etienne');
      const configPath = join(configDir, 'workbench.json');

      // Ensure .etienne directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Write configuration
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      return {
        success: true,
        message: 'Workbench configuration saved successfully'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to save workbench configuration: ${error.message}`);
    }
  }
}
