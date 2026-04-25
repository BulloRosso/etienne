import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RecentItemsService } from './recent-items.service';

@Controller('api/recent-items')
export class RecentItemsController {
  constructor(private readonly recentItemsService: RecentItemsService) {}

  @Get()
  async getRecentItems() {
    try {
      const items = await this.recentItemsService.loadRecentItems();
      return { success: true, ...items };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('project')
  async trackProject(@Body() body: { name: string }) {
    try {
      if (!body.name) {
        throw new HttpException(
          { success: false, message: 'name is required' },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.recentItemsService.trackProject(body.name);
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('chat')
  async trackChat(
    @Body() body: { projectName: string; sessionId: string; title: string },
  ) {
    try {
      if (!body.projectName || !body.sessionId || !body.title) {
        throw new HttpException(
          { success: false, message: 'projectName, sessionId, and title are required' },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.recentItemsService.trackChat(
        body.projectName,
        body.sessionId,
        body.title,
      );
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('notification')
  async trackNotification(
    @Body() body: { text: string; projectName: string },
  ) {
    try {
      if (!body.text || !body.projectName) {
        throw new HttpException(
          { success: false, message: 'text and projectName are required' },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.recentItemsService.trackNotification(
        body.text,
        body.projectName,
      );
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('notification/:index')
  async removeNotification(@Param('index') index: string) {
    try {
      const idx = parseInt(index, 10);
      if (isNaN(idx) || idx < 0) {
        throw new HttpException(
          { success: false, message: 'Valid index is required' },
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.recentItemsService.removeNotification(idx);
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
