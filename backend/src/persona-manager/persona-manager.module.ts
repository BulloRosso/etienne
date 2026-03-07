import { Module } from '@nestjs/common';
import { PersonaManagerController } from './persona-manager.controller';
import { PersonaManagerService } from './persona-manager.service';
import { ProjectsModule } from '../projects/projects.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ProjectsModule, SessionsModule],
  controllers: [PersonaManagerController],
  providers: [PersonaManagerService],
  exports: [PersonaManagerService],
})
export class PersonaManagerModule {}
