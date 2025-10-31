import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class StartResearchDto {
  @IsString()
  @IsNotEmpty()
  inputFile: string;

  @IsString()
  @IsOptional()
  outputFile?: string;
}
