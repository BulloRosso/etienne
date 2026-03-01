import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AutoConfigurationService } from './auto-configuration.service';
import {
  AutoConfigSuggestDto,
  AutoConfigApplyDto,
  AutoConfigSuggestResponse,
  AutoConfigApplyResponse,
} from './dto/auto-configuration.dto';

@Controller('api/auto-configuration')
export class AutoConfigurationController {
  constructor(private readonly autoConfigService: AutoConfigurationService) {}

  @Post('suggest')
  @Roles('user')
  async suggest(@Body() dto: AutoConfigSuggestDto): Promise<AutoConfigSuggestResponse> {
    try {
      return await this.autoConfigService.suggest(dto.projectName, dto.sessionId);
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('apply')
  @Roles('user')
  async apply(@Body() dto: AutoConfigApplyDto): Promise<AutoConfigApplyResponse> {
    try {
      return await this.autoConfigService.apply(
        dto.projectName,
        dto.serverNames,
        dto.skillNames,
      );
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
