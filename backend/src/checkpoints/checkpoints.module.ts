import { Module } from '@nestjs/common';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { GitCheckpointProvider } from './git-checkpoint.provider';

@Module({
  controllers: [CheckpointsController],
  providers: [CheckpointsService, GitCheckpointProvider],
  exports: [CheckpointsService],
})
export class CheckpointsModule {}
