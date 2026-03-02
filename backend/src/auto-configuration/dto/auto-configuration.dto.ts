import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// --- Suggest ---

export class AutoConfigSuggestDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsOptional()
  language?: string;
}

export interface SuggestedMcpServer {
  name: string;
  description: string;
  reason: string;
}

export interface SuggestedSkill {
  name: string;
  source: 'standard' | 'optional';
  description: string;
  reason: string;
}

export interface AutoConfigSuggestResponse {
  success: boolean;
  suggestedServers: SuggestedMcpServer[];
  suggestedSkills: SuggestedSkill[];
  reasoning: string;
}

// --- Apply ---

export class SkillSelection {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  source: 'standard' | 'optional';
}

export class AutoConfigApplyDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsArray()
  @IsString({ each: true })
  serverNames: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillSelection)
  skillNames: SkillSelection[];
}

export interface AutoConfigApplyResponse {
  success: boolean;
  configuredServers: string[];
  provisionedSkills: { name: string; success: boolean; error?: string }[];
}
