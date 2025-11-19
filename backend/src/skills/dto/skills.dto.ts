import { IsString, IsNotEmpty } from 'class-validator';

export class SaveSkillDto {
  @IsString()
  @IsNotEmpty()
  skillName!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}
