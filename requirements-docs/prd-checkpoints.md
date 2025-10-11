# Version controlled workspace: Checkpoints feature
I want to use the git installation inside of the Docker container to achieve a backup/restore functionality on a project folder level in /workspace/<project>. As this checkpoints feature is not available with claude in headless mode we must emulate it.

Git should use /workspace/.checkpoints to store the repos.

## Frontend
Create a new component CheckpointsPane.jsx which will be used in the FilesPanel. The files panel contains a tab strip control with the items "Files" and "Checkpoints" on top. The tab content of "Files" is the current Filesystem.jsx component, the tab content of the new "Checkpoins" tab is the CheckpointsPane.jsx component.

The CheckpointsPane displays existing checkpoints as a list sorted by newest checkpoint on top. The first line in the list is a text input field with the placeholder "describe this checkpoint" with a + icon button on the right side. Pressing the button creates a new checkpoint with the backend api.

Each existing checkpoint in the list can be clicked and then opens a new modal dialog with the title "Checkpoint: <description>" and the options "Reset Files to this checkpoint" or "Delete checkpoint".

Use this icon to symbolize checkpoints import { MdOutlineRestorePage } from "react-icons/md";

## Backend
Create a new controller /api/checkpoints with CRUD methods to be used by the frontend.

The controller uses a service in a separate file which is configured to use different CheckpointProviders. Currently we have only one CheckpointProvider named "GitCheckpointProvider" which is the git implementation described below.

The GitCheckpointProvider behaves differently depending on the NODE_ENV variable: in development mode we control git using the DOCKER EXEC <bash cmd> variant, in production mode we control git using direct console commands. In development our backend application will be installed side-by-side with the docker container, while in production mode our backend application will be deployed inside the container.

## How It Works

Backup Process:

Initializes a Git repository in /workspace/.checkpoints (if not exists)
Copies the entire project folder to .backups/<project>/
Creates a Git commit with the provided message
Returns the commit hash


Restore Process:

Searches for a commit with the matching message
Checks out that specific commit
Copies files from .backups/<project>/ back to /workspace/<project>/
Resets the Git working directory to HEAD


All Git operations execute inside the Docker container via docker exec claude-code bash -c "..."

This implementation provides version control with human-readable commit messages that act as backup names, making it easy to create and restore specific versions of your projects!

## Example Backend Implementation

