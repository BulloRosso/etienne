import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export interface SkillDependency {
  name: string;
  packageManager: 'npm' | 'pypi';
}

export interface SkillEnvVar {
  name: string;
  description: string;
  exampleFormat?: string;
}

export interface SkillDependencies {
  binaries?: SkillDependency[];
  envVars?: SkillEnvVar[];
}

export interface SkillMetadata {
  creator?: {
    name: string;
    email?: string;
  };
  version: string;
  categories?: string[];
  comments?: string;
  knownIssues?: {
    description: string;
    ticketId?: string;
  }[];
}

export interface CatalogSkill {
  name: string;
  source: 'standard' | 'optional';
  description?: string;
  metadata?: SkillMetadata;
  dependencies?: SkillDependencies;
  hasThumbnail: boolean;
}

export interface ModificationResult {
  status: 'current' | 'updated' | 'refined' | 'not-provisioned';
  changedFiles?: string[];
}

export interface ReviewRequest {
  id: string;
  skillName: string;
  submittedBy: string;
  submittedAt: string;
  fileName: string;
  source?: 'standard' | 'optional';
}

export class SaveSkillMetadataDto {
  @IsString()
  skillName!: string;

  metadata!: SkillMetadata;
}

export class SaveSkillDependenciesDto {
  @IsString()
  skillName!: string;

  dependencies!: SkillDependencies;
}
