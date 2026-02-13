import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ICheckpointProvider, Checkpoint, FileChange, GitTag, GitConnectionStatus } from './checkpoint-provider.interface';

const execAsync = promisify(exec);

interface CheckpointManifest {
  checkpoints: Checkpoint[];
}

@Injectable()
export class GiteaCheckpointProvider implements ICheckpointProvider {
  private readonly logger = new Logger(GiteaCheckpointProvider.name);
  private readonly giteaUrl: string;
  private readonly giteaUsername: string;
  private readonly giteaPassword: string;
  private readonly giteaRepo: string;
  private readonly workspaceDir: string;
  private readonly tempDir: string;
  private axiosClient: AxiosInstance;
  private giteaActualUsername: string | null = null;

  constructor() {
    this.giteaUrl = process.env.GITEA_URL || 'http://localhost:3000';
    this.giteaUsername = process.env.GITEA_USERNAME || 'ralph.goellner@e-ntegration.de';
    this.giteaPassword = process.env.GITEA_PASSWORD || 'gitea123';
    this.giteaRepo = process.env.GITEA_REPO || 'workspace-checkpoints';
    this.workspaceDir = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
    this.tempDir = process.env.TEMP || process.env.TMP || 'C:/Temp/checkpoints';

    // Create axios client with basic auth
    this.axiosClient = axios.create({
      baseURL: `${this.giteaUrl}/api/v1`,
      auth: {
        username: this.giteaUsername,
        password: this.giteaPassword,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`Gitea provider initialized: ${this.giteaUrl}, repo: ${this.giteaRepo}`);
  }

  /**
   * Get the actual Gitea username (cached after first call)
   */
  private async getGiteaUsername(): Promise<string> {
    if (this.giteaActualUsername) {
      return this.giteaActualUsername;
    }

    try {
      const response = await this.axiosClient.get('/user');
      this.giteaActualUsername = response.data.login;
      return this.giteaActualUsername;
    } catch (error: any) {
      throw new Error(`Failed to get Gitea username: ${error.message}`);
    }
  }

  /**
   * Execute a command directly on localhost
   */
  private async execCommand(command: string): Promise<string> {
    this.logger.debug(`Executing: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 50 * 1024 * 1024,
        shell: 'bash'
      });
      if (stderr && !stderr.includes('warning') && !stderr.toLowerCase().includes('already exists')) {
        this.logger.warn(`Command stderr: ${stderr}`);
      }
      return stdout.trim();
    } catch (error: any) {
      this.logger.error(`Command failed: ${error.message}`);
      throw new Error(`Command execution failed: ${error.message}`);
    }
  }

  /**
   * Get the path to the manifest file for a project
   */
  private getManifestPath(project: string): string {
    return path.join(this.workspaceDir, project, '.etienne', 'checkpoints.json');
  }

  /**
   * Read the checkpoint manifest for a project
   */
  private async readManifest(project: string): Promise<CheckpointManifest> {
    const manifestPath = this.getManifestPath(project);

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      return manifest.checkpoints ? manifest : { checkpoints: [] };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty
        return { checkpoints: [] };
      }
      this.logger.warn(`Failed to read manifest for ${project}, returning empty`);
      return { checkpoints: [] };
    }
  }

  /**
   * Write the checkpoint manifest for a project
   */
  private async writeManifest(project: string, manifest: CheckpointManifest): Promise<void> {
    const manifestPath = this.getManifestPath(project);
    const manifestDir = path.dirname(manifestPath);

    // Ensure .etienne directory exists
    await fs.mkdir(manifestDir, { recursive: true });

    // Write manifest
    const jsonContent = JSON.stringify(manifest, null, 2);
    await fs.writeFile(manifestPath, jsonContent, 'utf-8');
  }

  /**
   * Get or create the Gitea repository
   */
  private async ensureGitRepo(): Promise<void> {
    try {
      const username = await this.getGiteaUsername();

      // Check if repository exists
      try {
        await this.axiosClient.get(`/repos/${username}/${this.giteaRepo}`);
        this.logger.debug(`Repository ${this.giteaRepo} already exists`);
        return;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw error;
        }
        // Repository doesn't exist, create it
        this.logger.log(`Creating repository ${this.giteaRepo}`);
      }

      // Create repository
      await this.axiosClient.post('/user/repos', {
        name: this.giteaRepo,
        description: 'Workspace checkpoints repository',
        private: false,
        auto_init: true,
      });

      this.logger.log(`Repository ${this.giteaRepo} created successfully`);
    } catch (error: any) {
      const message = error.response?.data?.message || error.message;
      throw new Error(`Failed to ensure Gitea repository: ${message}`);
    }
  }

  /**
   * Create a tarball of the project directory
   */
  private async createTarball(project: string): Promise<string> {
    const projectPath = path.join(this.workspaceDir, project);
    const tarballName = `${project}-${Date.now()}.tar.gz`;
    const tarballPath = path.join(this.tempDir, tarballName);

    try {
      // Create temp directory
      await fs.mkdir(this.tempDir, { recursive: true });

      // Create tarball excluding .checkpoints directory
      // Convert Windows paths to MSYS/Git Bash format: C:/path -> /c/path
      const workspacePathMsys = this.workspaceDir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');
      const tarballPathMsys = tarballPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');

      await this.execCommand(
        `cd "${workspacePathMsys}" && tar --exclude='.checkpoints' -czf "${tarballPathMsys}" "${project}"`
      );

      return tarballPath;
    } catch (error: any) {
      throw new Error(`Failed to create tarball: ${error.message}`);
    }
  }

  /**
   * Upload file to Gitea and create commit
   */
  private async uploadToGitea(project: string, tarballPath: string, message: string): Promise<string> {
    try {
      await this.ensureGitRepo();

      const username = await this.getGiteaUsername();

      // Read tarball content as base64
      const tarballBuffer = await fs.readFile(tarballPath);
      const tarballContent = tarballBuffer.toString('base64');

      // Get the default branch (usually 'main' or 'master')
      const repoInfo = await this.axiosClient.get(`/repos/${username}/${this.giteaRepo}`);
      const defaultBranch = repoInfo.data.default_branch || 'main';

      // Define file path in repo
      const filePath = `${project}/${Date.now()}.tar.gz`;

      // Check if file exists (for updates)
      let sha: string | undefined;
      try {
        const fileInfo = await this.axiosClient.get(
          `/repos/${username}/${this.giteaRepo}/contents/${filePath}`,
          {
            params: { ref: defaultBranch },
          }
        );
        sha = fileInfo.data.sha;
      } catch (error: any) {
        // File doesn't exist, which is fine for first commit
        if (error.response?.status !== 404) {
          throw error;
        }
      }

      // Create or update file
      const payload: any = {
        message: message,
        content: tarballContent,
        branch: defaultBranch,
      };

      if (sha) {
        payload.sha = sha;
      }

      const response = await this.axiosClient.post(
        `/repos/${username}/${this.giteaRepo}/contents/${filePath}`,
        payload
      );

      const commitSha = response.data.commit.sha;
      this.logger.log(`Uploaded to Gitea, commit: ${commitSha}`);

      return commitSha;
    } catch (error: any) {
      const message = error.response?.data?.message || error.message;
      throw new Error(`Failed to upload to Gitea: ${message}`);
    }
  }

  /**
   * Download and extract checkpoint from Gitea
   */
  private async downloadFromGitea(project: string, commitHash: string): Promise<void> {
    try {
      const username = await this.getGiteaUsername();

      // Get files in the project directory at the specific commit
      const response = await this.axiosClient.get(
        `/repos/${username}/${this.giteaRepo}/contents/${project}`,
        {
          params: { ref: commitHash },
        }
      );

      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error(`No files found for project ${project} at commit ${commitHash}`);
      }

      // Find the tarball file (most recent one)
      const files = response.data.filter((f: any) => f.name.endsWith('.tar.gz'));
      if (files.length === 0) {
        throw new Error(`No tarball found for project ${project} at commit ${commitHash}`);
      }

      // Sort by name (which includes timestamp) and get the most recent
      files.sort((a: any, b: any) => b.name.localeCompare(a.name));
      const tarballFile = files[0];

      // Get the file info to retrieve the blob SHA
      const fileResponse = await this.axiosClient.get(
        `/repos/${username}/${this.giteaRepo}/contents/${project}/${tarballFile.name}`,
        {
          params: { ref: commitHash },
        }
      );

      const tarballPath = path.join(this.tempDir, tarballFile.name);

      // Check if content is available directly (for small files)
      let tarballBuffer: Buffer;

      if (fileResponse.data.content) {
        // Small files have content directly
        this.logger.debug('File content available directly, decoding base64');
        const cleanContent = fileResponse.data.content.replace(/\n/g, '').replace(/\r/g, '');
        tarballBuffer = Buffer.from(cleanContent, 'base64');
      } else {
        // For large files, use the raw download endpoint
        this.logger.debug(`File is large, downloading raw content from: ${fileResponse.data.download_url}`);

        // Download the raw file directly (not via API, raw download)
        // Gitea raw URL format: /{owner}/{repo}/raw/commit/{hash}/{filepath}
        const rawUrl = `${this.giteaUrl}/${username}/${this.giteaRepo}/raw/commit/${commitHash}/${project}/${tarballFile.name}`;
        this.logger.debug(`Raw download URL: ${rawUrl}`);

        const rawResponse = await axios.get(rawUrl, {
          auth: {
            username: this.giteaUsername,
            password: this.giteaPassword,
          },
          responseType: 'arraybuffer',
        });

        tarballBuffer = Buffer.from(rawResponse.data);
        this.logger.debug(`Downloaded ${tarballBuffer.length} bytes`);
      }

      // Create temp directory and write tarball
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.writeFile(tarballPath, tarballBuffer);

      // Extract tarball to workspace, excluding checkpoints.json
      // Convert Windows paths to MSYS/Git Bash format: C:/path -> /c/path
      const workspacePathMsys = this.workspaceDir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');
      const tarballPathMsys = tarballPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');

      await this.execCommand(
        `cd "${workspacePathMsys}" && tar -xzf "${tarballPathMsys}" --exclude='.etienne/checkpoints.json'`
      );

      // Clean up tarball
      await fs.unlink(tarballPath);

      this.logger.log(`Extracted checkpoint for ${project} from commit ${commitHash}`);
    } catch (error: any) {
      const message = error.response?.data?.message || error.message;
      throw new Error(`Failed to download from Gitea: ${message}`);
    }
  }

  /**
   * Create a checkpoint/backup of a project
   */
  async backup(project: string, message: string): Promise<string> {
    if (!message || typeof message !== 'string') {
      throw new Error('Checkpoint message is required');
    }

    const projectPath = path.join(this.workspaceDir, project);

    try {
      // Check if project exists
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error(`Project ${project} is not a directory`);
      }

      // Create tarball
      this.logger.log(`Creating tarball for project ${project}`);
      const tarballPath = await this.createTarball(project);

      // Upload to Gitea
      this.logger.log(`Uploading to Gitea for project ${project}`);
      const commitHash = await this.uploadToGitea(project, tarballPath, message);

      // Clean up tarball
      await fs.unlink(tarballPath);

      // Update manifest
      const manifest = await this.readManifest(project);
      manifest.checkpoints.unshift({
        timestamp_created: new Date().toISOString(),
        commit: message,
        gitId: commitHash,
      });
      await this.writeManifest(project, manifest);

      this.logger.log(`Checkpoint created for ${project}: ${commitHash}`);
      return commitHash;
    } catch (error: any) {
      throw new Error(`Checkpoint failed for project ${project}: ${error.message}`);
    }
  }

  /**
   * Restore a project from a specific checkpoint
   */
  async restore(project: string, commitHash: string): Promise<void> {
    try {
      this.logger.log(`Restoring project ${project} from commit ${commitHash}`);

      // Download and extract from Gitea
      await this.downloadFromGitea(project, commitHash);

      this.logger.log(`Project ${project} restored from commit ${commitHash}`);
    } catch (error: any) {
      throw new Error(`Restore failed for project ${project}: ${error.message}`);
    }
  }

  /**
   * List all checkpoints for a project
   */
  async list(project: string): Promise<Checkpoint[]> {
    try {
      const manifest = await this.readManifest(project);
      return manifest.checkpoints;
    } catch (error: any) {
      throw new Error(`Failed to list checkpoints for project ${project}: ${error.message}`);
    }
  }

  /**
   * Delete a specific checkpoint
   */
  async delete(project: string, commitHash: string): Promise<void> {
    try {
      this.logger.log(`Deleting checkpoint ${commitHash} for project ${project}`);

      // Read manifest and remove the checkpoint
      const manifest = await this.readManifest(project);
      const originalLength = manifest.checkpoints.length;
      manifest.checkpoints = manifest.checkpoints.filter(cp => cp.gitId !== commitHash);

      if (manifest.checkpoints.length === originalLength) {
        throw new Error(`Checkpoint ${commitHash} not found in manifest`);
      }

      // Write updated manifest
      await this.writeManifest(project, manifest);

      this.logger.log(`Checkpoint ${commitHash} removed from manifest`);
    } catch (error: any) {
      throw new Error(`Delete failed for checkpoint ${commitHash}: ${error.message}`);
    }
  }

  async getChanges(): Promise<FileChange[]> {
    throw new Error('getChanges not supported by legacy Gitea provider');
  }

  async discardFile(): Promise<void> {
    throw new Error('discardFile not supported by legacy Gitea provider');
  }

  async getCommitFiles(): Promise<FileChange[]> {
    throw new Error('getCommitFiles not supported by legacy Gitea provider');
  }

  async createTag(): Promise<void> {
    throw new Error('createTag not supported by legacy Gitea provider');
  }

  async listTags(): Promise<GitTag[]> {
    throw new Error('listTags not supported by legacy Gitea provider');
  }

  async checkConnection(): Promise<GitConnectionStatus> {
    throw new Error('checkConnection not supported by legacy Gitea provider');
  }
}
