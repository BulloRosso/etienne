import { IsString, IsIn, IsOptional } from 'class-validator';

export class FeedbackDto {
  @IsString()
  spanId!: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsIn(['up', 'down'])
  feedback!: 'up' | 'down';
}
