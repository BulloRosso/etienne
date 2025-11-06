import { Module } from '@nestjs/common';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { GitCheckpointProvider } from './git-checkpoint.provider';
import { GiteaCheckpointProvider } from './gitea-checkpoint.provider';

@Module({
  controllers: [CheckpointsController],
  providers: [CheckpointsService, GitCheckpointProvider, GiteaCheckpointProvider],
  exports: [CheckpointsService],
})
export class CheckpointsModule {}
