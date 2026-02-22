import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class TestScenarioDto {
  @IsString()
  @IsNotEmpty()
  project: string;

  @IsObject()
  @IsOptional()
  editedProperties?: Record<string, Record<string, string>>;
}