#### Controller
---------
import { Controller, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { VersionControlService } from './version-control.service';

class BackupDto {
  commitMessage: string;
}

class RestoreDto {
  commitMessage: string;
}

@Controller('api/version-control')
export class VersionControlController {
  constructor(private readonly versionControlService: VersionControlService) {}

  @Post(':project/backup')
  async backup(
    @Param('project') project: string,
    @Body() backupDto: BackupDto,
  ) {
    try {
      const commitHash = await this.versionControlService.backup(
        project,
        backupDto.commitMessage,
      );
      return {
        success: true,
        message: 'Backup created successfully',
        project,
        commitMessage: backupDto.commitMessage,
        commitHash,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':project/restore')
  async restore(
    @Param('project') project: string,
    @Body() restoreDto: RestoreDto,
  ) {
    try {
      await this.versionControlService.restore(
        project,
        restoreDto.commitMessage,
      );
      return {
        success: true,
        message: 'Project restored successfully',
        project,
        commitMessage: restoreDto.commitMessage,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':project/list')
  async listBackups(@Param('project') project: string) {
    try {
      const backups = await this.versionControlService.listBackups(project);
      return {
        success: true,
        project,
        backups,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
----------

#### Service
-------------
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class VersionControlService {
  private readonly logger = new Logger(VersionControlService.name);
  private readonly containerName = 'claude-code';
  private readonly backupDir = '/workspace/.backups';
  private readonly workspaceDir = '/workspace';

  /**
   * Execute a command inside the Docker container
   */
  private async execInContainer(command: string): Promise<string> {
    const fullCommand = `docker exec ${this.containerName} bash -c "${command.replace(/"/g, '\\"')}"`;
    this.logger.debug(`Executing: ${fullCommand}`);
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand);
      if (stderr && !stderr.includes('warning')) {
        this.logger.warn(`Command stderr: ${stderr}`);
      }
      return stdout.trim();
    } catch (error) {
      this.logger.error(`Command failed: ${error.message}`);
      throw new Error(`Docker exec failed: ${error.message}`);
    }
  }

  /**
   * Initialize git repository if it doesn't exist
   */
  private async ensureGitRepo(): Promise<void> {
    try {
      // Check if .backups directory exists
      await this.execInContainer(`[ -d "${this.backupDir}" ] || mkdir -p "${this.backupDir}"`);
      
      // Check if it's a git repo
      const isGitRepo = await this.execInContainer(
        `cd "${this.backupDir}" && git rev-parse --git-dir 2>/dev/null || echo "not-a-repo"`
      );

      if (isGitRepo === 'not-a-repo') {
        this.logger.log('Initializing git repository in .backups');
        await this.execInContainer(`cd "${this.backupDir}" && git init`);
        await this.execInContainer(
          `cd "${this.backupDir}" && git config user.email "backup@workspace.local" && git config user.name "Workspace Backup"`
        );
      }
    } catch (error) {
      throw new Error(`Failed to initialize git repository: ${error.message}`);
    }
  }

  /**
   * Create a backup of a project
   */
  async backup(project: string, commitMessage: string): Promise<string> {
    await this.ensureGitRepo();

    const projectPath = `${this.workspaceDir}/${project}`;
    const backupProjectPath = `${this.backupDir}/${project}`;

    try {
      // Check if project exists
      await this.execInContainer(`[ -d "${projectPath}" ] || exit 1`);

      // Create backup directory for project if it doesn't exist
      await this.execInContainer(`mkdir -p "${backupProjectPath}"`);

      // Copy project files to backup directory (exclude .backups itself)
      await this.execInContainer(
        `rsync -a --delete --exclude='.backups' "${projectPath}/" "${backupProjectPath}/"`
      );

      // Git add and commit
      await this.execInContainer(`cd "${this.backupDir}" && git add "${project}"`);
      
      // Check if there are changes to commit
      const status = await this.execInContainer(
        `cd "${this.backupDir}" && git status --porcelain "${project}"`
      );

      if (!status) {
        this.logger.warn('No changes to commit');
        // Get the last commit hash
        const lastCommit = await this.execInContainer(
          `cd "${this.backupDir}" && git log -1 --format=%H -- "${project}" 2>/dev/null || echo "none"`
        );
        return lastCommit !== 'none' ? lastCommit : 'no-changes';
      }

      await this.execInContainer(
        `cd "${this.backupDir}" && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`
      );

      // Get commit hash
      const commitHash = await this.execInContainer(
        `cd "${this.backupDir}" && git log -1 --format=%H`
      );

      this.logger.log(`Backup created for ${project}: ${commitHash}`);
      return commitHash;
    } catch (error) {
      throw new Error(`Backup failed for project ${project}: ${error.message}`);
    }
  }

  /**
   * Restore a project from a specific commit
   */
  async restore(project: string, commitMessage: string): Promise<void> {
    await this.ensureGitRepo();

    const projectPath = `${this.workspaceDir}/${project}`;
    const backupProjectPath = `${this.backupDir}/${project}`;

    try {
      // Find commit by message
      const commitHash = await this.execInContainer(
        `cd "${this.backupDir}" && git log --all --grep="${commitMessage.replace(/"/g, '\\"')}" --format=%H -1`
      );

      if (!commitHash) {
        throw new Error(`No backup found with commit message: ${commitMessage}`);
      }

      this.logger.log(`Found commit ${commitHash} for message: ${commitMessage}`);

      // Create a temporary worktree or checkout the specific commit
      // We'll use a safer approach: checkout the file from that commit
      await this.execInContainer(
        `cd "${this.backupDir}" && git checkout ${commitHash} -- "${project}"`
      );

      // Ensure project directory exists
      await this.execInContainer(`mkdir -p "${projectPath}"`);

      // Copy files from backup to project
      await this.execInContainer(
        `rsync -a --delete "${backupProjectPath}/" "${projectPath}/"`
      );

      // Return to HEAD
      await this.execInContainer(`cd "${this.backupDir}" && git reset HEAD`);

      this.logger.log(`Project ${project} restored from commit ${commitHash}`);
    } catch (error) {
      throw new Error(`Restore failed for project ${project}: ${error.message}`);
    }
  }

  /**
   * List all backups for a project
   */
  async listBackups(project: string): Promise<Array<{ hash: string; message: string; date: string }>> {
    await this.ensureGitRepo();

    try {
      const log = await this.execInContainer(
        `cd "${this.backupDir}" && git log --all --format="%H|%s|%ai" -- "${project}"`
      );

      if (!log) {
        return [];
      }

      return log.split('\n').map(line => {
        const [hash, message, date] = line.split('|');
        return { hash, message, date };
      });
    } catch (error) {
      throw new Error(`Failed to list backups for project ${project}: ${error.message}`);
    }
  }
}
-----------