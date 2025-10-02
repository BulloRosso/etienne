import { IsNotEmpty, IsString } from 'class-validator';

export class GetInterceptorsDto {
  @IsString() @IsNotEmpty() project!: string;
}
