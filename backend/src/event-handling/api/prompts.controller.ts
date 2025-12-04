import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { PromptsStorageService, Prompt } from '../core/prompts-storage.service';
import { randomUUID } from 'crypto';

class CreatePromptDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

class UpdatePromptDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;
}

@Controller('api/prompts')
export class PromptsController {
  constructor(private readonly promptsStorage: PromptsStorageService) {}

  @Get(':project')
  async getPrompts(@Param('project') project: string) {
    const prompts = await this.promptsStorage.loadPrompts(project);
    return { success: true, prompts };
  }

  @Get(':project/:promptId')
  async getPrompt(
    @Param('project') project: string,
    @Param('promptId') promptId: string,
  ) {
    const prompt = await this.promptsStorage.getPrompt(project, promptId);

    if (!prompt) {
      throw new HttpException('Prompt not found', HttpStatus.NOT_FOUND);
    }

    return { success: true, prompt };
  }

  @Post(':project')
  async createPrompt(
    @Param('project') project: string,
    @Body() body: CreatePromptDto,
  ) {
    if (!body.title || !body.content) {
      throw new HttpException(
        'Title and content are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date().toISOString();
    const prompt: Prompt = {
      id: randomUUID(),
      title: body.title,
      content: body.content,
      createdAt: now,
      updatedAt: now,
    };

    await this.promptsStorage.addPrompt(project, prompt);

    return { success: true, prompt };
  }

  @Put(':project/:promptId')
  async updatePrompt(
    @Param('project') project: string,
    @Param('promptId') promptId: string,
    @Body() body: UpdatePromptDto,
  ) {
    const updated = await this.promptsStorage.updatePrompt(project, promptId, body);

    if (!updated) {
      throw new HttpException('Prompt not found', HttpStatus.NOT_FOUND);
    }

    return { success: true, prompt: updated };
  }

  @Delete(':project/:promptId')
  async deletePrompt(
    @Param('project') project: string,
    @Param('promptId') promptId: string,
  ) {
    const deleted = await this.promptsStorage.deletePrompt(project, promptId);

    if (!deleted) {
      throw new HttpException('Prompt not found', HttpStatus.NOT_FOUND);
    }

    return { success: true };
  }
}
