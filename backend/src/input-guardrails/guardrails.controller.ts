import { Controller, Get, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { GuardrailsService } from './guardrails.service';
import { Roles } from '../auth/roles.decorator';

class UpdateGuardrailsDto {
  @IsArray()
  @IsString({ each: true })
  enabled!: string[];
}

@Controller('api/guardrails')
export class GuardrailsController {
  constructor(private readonly guardrailsService: GuardrailsService) {}

  @Get(':project/input')
  async getConfig(@Param('project') project: string) {
    try {
      const config = await this.guardrailsService.getConfig(project);
      return {
        success: true,
        project,
        config,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Roles('user')
  @Post(':project/input')
  async updateConfig(
    @Param('project') project: string,
    @Body() dto: UpdateGuardrailsDto,
  ) {
    try {
      const config = await this.guardrailsService.updateConfig(project, dto.enabled);
      return {
        success: true,
        message: 'Guardrails configuration updated successfully',
        project,
        config,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
