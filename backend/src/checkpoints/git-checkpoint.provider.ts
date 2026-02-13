import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ICheckpointProvider, Checkpoint, FileChange, GitTag, GitConnectionStatus } from './checkpoint-provider.interface';

const execAsync = promisify(exec);

interface CheckpointManifest {
  checkpoints: Checkpoint[];
}

@Injectable()
export class GitCheckpointProvider implements ICheckpointProvider {
  private readonly logger = new Logger(GitCheckpointProvider.name);
  private readonly containerName = 'claude-code';
  private readonly checkpointsDir = '/workspace/.checkpoints';
  private readonly workspaceDir = '/workspace';
  private readonly isDevelopment = process.env.NODE_ENV !== 'production';

  /**
   * Execute a command (in container for dev, or directly in production)
   */
  private async execCommand(command: string): Promise<string> {
    let fullCommand: string;

    if (this.isDevelopment) {
      // Escape double quotes for bash
      const escapedCommand = command.replace(/"/g, '\\"');
      fullCommand = `docker exec ${this.containerName} bash -c "${escapedCommand}"`;
    } else {
      fullCommand = command;
    }

    this.logger.debug(`Executing: ${fullCommand}`);

    try {
      const { stdout, stderr } = await execAsync(fullCommand, { maxBuffer: 10 * 1024 * 1024 });
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
    return `${this.workspaceDir}/${project}/.etienne/checkpoints.json`;
  }

  /**
   * Read the checkpoint manifest for a project
   */
  private async readManifest(project: string): Promise<CheckpointManifest> {
    const manifestPath = this.getManifestPath(project);

    try {
      const content = await this.execCommand(`cat "${manifestPath}" 2>/dev/null || echo "{}"`);

      if (!content || content === '{}') {
        return { checkpoints: [] };
      }

      const manifest = JSON.parse(content);
      return manifest.checkpoints ? manifest : { checkpoints: [] };
    } catch (error) {
      this.logger.warn(`Failed to read manifest for ${project}, returning empty`);
      return { checkpoints: [] };
    }
  }

  /**
   * Write the checkpoint manifest for a project
   */
  private async writeManifest(project: string, manifest: CheckpointManifest): Promise<void> {
    const manifestPath = this.getManifestPath(project);
    const manifestDir = `${this.workspaceDir}/${project}/.etienne`;

    // Ensure .etienne directory exists
    await this.execCommand(`mkdir -p "${manifestDir}"`);

    // Write manifest using base64 encoding to avoid escaping issues
    const jsonContent = JSON.stringify(manifest, null, 2);
    const base64Content = Buffer.from(jsonContent).toString('base64');

    await this.execCommand(`echo "${base64Content}" | base64 -d > "${manifestPath}"`);
  }

  /**
   * Initialize git repository if it doesn't exist
   */
  private async ensureGitRepo(): Promise<void> {
    try {
      // Check if .checkpoints directory exists
      await this.execCommand(`[ -d "${this.checkpointsDir}" ] || mkdir -p "${this.checkpointsDir}"`);

      // Check if it's a git repo
      const isGitRepo = await this.execCommand(
        `cd "${this.checkpointsDir}" && git rev-parse --git-dir 2>/dev/null || echo "not-a-repo"`
      );

      if (isGitRepo === 'not-a-repo') {
        this.logger.log('Initializing git repository in .checkpoints');
        await this.execCommand(`cd "${this.checkpointsDir}" && git init`);
        await this.execCommand(
          `cd "${this.checkpointsDir}" && git config user.email "checkpoint@workspace.local" && git config user.name "Workspace Checkpoint"`
        );
      }
    } catch (error: any) {
      throw new Error(`Failed to initialize git repository: ${error.message}`);
    }
  }

  /**
   * Create a checkpoint/backup of a project
   */
  async backup(project: string, message: string): Promise<string> {
    if (!message || typeof message !== 'string') {
      throw new Error('Checkpoint message is required');
    }

    await this.ensureGitRepo();

    const projectPath = `${this.workspaceDir}/${project}`;
    const checkpointProjectPath = `${this.checkpointsDir}/${project}`;

    try {
      // Check if project exists
      await this.execCommand(`[ -d "${projectPath}" ] || exit 1`);

      // Create checkpoint directory for project if it doesn't exist
      await this.execCommand(`mkdir -p "${checkpointProjectPath}"`);

      // Copy project files to checkpoint directory (exclude .checkpoints itself, --no-g to skip group preservation, --omit-dir-times to skip directory times)
      await this.execCommand(
        `rsync -a --no-g --omit-dir-times --delete --exclude='.checkpoints' "${projectPath}/" "${checkpointProjectPath}/"`
      );

      // Git add and commit
      await this.execCommand(`cd "${this.checkpointsDir}" && git add "${project}"`);

      // Check if there are changes to commit
      const status = await this.execCommand(
        `cd "${this.checkpointsDir}" && git status --porcelain "${project}"`
      );

      if (!status) {
        this.logger.warn('No changes to commit');
        // Get the last checkpoint from manifest
        const manifest = await this.readManifest(project);
        if (manifest.checkpoints.length > 0) {
          return manifest.checkpoints[0].gitId;
        }
        return 'no-changes';
      }

      await this.execCommand(
        `cd "${this.checkpointsDir}" && git commit -m "${message.replace(/"/g, '\\"')}"`
      );

      // Get commit hash
      const commitHash = await this.execCommand(
        `cd "${this.checkpointsDir}" && git log -1 --format='%H'`
      );

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
    await this.ensureGitRepo();

    const projectPath = `${this.workspaceDir}/${project}`;
    const checkpointProjectPath = `${this.checkpointsDir}/${project}`;

    try {
      // Verify commit exists
      await this.execCommand(
        `cd "${this.checkpointsDir}" && git cat-file -e ${commitHash} 2>/dev/null`
      );

      this.logger.log(`Restoring project ${project} from commit ${commitHash}`);

      // Checkout the file from that commit
      await this.execCommand(
        `cd "${this.checkpointsDir}" && git checkout ${commitHash} -- "${project}"`
      );

      // Ensure project directory exists
      await this.execCommand(`mkdir -p "${projectPath}"`);

      // Copy files from checkpoint to project (--no-g to skip group preservation, --omit-dir-times to skip directory times)
      // Exclude checkpoints.json to preserve the checkpoint manifest
      await this.execCommand(
        `rsync -a --no-g --omit-dir-times --delete --exclude='.etienne/checkpoints.json' "${checkpointProjectPath}/" "${projectPath}/"`
      );

      // Return to HEAD
      await this.execCommand(`cd "${this.checkpointsDir}" && git reset HEAD`);

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
    throw new Error('getChanges not supported by legacy Git provider');
  }

  async discardFile(): Promise<void> {
    throw new Error('discardFile not supported by legacy Git provider');
  }

  async getCommitFiles(): Promise<FileChange[]> {
    throw new Error('getCommitFiles not supported by legacy Git provider');
  }

  async createTag(): Promise<void> {
    throw new Error('createTag not supported by legacy Git provider');
  }

  async listTags(): Promise<GitTag[]> {
    throw new Error('listTags not supported by legacy Git provider');
  }

  async checkConnection(): Promise<GitConnectionStatus> {
    throw new Error('checkConnection not supported by legacy Git provider');
  }
}
