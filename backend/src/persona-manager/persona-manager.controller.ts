import { Controller, Get, Post, Body } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { PersonaManagerService, PersonalityDto } from './persona-manager.service';

class GenerateAvatarDto {
  avatarDescription: string;
}

class InstallPersonaDto {
  personality: PersonalityDto;
  zipFilename: string;
}

@Controller('api/persona-manager')
export class PersonaManagerController {
  constructor(private readonly personaManagerService: PersonaManagerService) {}

  @Get('persona-types')
  @Roles('user')
  async listPersonaTypes() {
    return this.personaManagerService.listPersonaTypes();
  }

  @Post('generate-avatar')
  @Roles('user')
  async generateAvatar(@Body() dto: GenerateAvatarDto) {
    const base64 = await this.personaManagerService.generateAvatar(dto.avatarDescription);
    return { image: base64 };
  }

  @Post('install')
  @Roles('user')
  async install(@Body() dto: InstallPersonaDto) {
    return this.personaManagerService.install(dto.personality, dto.zipFilename);
  }
}
