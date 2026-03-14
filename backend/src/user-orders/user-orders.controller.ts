import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { UserOrdersService } from './user-orders.service';

@Controller('api/user-orders')
export class UserOrdersController {
  constructor(private readonly userOrdersService: UserOrdersService) {}

  @Get('active')
  async getActive() {
    try {
      const orders = await this.userOrdersService.getActiveOrders();
      return { success: true, orders };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('history')
  async getHistory() {
    try {
      const orders = await this.userOrdersService.getHistoryOrders();
      return { success: true, orders };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':orderId')
  async updateOrder(
    @Param('orderId') orderId: string,
    @Body() body: { status: string; statusMessage: string },
  ) {
    try {
      if (!body.status || !body.statusMessage) {
        throw new HttpException(
          { success: false, message: 'status and statusMessage are required' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const order = await this.userOrdersService.updateOrder(
        orderId,
        body.status as any,
        body.statusMessage,
      );

      if (!order) {
        throw new HttpException(
          { success: false, message: `Order '${orderId}' not found` },
          HttpStatus.NOT_FOUND,
        );
      }

      return { success: true, order };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
