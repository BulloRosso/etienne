import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export interface RepositorySkill {
  name: string;
  source: 'standard' | 'optional';
  description?: string;
}

export class ProvisionSkillsDto {
  @IsArray()
  @IsString({ each: true })
  skillNames: string[];

  @IsEnum(['standard', 'optional'])
  source: 'standard' | 'optional';
}

export interface ProvisionResult {
  skillName: string;
  success: boolean;
  error?: string;
}
