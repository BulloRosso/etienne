import { Controller, Post, Body, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackDto } from './dto/feedback.dto';

@Controller('api/feedback')
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  async submitFeedback(@Body() dto: FeedbackDto): Promise<{ success: boolean }> {
    try {
      this.logger.log(
        `Received feedback: spanId=${dto.spanId}, traceId=${dto.traceId || '-'}, feedback=${dto.feedback}`
      );
      await this.feedbackService.submitFeedback(dto.spanId, dto.traceId, dto.feedback);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to submit feedback: ${error?.message}`, error?.stack);
      throw new HttpException(
        `Failed to submit feedback: ${error?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
