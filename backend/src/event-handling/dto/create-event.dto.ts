import { IsString, IsOptional, IsObject, IsNotEmpty } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  group: string;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsObject()
  payload: any;
}
