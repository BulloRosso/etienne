import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ICheckpointProvider,
  Checkpoint,
  FileChange,
  GitTag,
  GitConnectionStatus,
} from './checkpoint-provider.interface';

const execAsync = promisify(exec);

@Injectable()
export class GiteaProjectCheckpointProvider implements ICheckpointProvider {
  private readonly logger = new Logger(GiteaProjectCheckpointProvider.name);
  private readonly giteaUrl: string;
  private readonly giteaUsername: string;
  private readonly giteaPassword: string;
  private readonly workspaceDir: string;
  private axiosClient: AxiosInstance;
  private giteaActualUsername: string | null = null;
  private initializedProjects = new Set<string>();

  constructor() {
    this.giteaUrl = process.env.GITEA_URL || 'http://localhost:3000';
    this.giteaUsername =
      process.env.GITEA_USERNAME || 'ralph.goellner@e-ntegration.de';
    this.giteaPassword = process.env.GITEA_PASSWORD || 'gitea123';
    this.workspaceDir =
      process.env.WORKSPACE_ROOT ||
      'C:/Data/GitHub/claude-multitenant/workspace';

    this.axiosClient = axios.create({
      baseURL: `${this.giteaUrl}/api/v1`,
      auth: {
        username: this.giteaUsername,
        password: this.giteaPassword,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    this.logger.log(
      `GiteaProject provider initialized: ${this.giteaUrl}`,
    );
  }

  // ── Helpers ──

  private async getGiteaUsername(): Promise<string> {
    if (this.giteaActualUsername) return this.giteaActualUsername;
    const response = await this.axiosClient.get('/user');
    const login: string = response.data.login;
    this.giteaActualUsername = login;
    return login;
  }

  private toMsysPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');
  }

  private getProjectPath(project: string): string {
    return path.join(this.workspaceDir, project);
  }

  private getRepoName(project: string): string {
    return `ws-${project}`;
  }

  private async getRemoteUrl(project: string): Promise<string> {
    const username = await this.getGiteaUsername();
    const encodedPassword = encodeURIComponent(this.giteaPassword);
    return `${this.giteaUrl.replace('://', `://${username}:${encodedPassword}@`)}/${username}/${this.getRepoName(project)}.git`;
  }

  private async execInProject(
    project: string,
    command: string,
  ): Promise<string> {
    const projectPath = this.toMsysPath(this.getProjectPath(project));
    const fullCommand = `cd "${projectPath}" && ${command}`;

    this.logger.debug(`Exec: ${fullCommand}`);

    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        maxBuffer: 50 * 1024 * 1024,
        shell: 'bash',
      });
      if (
        stderr &&
        !stderr.includes('warning') &&
        !stderr.toLowerCase().includes('already exists') &&
        !stderr.toLowerCase().includes('already up to date')
      ) {
        this.logger.debug(`stderr: ${stderr}`);
      }
      return stdout.trim();
    } catch (error: any) {
      // Some git commands return non-zero for valid states
      if (error.stdout) return error.stdout.trim();
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  private getHiddenCheckpointsPath(project: string): string {
    return path.join(
      this.workspaceDir,
      project,
      '.etienne',
      'hidden-checkpoints.json',
    );
  }

  private async readHiddenCheckpoints(project: string): Promise<string[]> {
    try {
      const content = await fs.readFile(
        this.getHiddenCheckpointsPath(project),
        'utf-8',
      );
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async writeHiddenCheckpoints(
    project: string,
    hashes: string[],
  ): Promise<void> {
    const filePath = this.getHiddenCheckpointsPath(project);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(hashes, null, 2), 'utf-8');
  }

  // ── Repo initialization ──

  private async ensureProjectRepo(project: string): Promise<void> {
    if (this.initializedProjects.has(project)) return;

    const projectPath = this.getProjectPath(project);
    const username = await this.getGiteaUsername();
    const repoName = this.getRepoName(project);

    // 1. Ensure Gitea repo exists
    try {
      await this.axiosClient.get(`/repos/${username}/${repoName}`);
      this.logger.debug(`Gitea repo ${repoName} exists`);
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log(`Creating Gitea repo ${repoName}`);
        await this.axiosClient.post('/user/repos', {
          name: repoName,
          description: `Workspace project: ${project}`,
          private: false,
          auto_init: false,
        });
      } else {
        throw error;
      }
    }

    // 2. Ensure local git repo
    const projectPathMsys = this.toMsysPath(projectPath);
    let isGitRepo = false;
    try {
      const result = await execAsync(
        `cd "${projectPathMsys}" && git rev-parse --git-dir 2>/dev/null`,
        { shell: 'bash' },
      );
      isGitRepo = result.stdout.trim() === '.git';
    } catch {
      isGitRepo = false;
    }

    const remoteUrl = await this.getRemoteUrl(project);

    if (!isGitRepo) {
      this.logger.log(`Initializing git repo in ${project}`);
      await execAsync(`cd "${projectPathMsys}" && git init`, {
        shell: 'bash',
      });
      await execAsync(
        `cd "${projectPathMsys}" && git remote add origin "${remoteUrl}"`,
        { shell: 'bash' },
      );
      await execAsync(
        `cd "${projectPathMsys}" && git config user.email "checkpoint@workspace.local" && git config user.name "Workspace Checkpoint"`,
        { shell: 'bash' },
      );
    } else {
      // Ensure remote URL is correct
      try {
        await execAsync(
          `cd "${projectPathMsys}" && git remote set-url origin "${remoteUrl}"`,
          { shell: 'bash' },
        );
      } catch {
        await execAsync(
          `cd "${projectPathMsys}" && git remote add origin "${remoteUrl}"`,
          { shell: 'bash' },
        );
      }
    }

    // 3. Create .gitignore if missing
    const gitignorePath = path.join(projectPath, '.gitignore');
    try {
      await fs.access(gitignorePath);
    } catch {
      const gitignoreContent = `.etienne/
.claude/
node_modules/
`;
      await fs.writeFile(gitignorePath, gitignoreContent, 'utf-8');
      this.logger.log(`Created .gitignore for ${project}`);
    }

    // 4. If Gitea has commits but local repo is empty, pull
    try {
      const hasLocalCommits = await execAsync(
        `cd "${projectPathMsys}" && git rev-parse HEAD 2>/dev/null`,
        { shell: 'bash' },
      );
      // Local has commits, nothing to do
    } catch {
      // No local commits — try to pull from remote
      try {
        await execAsync(
          `cd "${projectPathMsys}" && git fetch origin main 2>/dev/null && git checkout -b main origin/main 2>/dev/null`,
          { shell: 'bash' },
        );
        this.logger.log(`Pulled initial commits from Gitea for ${project}`);
      } catch {
        // Remote also empty or doesn't have main — that's fine
        this.logger.debug(
          `No remote commits to pull for ${project}`,
        );
      }
    }

    this.initializedProjects.add(project);
  }

  // ── ICheckpointProvider — existing methods ──

  async backup(project: string, message: string): Promise<string> {
    if (!message || typeof message !== 'string') {
      throw new Error('Checkpoint message is required');
    }

    await this.ensureProjectRepo(project);

    // Stage all changes
    await this.execInProject(project, 'git add -A');

    // Check if there are changes to commit
    const status = await this.execInProject(
      project,
      'git status --porcelain',
    );

    if (!status) {
      this.logger.warn('No changes to commit');
      // Return the latest commit hash
      try {
        const head = await this.execInProject(
          project,
          "git log -1 --format='%H'",
        );
        return head.replace(/'/g, '');
      } catch {
        return 'no-changes';
      }
    }

    // Escape message for shell
    const escapedMessage = message.replace(/'/g, "'\\''");

    // Commit
    await this.execInProject(
      project,
      `git commit -m '${escapedMessage}'`,
    );

    // Get commit hash
    const commitHash = await this.execInProject(
      project,
      "git log -1 --format='%H'",
    );
    const hash = commitHash.replace(/'/g, '');

    // Push to Gitea
    try {
      await this.execInProject(project, 'git push origin main 2>&1');
    } catch (pushError: any) {
      // If push fails because remote has diverged, try with --force
      this.logger.warn(`Push failed, trying force push: ${pushError.message}`);
      await this.execInProject(
        project,
        'git push --force origin main 2>&1',
      );
    }

    this.logger.log(`Checkpoint created for ${project}: ${hash}`);
    return hash;
  }

  async restore(project: string, commitHash: string): Promise<void> {
    await this.ensureProjectRepo(project);

    this.logger.log(
      `Restoring project ${project} from commit ${commitHash}`,
    );

    // Checkout all files from the specified commit
    await this.execInProject(
      project,
      `git checkout ${commitHash} -- .`,
    );

    // Ensure .gitignore is restored from HEAD (in case it was different)
    try {
      await this.execInProject(
        project,
        'git checkout HEAD -- .gitignore',
      );
    } catch {
      // .gitignore might not exist in HEAD
    }

    this.logger.log(
      `Project ${project} restored from commit ${commitHash}`,
    );
  }

  async list(project: string): Promise<Checkpoint[]> {
    await this.ensureProjectRepo(project);

    try {
      const log = await this.execInProject(
        project,
        "git log --format='%H|||%s|||%aI' main 2>/dev/null",
      );

      if (!log) return [];

      const hidden = await this.readHiddenCheckpoints(project);
      const hiddenSet = new Set(hidden);

      return log
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const clean = line.replace(/^'|'$/g, '');
          const [gitId, commit, timestamp] = clean.split('|||');
          return {
            timestamp_created: timestamp,
            commit,
            gitId,
          };
        })
        .filter((cp) => !hiddenSet.has(cp.gitId));
    } catch {
      // No commits yet
      return [];
    }
  }

  async delete(project: string, commitHash: string): Promise<void> {
    this.logger.log(
      `Soft-deleting checkpoint ${commitHash} for ${project}`,
    );

    const hidden = await this.readHiddenCheckpoints(project);
    if (!hidden.includes(commitHash)) {
      hidden.push(commitHash);
      await this.writeHiddenCheckpoints(project, hidden);
    }
  }

  // ── ICheckpointProvider — new methods ──

  async getChanges(project: string): Promise<FileChange[]> {
    await this.ensureProjectRepo(project);

    const status = await this.execInProject(
      project,
      'git status --porcelain',
    );

    if (!status) return [];

    return status
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line.length > 0)
      .map((line) => {
        // git status --porcelain format: XY<space>PATH
        // Match two status chars, then a space, then the rest as the file path
        const match = line.match(/^(.)(.) (.+)$/);
        if (!match) return null;

        const x = match[1]; // index status
        const y = match[2]; // worktree status
        const filePath = match[3];

        let fileStatus: FileChange['status'];

        if (x === '?' && y === '?') {
          fileStatus = 'untracked';
        } else if (x === 'A' || y === 'A') {
          fileStatus = 'added';
        } else if (x === 'D' || y === 'D') {
          fileStatus = 'deleted';
        } else if (x === 'R' || y === 'R') {
          fileStatus = 'renamed';
        } else {
          fileStatus = 'modified';
        }

        return { path: filePath, status: fileStatus };
      })
      .filter((entry): entry is FileChange => entry !== null);
  }

  async discardFile(project: string, filePath: string): Promise<void> {
    await this.ensureProjectRepo(project);

    // Check if file is tracked
    try {
      await this.execInProject(
        project,
        `git ls-files --error-unmatch "${filePath}" 2>/dev/null`,
      );
      // File is tracked — checkout from HEAD
      await this.execInProject(
        project,
        `git checkout HEAD -- "${filePath}"`,
      );
    } catch {
      // File is untracked — delete it
      const fullPath = path.join(this.getProjectPath(project), filePath);
      try {
        await fs.unlink(fullPath);
        this.logger.log(`Deleted untracked file: ${filePath}`);
      } catch (err: any) {
        throw new Error(`Failed to discard ${filePath}: ${err.message}`);
      }
    }
  }

  async getCommitFiles(
    project: string,
    commitHash: string,
  ): Promise<FileChange[]> {
    await this.ensureProjectRepo(project);

    try {
      const result = await this.execInProject(
        project,
        `git diff-tree --no-commit-id -r --name-status ${commitHash}`,
      );

      if (!result) return [];

      return result
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.split('\t');
          const statusChar = parts[0].trim();
          const filePath = parts[1]?.trim() || '';

          let fileStatus: FileChange['status'];
          switch (statusChar[0]) {
            case 'A':
              fileStatus = 'added';
              break;
            case 'D':
              fileStatus = 'deleted';
              break;
            case 'R':
              fileStatus = 'renamed';
              break;
            case 'M':
            default:
              fileStatus = 'modified';
              break;
          }

          return { path: filePath, status: fileStatus };
        });
    } catch {
      return [];
    }
  }

  async createTag(
    project: string,
    tagName: string,
    message: string,
  ): Promise<void> {
    await this.ensureProjectRepo(project);

    const escapedMessage = message.replace(/'/g, "'\\''");
    const escapedTag = tagName.replace(/'/g, "'\\''");

    await this.execInProject(
      project,
      `git tag -a '${escapedTag}' -m '${escapedMessage}'`,
    );

    try {
      await this.execInProject(
        project,
        `git push origin '${escapedTag}' 2>&1`,
      );
    } catch (error: any) {
      this.logger.warn(`Failed to push tag ${tagName}: ${error.message}`);
    }

    this.logger.log(`Created tag ${tagName} for ${project}`);
  }

  async listTags(project: string): Promise<GitTag[]> {
    await this.ensureProjectRepo(project);

    try {
      const result = await this.execInProject(
        project,
        "git tag -l --format='%(refname:short)|||%(creatordate:iso)|||%(subject)' --sort=-creatordate",
      );

      if (!result) return [];

      return result
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const clean = line.replace(/^'|'$/g, '');
          const [name, date, ...messageParts] = clean.split('|||');
          return {
            name,
            date,
            message: messageParts.join('|||'),
          };
        });
    } catch {
      return [];
    }
  }

  async checkConnection(): Promise<GitConnectionStatus> {
    try {
      const response = await this.axiosClient.get('/user');
      const login: string = response.data.login;
      this.giteaActualUsername = login;
      return {
        connected: true,
        url: this.giteaUrl,
        username: login,
      };
    } catch (error: any) {
      const message =
        error.response?.status === 401
          ? 'Authentication failed — invalid credentials'
          : error.code === 'ECONNREFUSED'
            ? 'Connection refused — Gitea server not reachable'
            : error.message;
      return {
        connected: false,
        url: this.giteaUrl,
        username: this.giteaUsername,
        error: message,
      };
    }
  }
}
