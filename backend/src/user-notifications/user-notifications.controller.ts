import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { UserNotificationsService } from './user-notifications.service';

@Controller('api/user-notifications')
export class UserNotificationsController {
  constructor(private readonly service: UserNotificationsService) {}

  @Get()
  async getChannels(@Query('projectName') projectName: string) {
    const channels = await this.service.getChannels(projectName);
    return { channels };
  }

  @Post('send')
  async sendNotifications(
    @Body() body: { projectName: string; channels: string[]; summary: string; email?: string },
  ) {
    const results = await this.service.sendNotifications(
      body.projectName,
      body.channels,
      body.summary,
      body.email,
    );
    return { results };
  }
}
