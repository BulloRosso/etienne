import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventRouterService } from './event-router.service';
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs-extra';

@Injectable()
export class FileWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileWatcherService.name);
  private watcher: chokidar.FSWatcher | null = null;
  private readonly workspaceDir: string;
  private isInitialized = false;

  constructor(private readonly eventRouter: EventRouterService) {
    this.workspaceDir = path.join(process.cwd(), '..', 'workspace');
  }

  async onModuleInit() {
    try {
      // Ensure workspace directory exists
      await fs.ensureDir(this.workspaceDir);

      // Initialize the file watcher
      this.watcher = chokidar.watch(this.workspaceDir, {
        persistent: true,
        ignoreInitial: true, // Don't emit events for existing files on startup
        ignored: [
          // Ignore hidden files and directories
          /(^|[\/\\])\../,
          // Ignore common directories that shouldn't trigger events
          '**/node_modules/**',
          '**/.git/**',
          '**/.etienne/**', // Ignore our own config/log directories
          '**/out/**',
        ],
        depth: 10, // Watch up to 10 levels deep
        awaitWriteFinish: {
          stabilityThreshold: 500, // Wait 500ms for file to stabilize
          pollInterval: 100,
        },
      });

      // Set up event handlers
      this.watcher
        .on('add', (filePath: string) => this.handleFileAdded(filePath))
        .on('change', (filePath: string) => this.handleFileChanged(filePath))
        .on('unlink', (filePath: string) => this.handleFileDeleted(filePath))
        .on('addDir', (dirPath: string) => this.handleDirectoryAdded(dirPath))
        .on('unlinkDir', (dirPath: string) => this.handleDirectoryDeleted(dirPath))
        .on('error', (error: Error) => this.handleError(error))
        .on('ready', () => {
          this.isInitialized = true;
          this.logger.log(`File watcher initialized for workspace: ${this.workspaceDir}`);
        });
    } catch (error) {
      this.logger.error('Failed to initialize file watcher', error);
    }
  }

  async onModuleDestroy() {
    if (this.watcher) {
      await this.watcher.close();
      this.logger.log('File watcher closed');
    }
  }

  /**
   * Extract project name from file path
   */
  private getProjectName(filePath: string): string | null {
    const relativePath = path.relative(this.workspaceDir, filePath);
    const parts = relativePath.split(path.sep);
    return parts.length > 0 ? parts[0] : null;
  }

  /**
   * Get relative path within the project
   */
  private getRelativePath(filePath: string): string {
    return path.relative(this.workspaceDir, filePath);
  }

  /**
   * Handle file added event
   */
  private async handleFileAdded(filePath: string) {
    try {
      const projectName = this.getProjectName(filePath);
      if (!projectName) return;

      const relativePath = this.getRelativePath(filePath);

      this.logger.debug(`File added: ${relativePath}`);

      await this.eventRouter.publishEvent({
        name: 'File Created',
        group: 'Filesystem',
        source: 'File Watcher',
        payload: {
          path: relativePath,
          projectName,
          absolutePath: filePath,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(`Error handling file added event for ${filePath}`, error);
    }
  }

  /**
   * Handle file changed event
   */
  private async handleFileChanged(filePath: string) {
    try {
      const projectName = this.getProjectName(filePath);
      if (!projectName) return;

      const relativePath = this.getRelativePath(filePath);

      this.logger.debug(`File changed: ${relativePath}`);

      await this.eventRouter.publishEvent({
        name: 'File Modified',
        group: 'Filesystem',
        source: 'File Watcher',
        payload: {
          path: relativePath,
          projectName,
          absolutePath: filePath,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(`Error handling file changed event for ${filePath}`, error);
    }
  }

  /**
   * Handle file deleted event
   */
  private async handleFileDeleted(filePath: string) {
    try {
      const projectName = this.getProjectName(filePath);
      if (!projectName) return;

      const relativePath = this.getRelativePath(filePath);

      this.logger.debug(`File deleted: ${relativePath}`);

      await this.eventRouter.publishEvent({
        name: 'File Deleted',
        group: 'Filesystem',
        source: 'File Watcher',
        payload: {
          path: relativePath,
          projectName,
          absolutePath: filePath,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(`Error handling file deleted event for ${filePath}`, error);
    }
  }

  /**
   * Handle directory added event
   */
  private async handleDirectoryAdded(dirPath: string) {
    try {
      const projectName = this.getProjectName(dirPath);
      if (!projectName) return;

      const relativePath = this.getRelativePath(dirPath);

      this.logger.debug(`Directory added: ${relativePath}`);

      await this.eventRouter.publishEvent({
        name: 'Directory Created',
        group: 'Filesystem',
        source: 'File Watcher',
        payload: {
          path: relativePath,
          projectName,
          absolutePath: dirPath,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(`Error handling directory added event for ${dirPath}`, error);
    }
  }

  /**
   * Handle directory deleted event
   */
  private async handleDirectoryDeleted(dirPath: string) {
    try {
      const projectName = this.getProjectName(dirPath);
      if (!projectName) return;

      const relativePath = this.getRelativePath(dirPath);

      this.logger.debug(`Directory deleted: ${relativePath}`);

      await this.eventRouter.publishEvent({
        name: 'Directory Deleted',
        group: 'Filesystem',
        source: 'File Watcher',
        payload: {
          path: relativePath,
          projectName,
          absolutePath: dirPath,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(`Error handling directory deleted event for ${dirPath}`, error);
    }
  }

  /**
   * Handle watcher errors
   */
  private handleError(error: Error) {
    this.logger.error('File watcher error', error);
  }

  /**
   * Check if watcher is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
