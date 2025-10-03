import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, extname } from 'path';
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
}
