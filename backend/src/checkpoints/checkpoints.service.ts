import { Injectable } from '@nestjs/common';
import { ICheckpointProvider, Checkpoint } from './checkpoint-provider.interface';
import { GitCheckpointProvider } from './git-checkpoint.provider';

@Injectable()
export class CheckpointsService {
  private provider: ICheckpointProvider;

  constructor(gitCheckpointProvider: GitCheckpointProvider) {
    // Currently using only Git provider, but architecture allows for other providers
    this.provider = gitCheckpointProvider;
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
