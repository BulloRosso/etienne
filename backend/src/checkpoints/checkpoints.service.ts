import { Injectable, Logger } from '@nestjs/common';
import {
  ICheckpointProvider,
  Checkpoint,
  FileChange,
  GitTag,
  GitConnectionStatus,
} from './checkpoint-provider.interface';
import { GitCheckpointProvider } from './git-checkpoint.provider';
import { GiteaCheckpointProvider } from './gitea-checkpoint.provider';
import { GiteaProjectCheckpointProvider } from './gitea-project-checkpoint.provider';

@Injectable()
export class CheckpointsService {
  private readonly logger = new Logger(CheckpointsService.name);
  private provider: ICheckpointProvider;

  constructor(
    private gitCheckpointProvider: GitCheckpointProvider,
    private giteaCheckpointProvider: GiteaCheckpointProvider,
    private giteaProjectCheckpointProvider: GiteaProjectCheckpointProvider,
  ) {
    // Select provider based on environment variable (defaults to gitea-project)
    const providerType = process.env.CHECKPOINT_PROVIDER || 'gitea-project';

    if (providerType === 'gitea-project') {
      this.provider = giteaProjectCheckpointProvider;
      this.logger.log('Using Gitea per-project checkpoint provider');
    } else if (providerType === 'gitea') {
      this.provider = giteaCheckpointProvider;
      this.logger.log('Using Gitea checkpoint provider (legacy)');
    } else if (providerType === 'git') {
      this.provider = gitCheckpointProvider;
      this.logger.log('Using Git checkpoint provider (fallback)');
    } else {
      this.logger.warn(
        `Unknown provider type: ${providerType}, defaulting to Gitea per-project`,
      );
      this.provider = giteaProjectCheckpointProvider;
    }
  }

  async createCheckpoint(project: string, message: string): Promise<string> {
    return await this.provider.backup(project, message);
  }

  async restoreCheckpoint(project: string, commitHash: string): Promise<void> {
    return await this.provider.restore(project, commitHash);
  }

  async listCheckpoints(project: string): Promise<Checkpoint[]> {
    return await this.provider.list(project);
  }

  async deleteCheckpoint(project: string, commitHash: string): Promise<void> {
    return await this.provider.delete(project, commitHash);
  }

  async getChanges(project: string): Promise<FileChange[]> {
    return await this.provider.getChanges(project);
  }

  async discardFile(project: string, filePath: string): Promise<void> {
    return await this.provider.discardFile(project, filePath);
  }

  async getCommitFiles(
    project: string,
    commitHash: string,
  ): Promise<FileChange[]> {
    return await this.provider.getCommitFiles(project, commitHash);
  }

  async createTag(
    project: string,
    tagName: string,
    message: string,
  ): Promise<void> {
    return await this.provider.createTag(project, tagName, message);
  }

  async listTags(project: string): Promise<GitTag[]> {
    return await this.provider.listTags(project);
  }

  async checkConnection(): Promise<GitConnectionStatus> {
    return await this.provider.checkConnection();
  }
}
