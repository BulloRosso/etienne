import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { QuickActionsService } from './quick-actions.service';
import { QuickActionsDto } from './dto/quick-actions.dto';

@Controller('api/quick-actions')
export class QuickActionsController {
  constructor(private readonly quickActionsService: QuickActionsService) {}

  @Public()
  @Get()
  async get(): Promise<QuickActionsDto> {
    return this.quickActionsService.get();
  }

  @Post()
  @Roles('user')
  async save(@Body() body: QuickActionsDto): Promise<{ success: boolean }> {
    try {
      await this.quickActionsService.save(body);
      return { success: true };
    } catch (error: any) {
      throw new HttpException(
        `Failed to save quick actions: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
