import { Module } from '@nestjs/common';
import { CollaborationService } from './collaboration.service';
import { CollaborationController } from './collaboration.controller';
import { ProjectsModule } from '../projects/projects.module';
import { A2ASettingsModule } from '../a2a-settings/a2a-settings.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [ProjectsModule, A2ASettingsModule, SkillsModule],
  controllers: [CollaborationController],
  providers: [CollaborationService],
  exports: [CollaborationService],
})
export class CollaborationModule {}
