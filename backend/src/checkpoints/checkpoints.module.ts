import { Module } from '@nestjs/common';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { GitCheckpointProvider } from './git-checkpoint.provider';
import { GiteaCheckpointProvider } from './gitea-checkpoint.provider';
import { GiteaProjectCheckpointProvider } from './gitea-project-checkpoint.provider';

@Module({
  controllers: [CheckpointsController],
  providers: [CheckpointsService, GitCheckpointProvider, GiteaCheckpointProvider, GiteaProjectCheckpointProvider],
  exports: [CheckpointsService],
})
export class CheckpointsModule {}
