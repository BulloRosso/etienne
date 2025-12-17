import { IsString, IsIn } from 'class-validator';

export class FeedbackDto {
  @IsString()
  spanId!: string;

  @IsIn(['up', 'down'])
  feedback!: 'up' | 'down';
}
