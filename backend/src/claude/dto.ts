import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class SendPromptDto {
  @IsString() @IsNotEmpty() project_dir!: string;
  @IsString() @IsNotEmpty() prompt!: string;
}

export class AddFileDto {
  @IsString() @IsNotEmpty() project_dir!: string;
  @IsString() @IsNotEmpty() file_name!: string;
  @IsString() @IsNotEmpty() file_content!: string;
}

export class GetFileDto {
  @IsString() @IsNotEmpty() project_dir!: string;
  @IsString() @IsNotEmpty() file_name!: string;
}

export class ListFilesDto {
  @IsString() @IsNotEmpty() project_dir!: string;
  @IsOptional() @IsString() sub_dir?: string;
}
