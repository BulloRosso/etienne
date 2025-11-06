import { Injectable, Logger } from '@nestjs/common';
import { ICheckpointProvider, Checkpoint } from './checkpoint-provider.interface';
import { GitCheckpointProvider } from './git-checkpoint.provider';
import { GiteaCheckpointProvider } from './gitea-checkpoint.provider';

@Injectable()
export class CheckpointsService {
  private readonly logger = new Logger(CheckpointsService.name);
  private provider: ICheckpointProvider;

  constructor(
    private gitCheckpointProvider: GitCheckpointProvider,
    private giteaCheckpointProvider: GiteaCheckpointProvider,
  ) {
    // Select provider based on environment variable (defaults to gitea)
    const providerType = process.env.CHECKPOINT_PROVIDER || 'gitea';

    if (providerType === 'gitea') {
      this.provider = giteaCheckpointProvider;
      this.logger.log('Using Gitea checkpoint provider');
    } else if (providerType === 'git') {
      this.provider = gitCheckpointProvider;
      this.logger.log('Using Git checkpoint provider (fallback)');
    } else {
      this.logger.warn(`Unknown provider type: ${providerType}, defaulting to Gitea`);
      this.provider = giteaCheckpointProvider;
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
}
