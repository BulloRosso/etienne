import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  HttpException,
  HttpStatus,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { ApplicationTypesService } from './application-types.service';
import { SetApplicationTypeDto } from './dto/set-application-type.dto';

@Controller('api/application-types')
export class ApplicationTypesController {
  constructor(private readonly service: ApplicationTypesService) {}

  @Get()
  async list(@Query('lng') lng?: string) {
    const types = await this.service.listApplicationTypes(lng || 'en');
    return { applicationTypes: types };
  }

  @Get('effective/:project')
  async getEffective(
    @Param('project') project: string,
    @Query('lng') lng?: string,
  ) {
    const config = await this.service.getEffectiveConfig(project, lng || 'en');
    return { config };
  }

  @Put('project/:project')
  @Roles('user')
  async setForProject(
    @Param('project') project: string,
    @Body() dto: SetApplicationTypeDto,
  ) {
    try {
      await this.service.setProjectApplicationType(project, dto.id ?? null);
      return { success: true };
    } catch (err: any) {
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id/thumbnail')
  @Public()
  async getThumbnail(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.getThumbnailPath(id);
    if (!file) {
      throw new HttpException('Thumbnail not found', HttpStatus.NOT_FOUND);
    }
    res.set({ 'Content-Type': 'image/png' });
    return new StreamableFile(createReadStream(file));
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const config = await this.service.getApplicationType(id);
    if (!config) {
      throw new HttpException('Application type not found', HttpStatus.NOT_FOUND);
    }
    return { applicationType: config };
  }
}
