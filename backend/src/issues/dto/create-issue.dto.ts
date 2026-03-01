import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateIssueDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  stepsToReproduce?: string;

  @IsString()
  @IsOptional()
  expectedBehavior?: string;

  @IsString()
  @IsOptional()
  actualBehavior?: string;
}
