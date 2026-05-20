import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class SetApplicationTypeDto {
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  id: string | null;
}
