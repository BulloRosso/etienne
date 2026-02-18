import { Controller, Get, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { IsBoolean, IsString, IsArray, IsOptional } from 'class-validator';
import { OutputGuardrailsService } from './output-guardrails.service';
import { Roles } from '../auth/roles.decorator';

class UpdateOutputGuardrailsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  prompt?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  violationsEnum?: string[];
}

@Controller('api/guardrails')
export class OutputGuardrailsController {
  constructor(private readonly outputGuardrailsService: OutputGuardrailsService) {}

  @Get(':project/output')
  async getConfig(@Param('project') project: string) {
    try {
      const config = await this.outputGuardrailsService.getConfig(project);
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
  @Post(':project/output')
  async updateConfig(
    @Param('project') project: string,
    @Body() dto: UpdateOutputGuardrailsDto,
  ) {
    try {
      const config = await this.outputGuardrailsService.updateConfig(project, dto);
      return {
        success: true,
        message: 'Output guardrails configuration updated successfully',
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
