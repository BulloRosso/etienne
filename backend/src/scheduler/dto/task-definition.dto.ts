import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class TaskDefinitionDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsNotEmpty()
  cronExpression: string;

  @IsString()
  @IsOptional()
  timeZone?: string;

  @IsOptional()
  @IsIn(['recurring', 'one-time'])
  type?: 'recurring' | 'one-time';
}

export class TaskHistoryEntryDto {
  timestamp: string;
  name: string;
  response: string;
  isError: boolean;
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
}
