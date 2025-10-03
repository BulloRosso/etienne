import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, extname, dirname, basename } from 'path';
import { ClaudeConfig } from '../claude/config/claude.config';
import { safeRoot } from '../claude/utils/path.utils';

@Injectable()
export class ContentManagementService {
  private readonly config = new ClaudeConfig();

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

      if (stats.isDirectory()) {
        // Remove directory and all its contents
        await fs.rm(fullPath, { recursive: true, force: true });
        return { success: true, message: `Directory deleted: ${filepath}` };
      } else {
        // Remove file
        await fs.unlink(fullPath);
        return { success: true, message: `File deleted: ${filepath}` };
      }
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

      // Move the file or folder
      await fs.rename(sourceFullPath, destFullPath);

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

      // Rename
      await fs.rename(fullPath, newFullPath);

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
}
