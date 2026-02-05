/**
 * Project Tools Service
 *
 * Manages dynamic Python MCP tools located in project directories.
 * Provides hot-reload capability through file watching, automatic
 * dependency installation, and subprocess-based tool execution.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs-extra';
import {
  ProjectToolDefinition,
  ProjectToolsCache,
  ToolExecutionResult,
} from './project-tools.types';
import { McpTool } from '../types';
import { parseToolFile } from './tool-parser';

@Injectable()
export class ProjectToolsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectToolsService.name);
  private watcher: chokidar.FSWatcher | null = null;
  private readonly workspaceDir: string;

  /** Cache of tools per project: Map<projectRoot, ProjectToolsCache> */
  private toolsCache = new Map<string, ProjectToolsCache>();

  /** Track ongoing pip installations to avoid duplicates */
  private pendingInstalls = new Set<string>();

  /** Default execution timeout in milliseconds */
  private readonly defaultTimeout = 30000;

  constructor() {
    this.workspaceDir = process.env.WORKSPACE_ROOT || path.join(process.cwd(), '..', 'workspace');
  }

  async onModuleInit() {
    await this.initializeFileWatcher();
    this.logger.log(`Project Tools Service initialized, watching: ${this.workspaceDir}`);
  }

  async onModuleDestroy() {
    if (this.watcher) {
      await this.watcher.close();
      this.logger.log('Project Tools file watcher closed');
    }
  }

  /**
   * Initialize the file watcher for .etienne/tools/ directories
   */
  private async initializeFileWatcher() {
    try {
      await fs.ensureDir(this.workspaceDir);

      // Watch for .etienne/tools/ directories across all projects
      const watchPattern = path.join(this.workspaceDir, '*', '.etienne', 'tools');

      this.watcher = chokidar.watch(watchPattern, {
        persistent: true,
        ignoreInitial: true,
        depth: 2,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      });

      this.watcher
        .on('add', (filePath) => this.handleFileAdded(filePath))
        .on('change', (filePath) => this.handleFileChanged(filePath))
        .on('unlink', (filePath) => this.handleFileDeleted(filePath))
        .on('error', (error) => this.logger.error('File watcher error', error))
        .on('ready', () => {
          this.logger.log('Project Tools file watcher ready');
        });
    } catch (error) {
      this.logger.error('Failed to initialize file watcher', error);
    }
  }

  /**
   * Handle file added event
   */
  private async handleFileAdded(filePath: string) {
    const projectRoot = this.getProjectRoot(filePath);
    if (!projectRoot) return;

    if (filePath.endsWith('requirements.txt')) {
      this.logger.log(`Requirements added: ${filePath}`);
      await this.installDependencies(projectRoot);
    } else if (filePath.endsWith('.py')) {
      this.logger.log(`Python tool added: ${filePath}`);
      this.invalidateCache(projectRoot);
    }
  }

  /**
   * Handle file changed event
   */
  private async handleFileChanged(filePath: string) {
    const projectRoot = this.getProjectRoot(filePath);
    if (!projectRoot) return;

    if (filePath.endsWith('requirements.txt')) {
      this.logger.log(`Requirements changed: ${filePath}`);
      await this.installDependencies(projectRoot);
    } else if (filePath.endsWith('.py')) {
      this.logger.log(`Python tool changed: ${filePath}`);
      this.invalidateCache(projectRoot);
    }
  }

  /**
   * Handle file deleted event
   */
  private handleFileDeleted(filePath: string) {
    const projectRoot = this.getProjectRoot(filePath);
    if (!projectRoot) return;

    if (filePath.endsWith('.py')) {
      this.logger.log(`Python tool deleted: ${filePath}`);
      this.invalidateCache(projectRoot);
    }
  }

  /**
   * Extract project root from a file path
   */
  private getProjectRoot(filePath: string): string | null {
    const relativePath = path.relative(this.workspaceDir, filePath);
    const parts = relativePath.split(path.sep);
    if (parts.length > 0) {
      return path.join(this.workspaceDir, parts[0]);
    }
    return null;
  }

  /**
   * Invalidate the cache for a specific project
   */
  private invalidateCache(projectRoot: string) {
    const cache = this.toolsCache.get(projectRoot);
    if (cache) {
      cache.isValid = false;
      this.logger.log(`Cache invalidated for: ${projectRoot}`);
    }
  }

  /**
   * Install dependencies from requirements.txt
   */
  private async installDependencies(projectRoot: string): Promise<void> {
    const requirementsPath = path.join(projectRoot, '.etienne', 'tools', 'requirements.txt');
    const packagesDir = path.join(projectRoot, '.etienne', 'tools', '.packages');

    // Check if requirements.txt exists
    if (!await fs.pathExists(requirementsPath)) {
      return;
    }

    // Avoid duplicate installations
    if (this.pendingInstalls.has(projectRoot)) {
      this.logger.log(`Pip install already in progress for: ${projectRoot}`);
      return;
    }

    this.pendingInstalls.add(projectRoot);
    this.logger.log(`Installing dependencies for: ${projectRoot}`);

    try {
      // Ensure packages directory exists
      await fs.ensureDir(packagesDir);

      // Run pip install
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('pip', [
          'install',
          '-r', requirementsPath,
          '--target', packagesDir,
          '--quiet',
        ], {
          cwd: projectRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderr = '';
        proc.stderr?.on('data', (data) => { stderr += data; });

        proc.on('close', (code) => {
          if (code === 0) {
            this.logger.log(`Dependencies installed successfully for: ${projectRoot}`);
            resolve();
          } else {
            this.logger.error(`Pip install failed for ${projectRoot}: ${stderr}`);
            reject(new Error(stderr));
          }
        });

        proc.on('error', (error) => {
          this.logger.error(`Pip install error for ${projectRoot}:`, error);
          reject(error);
        });
      });

      // Invalidate cache after installing dependencies
      this.invalidateCache(projectRoot);
    } catch (error) {
      this.logger.error(`Failed to install dependencies for ${projectRoot}:`, error);
    } finally {
      this.pendingInstalls.delete(projectRoot);
    }
  }

  /**
   * Get tools for a specific project (as McpTool format)
   * Returns cached tools if valid, otherwise re-scans
   */
  async getTools(projectRoot: string): Promise<McpTool[]> {
    const toolDefs = await this.getToolDefinitions(projectRoot);

    return toolDefs.map((def) => ({
      name: `py_${def.name}`,
      description: `[Python] ${def.description}`,
      inputSchema: def.inputSchema,
    }));
  }

  /**
   * Get tool definitions for a project
   */
  async getToolDefinitions(projectRoot: string): Promise<ProjectToolDefinition[]> {
    const cache = this.toolsCache.get(projectRoot);

    if (cache && cache.isValid) {
      return cache.tools;
    }

    // Re-scan tools
    const tools = await this.scanProjectTools(projectRoot);

    this.toolsCache.set(projectRoot, {
      tools,
      lastScanned: new Date(),
      isValid: true,
    });

    return tools;
  }

  /**
   * Scan a project's .etienne/tools/ directory for Python tools
   */
  private async scanProjectTools(projectRoot: string): Promise<ProjectToolDefinition[]> {
    const toolsDir = path.join(projectRoot, '.etienne', 'tools');

    if (!await fs.pathExists(toolsDir)) {
      return [];
    }

    const tools: ProjectToolDefinition[] = [];

    try {
      // Find all Python files (excluding __pycache__ and hidden files)
      const entries = await fs.readdir(toolsDir);
      const pyFiles = entries
        .filter((f) => f.endsWith('.py') && !f.startsWith('.') && !f.startsWith('_'))
        .map((f) => path.join(toolsDir, f));

      for (const filePath of pyFiles) {
        const fileName = path.basename(filePath);

        try {
          const metadata = await parseToolFile(filePath);
          if (metadata) {
            const stat = await fs.stat(filePath);
            tools.push({
              ...metadata,
              filePath,
              lastModified: stat.mtime,
            });
            this.logger.log(`Discovered tool: py_${metadata.name} from ${fileName}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to parse tool ${filePath}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to scan tools directory ${toolsDir}:`, error);
    }

    return tools;
  }

  /**
   * Execute a Python tool
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    projectRoot: string,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // Remove py_ prefix to get actual tool name
    const actualName = toolName.startsWith('py_') ? toolName.substring(3) : toolName;

    // Find the tool definition
    const toolDefs = await this.getToolDefinitions(projectRoot);
    const toolDef = toolDefs.find((t) => t.name === actualName);

    if (!toolDef) {
      return {
        success: false,
        error: {
          type: 'not_found',
          message: `Tool not found: ${toolName}`,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    const timeout = toolDef.timeout || this.defaultTimeout;
    const packagesDir = path.join(projectRoot, '.etienne', 'tools', '.packages');

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set up PYTHONPATH to include the packages directory
      const pythonPath = [
        packagesDir,
        process.env.PYTHONPATH || '',
      ].filter(Boolean).join(path.delimiter);

      const proc: ChildProcess = spawn('python3', [toolDef.filePath], {
        cwd: projectRoot,
        env: {
          ...process.env,
          PYTHONPATH: pythonPath,
          PROJECT_ROOT: projectRoot,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 1000);
      }, timeout);

      // Send input as JSON via stdin
      proc.stdin?.write(JSON.stringify(args));
      proc.stdin?.end();

      // Collect output
      proc.stdout?.on('data', (data) => { stdout += data; });
      proc.stderr?.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        const executionTimeMs = Date.now() - startTime;

        if (killed) {
          resolve({
            success: false,
            error: {
              type: 'timeout',
              message: `Tool execution timed out after ${timeout}ms`,
              stderr,
            },
            executionTimeMs,
          });
          return;
        }

        if (code !== 0) {
          resolve({
            success: false,
            error: {
              type: 'execution_error',
              message: `Tool exited with code ${code}`,
              stderr,
              exitCode: code || undefined,
            },
            executionTimeMs,
          });
          return;
        }

        // Try to parse stdout as JSON
        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            result,
            executionTimeMs,
          });
        } catch {
          resolve({
            success: false,
            error: {
              type: 'parse_error',
              message: 'Tool returned invalid JSON',
              stderr: stdout,
            },
            executionTimeMs,
          });
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: {
            type: 'execution_error',
            message: error.message,
          },
          executionTimeMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Check if a tool exists
   */
  async hasProjectTool(toolName: string, projectRoot: string): Promise<boolean> {
    const actualName = toolName.startsWith('py_') ? toolName.substring(3) : toolName;
    const toolDefs = await this.getToolDefinitions(projectRoot);
    return toolDefs.some((t) => t.name === actualName);
  }
}
