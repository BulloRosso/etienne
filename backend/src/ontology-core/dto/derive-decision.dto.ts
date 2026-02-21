import { IsString, IsNotEmpty, IsArray, IsOptional, IsObject } from 'class-validator';

export class DeriveDecisionDto {
  @IsString()
  @IsNotEmpty()
  project: string;

  @IsArray()
  @IsOptional()
  chatHistory?: Array<{ role: string; content: string }>;

  @IsString()
  @IsNotEmpty()
  userMessage: string;
}

export class SaveGraphDto {
  @IsString()
  @IsNotEmpty()
  project: string;

  @IsObject()
  @IsNotEmpty()
  graph: any;
}

export class UpdateActionStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;
}
