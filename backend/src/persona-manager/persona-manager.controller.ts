import { Controller, Get, Post, Body, Res, HttpStatus } from '@nestjs/common';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { PersonaManagerService, PersonalityDto } from './persona-manager.service';

class GenerateAvatarDto {
  @IsString()
  @IsNotEmpty()
  avatarDescription: string;
}

class InstallPersonaDto {
  @IsObject()
  personality: PersonalityDto;

  @IsString()
  @IsOptional()
  zipFilename?: string;
}

@Controller('api/persona-manager')
export class PersonaManagerController {
  constructor(private readonly personaManagerService: PersonaManagerService) {}

  @Get('persona-types')
  @Roles('user')
  async listPersonaTypes() {
    return this.personaManagerService.listPersonaTypes();
  }

  @Get('personality')
  @Roles('user')
  async getPersonality(@Res() res: Response) {
    const personality = await this.personaManagerService.getExistingPersonality();
    if (!personality) {
      return res.status(HttpStatus.NO_CONTENT).send();
    }
    return res.json(personality);
  }

  @Get('avatar')
  @Roles('user')
  async getAvatar(@Res() res: Response) {
    const base64 = await this.personaManagerService.getExistingAvatar();
    if (!base64) {
      return res.status(HttpStatus.NO_CONTENT).send();
    }
    return res.json({ image: base64 });
  }

  @Post('generate-avatar')
  @Roles('user')
  async generateAvatar(@Body() body: any) {
    const description = body?.avatarDescription;
    if (!description) {
      throw new Error(`Missing avatarDescription in body. Keys received: ${Object.keys(body || {}).join(', ')}`);
    }
    const base64 = await this.personaManagerService.generateAvatar(description);
    return { image: base64 };
  }

  @Post('upload-avatar')
  @Roles('user')
  async uploadAvatar(@Body() body: any) {
    const base64 = body?.image;
    if (!base64) {
      throw new Error('Missing image in body');
    }
    await this.personaManagerService.uploadAvatar(base64);
    return { success: true };
  }

  @Post('install')
  @Roles('user')
  async install(@Body() dto: InstallPersonaDto) {
    return this.personaManagerService.install(dto.personality, dto.zipFilename);
  }
}
