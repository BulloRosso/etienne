import { IsString, IsOptional, IsArray, IsObject, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class AgentRoleDto {
  @IsEnum(['registry', 'custom'])
  type: 'registry' | 'custom';

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  customContent?: string;
}

export class CreateProjectDto {
  @IsString()
  projectName: string;

  @IsString()
  missionBrief: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentRoleDto)
  agentRole?: AgentRoleDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedSkills?: string[];

  @IsOptional()
  @IsObject()
  mcpServers?: Record<string, any>;

  @IsOptional()
  @IsArray()
  a2aAgents?: any[];

  @IsOptional()
  @IsString()
  copyUIFrom?: string;

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsArray()
  autoFilePreviewExtensions?: Array<{ extension: string; viewer: string }>;

  @IsOptional()
  @IsString()
  language?: string;
}

export interface CreateProjectResult {
  success: boolean;
  projectName: string;
  errors?: string[];
  warnings?: string[];
  guidanceDocuments?: string[];
}
